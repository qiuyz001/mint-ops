# RUNBOOK · Gang 扫盘（生产跑法）

> 面向：接手运维的 agent / 人。目标：**脚本 7×24 自动跑，AI 只在有事时被叫一次。**
> 相关设计说明见 [`README-WATCH.md`](./README-WATCH.md)。

---

## 0. 一句话

```
每 1–2 分钟跑一次 `node scripts/gang-watch.mjs`
  → exit 0  ：什么都没发生，不花钱
  → exit 10 ：有 HIGH 信号，读 data/gang/prompt.txt 交给模型
  → exit 11 ：平台改版 / 新玩法，读 data/gang/ai-queue.jsonl
  → exit 1  ：抓取失败（网络问题，不是"没盘"）
```

---

## 1. 安装与自检（首次 3 分钟）

```bash
git clone https://github.com/qiuyz001/mint-ops.git
cd mint-ops
npm ci

npm run check          # 语法检查（含 src/watch/*）
npm run test:prompt    # 验证 digest / queue / prompt 的格式与大小
node scripts/gang-watch.mjs   # 跑一次，输出「建立基线」= 正常
```

> **首次运行只建基线、不报警**，这是设计如此：否则会把整榜当成"新盘"刷屏。

---

## 2. 生产调度（推荐 cron once）

```bash
# 每 1 分钟一次；只有 10/11 才去叫模型
*/1 * * * * cd /path/to/mint-ops && \
  node scripts/gang-watch.mjs >> data/gang/cron.log 2>&1; \
  code=$?; \
  if [ $code -eq 10 ] || [ $code -eq 11 ]; then \
     <通知你 / 把 data/gang/prompt.txt 交给模型>; \
  fi
```

**不要**把 `--watch` 放进生产（虽然已修复内存基线问题，但进程崩了/内存增长都没有 cron 稳）。
`--watch` 只用于联调：

```bash
node scripts/gang-watch.mjs --watch            # 有 HIGH 就退出(10/11)，唤醒上层
node scripts/gang-watch.mjs --watch --stay     # 只写文件，永不退出
```

### 退出码含义

| 码 | 含义 | 上层动作 |
|---|---|---|
| `0` | 无 HIGH 信号 | 什么都不做（**0 token**） |
| `10` | HIGH 信号（新盘爆量 / 打满 / 速度异常） | 读 `data/gang/prompt.txt` → 模型分析 |
| `11` | 抗漂移（新 track / 字段变化 / 空榜二连） | 读 `data/gang/ai-queue.jsonl`，可能要改配置 |
| `1` | 抓取失败 | 查网络/代理，**不要当成"没盘"** |

---

## 3. 三条纪律

| 纪律 | 原因 |
|---|---|
| **同一个 `data/` 目录只能有一个实例** | 两个进程会互相覆盖 `current.json`，导致漏报/重复报 |
| **日志给人看，模型只看 `prompt.txt`** | 把每轮日志喂进上下文 = 一天 4 万 tokens；只看 prompt = 0–5 次/天 |
| **`data/` 不提交** | 已在 `.gitignore`；里面是游标/状态/归档 |

---

## 4. 环境差异（很重要）

| 情况 | 处理 |
|---|---|
| 直连 `gang.fun` 正常 | 不需要任何额外配置 |
| 被墙 / 连接重置 | 加代理预加载：`NODE_OPTIONS=--require <proxy.cjs>`（否则永远 exit 1） |
| 公司网络限流 | 把 `pollSec` 调到 120–300，或降低 `limit` |

> `exit 1` 只代表抓取失败。脚本不会因为抓不到就把榜当空的（那会误报漂移）。

---

## 5. 配置速查（`config/watch.json`）

```jsonc
{
  "gang": {
    "kinds": ["fly", "fair", "v3", "stocks"],     // 要扫的榜
    "knownTracks": ["main","v3","fly","fair","stocks"], // 出现其它 → NEW_MODE
    "pollSec": 20,                                 // --watch 的间隔（cron 用不到）
    "limit": 60,                                   // 每榜取多少条
    "progressLadder": [10, 25, 50, 75, 95],        // 进度跨档才发信号
    "velocityPctPerMin": 3,                        // 速度阈值（%/分钟）
    "freshTradesIn5Min": 20,                       // 新盘爆量阈值
    "fillFastMinutes": 30,                         // 30 分钟内打满 → FAST_FILL
    "baselineResetAfterMin": 60,                   // 停机超 60min → 首轮只建基线
    "emptyStreakThreshold": 2                      // 空榜连续 2 次才报
  },
  "digest": { "topN": 6, "maxBytes": 3500 },
  "ai": {
    "promptFile": "prompt.txt",
    "maxQueueItemsPerRun": 3,
    "ladderMinStepForQueue": 50,                   // 进度≥50% 的阶梯才进队列
    "onlySignals": ["NEW_MODE","SCHEMA_DRIFT","FAST_FILL","VELOCITY_SPIKE","GRADUATED","PROGRESS_LADDER"]
  }
}
```

