# Gang 扫盘：脚本干重活，AI 只读结论

> 核心目标：**能自动的绝不问模型，能算出的绝不叙述**。脚本负责"发现 + 变化检测 + 打分 + 去噪 + 落盘"，
> AI 只在"出现值得判断的信号"时被唤醒，读一份 ≤3.5KB 的摘要，产出 3 行分析。**没有信号时 AI 消耗为 0。**

---

## 一、扫盘逻辑（一次 cycle 做什么）

```
① 发现      GET https://gang.fun/api/market?kind=<fly|fair|v3|stocks>&sort=new&limit=60
             ↓  （纯 HTTP，不走 RPC / WSS，不受节点限流影响）
② 归一化    normalize() → 统一字段（address/symbol/track/progressPct/raiseTargetBnb/trades/createdAt/graduated…）
             ↓  同一代币可能出现在多个 kind，按 fly > fair > v3 > stocks 去重，字段互补
③ 抗漂移    detectDrift() 对比上轮的 track 集合、字段集合、顶层结构
             ↓  新增 track / 字段出现或消失 / 某 kind 由有数据变空  →  SCHEMA_DRIFT / NEW_MODE
④ 打分      rank() 确定性 0-100：进度、进度速度、交易密度、新鲜度、目标规模、是否打满、holders
             ↓
⑤ 信号      diff() 对比上轮快照：NEW_TOKEN / PROGRESS_LADDER / VELOCITY_SPIKE / GRADUATED / FAST_FILL / TRADE_BURST
             ↓  dedupe() 同类型+同地址 30 分钟内只发一次
⑥ 落盘      data/gang/current.json      上轮快照（用于下一轮 diff）
            data/gang/meta.json         漂移基线（tracks/fields/topLevelFields/counts）
            data/gang/signals.jsonl     追加式信号日志（机器可读）
            data/gang/digest.md         ★ 给 AI 的摘要（≤3.5KB）
            data/gang/ai-queue.jsonl    ★ 只有 HIGH 信号才进（每条一行，带证据 + ask）
```

**抗漂移的关键**：`kind` 列表不是唯一的入口，`knownTracks` 只是"预期值"。任何**没见过的 track、新增字段、字段消失、榜单突然变空**都会变成
`NEW_MODE` / `SCHEMA_DRIFT` 信号，而不是让脚本静默失效。这就是它能自动发现 fly、也能发现"下一个 fly"的原因。

---

## 二、谁做什么（明确边界）

### 脚本（确定性，0 token）

| 职责 | 实现 |
|---|---|
| 抓取榜单 | `src/watch/gang-api.js` → `fetchKind / fetchAll` |
| 字段归一化 + 多 kind 去重 | `normalize` + `scripts/gang-watch.mjs` 去重段 |
| 漂移检测 | `detectDrift`（track / 字段 / 顶层结构 / 空榜） |
| 打分排序 | `src/watch/score.js` → `rank` |
| 变化检测 + 去重 | `src/watch/signals.js` → `diff / dedupe` |
| 生成摘要 / 队列 | `buildDigest / buildAiQueue` |
| 退出码唤醒 | `exit 10`（HIGH 信号）/ `exit 11`（漂移） |

### AI（只在被唤醒时，读小文件）

| 职责 | 输入 | 输出 |
|---|---|---|
| 情报判断 | `data/gang/digest.md`（≤3.5KB）+ `ai-queue.jsonl`（≤3 条） | 3 行结论：这信号意味着什么 / 是否值得进一步采集 / 建议动作 |
| 按需补充采集 | 自己决定去查 holders、资金流、合约门禁 | 追加到 `data/gang/analysis.md` |

**AI 不需要**：轮询、解析原始 JSON、算进度、去重、判断"有没有变化"——这些脚本已经做完了。

---

## 三、怎么跑

```bash
node scripts/gang-watch.mjs                # 跑一次：打印信号 + 写 digest
node scripts/gang-watch.mjs --json         # 只输出机器可读 summary
node scripts/gang-watch.mjs --kind fly     # 只看持续铸造盘
node scripts/gang-watch.mjs --watch        # 常驻；HIGH 信号时退出(10/11) 唤起 AI
node scripts/gang-watch.mjs --watch --stay # 常驻且永不退出，只写文件
```