**调参原则：宁可阈值高、宁可漏，也别让 AI 读噪音。**
真要放宽，先放宽 `progressLadder`，不要放宽 `onlySignals`。

---

## 6. 信号词典

| 类型 | 优先级 | 类别 | 含义 | 会叫 AI |
|---|---|---|---|---|
| `NEW_MODE` | high | intel | 出现没见过的 track（新玩法） | ✅ |
| `SCHEMA_DRIFT` | high | intel | 字段增删（聚合成一条 `+N/−M`）/ 空榜二连 | ✅ |
| `FAST_FILL` | high | intel | 30 分钟内打满 | ✅ |
| `GRADUATED` | high | intel | 打满（不限时） | ✅ |
| `VELOCITY_SPIKE` | high | actionable | 进度速度 ≥3%/分钟 | ✅ |
| `TRADE_BURST` | high | actionable | 新盘 5 分钟内 ≥20 笔 | ✅ |
| `PROGRESS_LADDER` | med | watch | 跨 10/25/50/75/95% | ≥50% 才进队列 |
| `NEW_TOKEN` | med | intel | 新进榜（够新或有成交） | ❌ |

> `intel` = 事后情报，**不是买入信号**；`actionable` = 可能有可观察窗口。

---

## 7. 产物与文件地图

```
data/gang/
├─ current.json        上一轮快照（下轮 diff 基线；别手改）
├─ meta.json           track/字段基线 + 空榜计数 + 去重表
├─ signals.jsonl       全部信号（含 med，追加式）
├─ digest.md           给 AI 的摘要（≤3.5KB）
├─ ai-queue.jsonl      只有 HIGH 才写（≤3 条/轮）
├─ prompt.txt          仅有 HIGH 时生成，否则自动删除（≈1.7–2.3KB）
├─ analysis.md         模型输出（自行追加）
├─ cron.log            调度日志（给人看）
└─ archive/            exit 10/11 时的 prompt/digest 快照（防止被下一轮覆盖）
```

代码：

```
src/watch/gang-api.js   抓取 + 归一化 + 抗漂移
src/watch/score.js      0-100 确定性打分
src/watch/signals.js    信号 + 去重 + digest + queue + prompt
scripts/gang-watch.mjs  入口（once / --watch）
scripts/gang-scan.mjs   链上事件全量扫（补漏，非实时）
src/watchers/launchpads.js  链上事件层（含 GANG_FLY kind=3、60s API 补盘）
```

---

## 8. 故障排查

| 现象 | 判断 | 处理 |
|---|---|---|
| 一直 `exit 1` | 网络/代理 | 手动 `curl https://gang.fun/api/market?kind=fly` 验证 |
| 一直没信号 | 可能市场真安静 | 看 `digest.md` 的榜单计数；再看最新币的 `createdAt` 距今多久 |
| 突然 `exit 11` 且 `+N/−M` | 平台改版 | 看 `ai-queue.jsonl` 的 `added/removed`；把新字段接进归一化 |
| `exit 11` 说"空榜二连" | 接口降级/限流 | 调低频率；连续多轮仍空则视为改版 |
| `NEW_TOKEN` 刷屏 | 多半是停机后首轮 | 确认 `baselineResetAfterMin` 生效（日志会标"建立基线"） |
| `prompt.txt` 不存在但 exit 10 | 不该发生 | 检查 `ai.promptFile` 配置与写权限 |

---

## 9. 已验证 / 未验证（截至 2026-10-31）

**已验证**
- 30 轮 × 2 次实跑：0 失败、单轮 ~1.4s
- 抓到一次**真实平台改版**（新增 `pad/padVersion/guardBps/twapWindow`，消失 `holders/soldTokens` 等 21 个字段）
- 稳态 29 轮 **0 信号 0 token**
- 聚合漂移（合成测试：删一个字段 → 只报 1 条 `+0/−1`）
- 长间隔基线重置（停机跨轮不再补课）

**未验证（等行情）**
- `TRADE_BURST` 升 high 后尚未遇到真实爆量盘
- `SCHEMA_DRIFT` 聚合尚未在真实改版中触发（只有合成测试）
- `FAST_FILL` 需要出现"30 分钟内打满"的盘

---

## 10. 成本

| 场景 | 消耗 |
|---|---|
| 每轮脚本 | 4 次 HTTP + ~1.4s CPU，**0 token** |
| 一天 1,440 轮（1 分钟） | **0 token**（日志不喂模型） |
| 每次 HIGH | 1 × `prompt.txt`（≈1.7–2.3KB）+ 输出 ≤5 行 |
| 实测频率 | 安静日 **0–2 次/天**；发盘日 5–15 次/天 |