**退出码协议**（给 cron / harness / 上层 agent 用）：

| 码 | 含义 | 上层动作 |
|---|---|---|
| 0 | 正常，无 HIGH 信号 | 什么都不用做（0 token） |
| 10 | 出现 HIGH 信号（新盘/打满/速度异常） | 读 `digest.md` → 让 AI 分析 |
| 11 | 出现抗漂移事件（新模式/字段变化） | 优先看 `ai-queue.jsonl`，可能需要改配置 |
| 1 | 抓取失败 | 检查网络，不要误判为"没盘" |

---

## 四、配置（`config/watch.json`）

```json
{
  "gang": {
    "kinds": ["fly", "fair", "v3", "stocks"],   // 要扫的榜单
    "knownTracks": ["main","v3","fly","fair","stocks"],  // 预期 track；出现其它 → NEW_MODE
    "pollSec": 20,
    "progressLadder": [10, 25, 50, 75, 95],     // 进度跨档才发信号
    "velocityPctPerMin": 3,                     // 速度阈值
    "freshTradesIn5Min": 20,
    "fillFastMinutes": 30                       // 30 分钟内打满 → FAST_FILL
  },
  "digest": { "topN": 6, "maxBytes": 3500 },
  "ai": { "onlySignals": ["NEW_MODE","SCHEMA_DRIFT","FAST_FILL","VELOCITY_SPIKE","GRADUATED","NEW_TOKEN"],
          "maxQueueItemsPerRun": 3 }
}
```

调参原则：**宁可阈值高、宁可漏，也不要让 AI 读噪音**。真要放宽，先放宽 `progressLadder`，别放宽 `onlySignals`。

---

## 五、和链上事件扫描的关系

| 层 | 谁 | 频率 | 作用 |
|---|---|---|---|
| 链上事件（`src/watchers/launchpads.js`） | 脚本 | 实时（WSS） | 精确、能拿 creator/pair/bond |
| 平台 API（`src/watch/*` + `seedFromGangApi`） | 脚本 | 20–60s | **抗漂移兜底**：新 pad / 新 kind 也能进来 |

`launchpads.js` 里已加：
- `GANG_FLY = 0x631e66560F4FAE4e486B65349edE48189E48B029`（fly 用的新 pad，registry `kind = 3`）
- `readGangApi()`：fly / 未知版本的代币直接走平台 API 读状态（不为每个新 pad 反解 ABI）
- `seedFromGangApi(['fly','fair'])`：每 60s 用 API 补盘，遇到没见过的 track 直接进 AI 异常队列

---

## 六、Token 预算（实测）

| 场景 | AI 读取量 |
|---|---|
| 无信号（常态） | **0**（脚本只打印一行，不进模型） |
| 有新盘但未达阈值 | **0**（只写 signals.jsonl，不进队列） |
| HIGH 信号 | **1 个文件**：`data/gang/prompt.txt`（≈1.7–2.3KB，已含角色/约束/摘要/格式） |

按 20 秒一轮、一天 4,320 轮计算，**常态下 AI 调用次数 ≈ 0–5 次/天**。

---

## 七、`prompt.txt`：开箱即用的模型输入

只要出现 HIGH 信号，脚本会自动生成 `data/gang/prompt.txt`（否则**删除**，避免 AI 读到过期内容）。

它已经包含：

```
你是链上打新情报分析员 …
## 硬约束    只读/不编造/≤5 行输出
## 信号摘要  ← digest.md 原文（≤3.5KB）
## 待判断条目 ← ai-queue 里最多 3 条（带证据）
## 回答格式  [类型] 符号 地址 → 结论 | 风险 | 下一步
```

上层只要 `cat data/gang/prompt.txt` 发给模型即可，**不需要再拼 prompt、不需要贴原始 JSON**。

自检：`node scripts/gang-prompt-selftest.mjs`（用假数据验证摘要/队列/prompt 的大小与格式）。
