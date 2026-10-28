# Mint Ops · 事件驱动的 BSC 打新与盯盘

这是一个从 `mint-ops-handoff` 演进的本地运行系统：用确定性脚本替代 AI 全市场定时扫描，AI 只负责异常解释、信息收集和规则建议。

默认只读/模拟。**不会自动付费 mint、自动 swap 或自动卖出，也不会在未显式配置时自动免费 mint。**

## 运行结构

```text
BSC WSS / getLogs / 项目 API
  → 标准化事件与真实区块时间
  → 本地去重、状态机、规则引擎
  → 静默 / substantialChange 通知 / 模拟策略卡
  → 异常才进入 AI 队列
  → 人工批准的项目与执行授权
  → baw preview → execute → 实际回执对账
```

- `src/watchers/`：Flap、Four、Gang、pipfun 与已知 CA 适配器。
- `src/rules.js`：开关、进度、费用、extension 等实质变化判断。
- `src/store.js`：游标、事件去重、项目状态、执行预留与异常持久化。
- `src/execution/`：免费 mint 白名单、BAW 预演/执行和 ERC-721 回执解析。
- `artifacts/`：原交接报告与历史持仓快照，保留作证据，不在每次扫描时重写给 AI。

## 安装与只读运行

要求 Node.js 18+。

```bash
npm ci
npm run once -- 0.01       # 扫描约 0.01 小时的区块，并读取已知项目
npm run observe            # 常驻观察；无真实执行
npm run status             # 本地游标与状态摘要
```

兼容原入口：

```bash
node scripts/flap-portal-scan.mjs 0.01
node scripts/jager-status.mjs
```

所有运行数据写入项目内 `data/`，已被 git 忽略。可用 `MINT_OPS_DATA_DIR` 改到其他本地目录。

## 配置

- `config/default.json`：RPC、冷热分频、进度阈值、模拟策略、钱包和执行总开关。
- `config/projects.json`：已知项目的 CA、ABI、读取字段、停止条件和执行选择器。
- `BSC_HTTP_RPCS` / `BSC_WSS_URLS`：逗号分隔的自定义节点，私有 key 只放环境变量，不写进仓。
- `MINT_OPS_WEBHOOK_URL`：可选，仅推送 substantialChange。
- `BAW_BIN`：默认 `baw`。

Flap 启动时只回补有限区块，之后使用 WSS 增量和游标补查。旧事件会建档，但不会冒充刚发生的新盘触发快盘策略。

## 模拟与执行

`src/strategy.js` 可生成发射盘模拟卡，但 `action=preview_only`，不含自动买入金额，不代表建议或成交承诺。

免费 mint 预览：

```bash
node scripts/mint-ops.mjs mint boo
```

预览前仍会先检查链上免费额度、价格、开关和供应；条件不满足时不会调用 BAW。真实执行必须同时满足：

1. 项目 `execution.autoAllowed=true`，且仍在人工审核后的配置中；
2. 项目 ID 加入 `execution.allowedProjects`；
3. 设置 `MINT_OPS_ARMED=1`；
4. 命令显式携带 `--execute`；
5. 钱包、Developer Mode、钱包锁、零费用、selector、额度和 preview 全部通过。

当前仓库内所有项目均为 `autoAllowed=false`，执行总开关也为 `false`。不要通过改配置绕过人工核验；付费 mint、swap 和卖出不在当前自动执行范围。

## AI 异常队列

`data/ai-queue.jsonl` 只接收：未知 ABI、Sourcify/selector 不闭合、RPC 冲突、连续读取失败、未知 revert、App 确认或结果未知等异常。AI 的输出只能是证据摘要、置信度、建议动作和规则补丁建议，不能直接修改阈值或开启交易。

## 文档地图

- `WORKFLOW.md`：端到端运行与角色边界
- `MONITORING.md`：状态机、通知和冷热分频
- `ROUTINES.md`：新调度模型与已退役的 AI 定时扫描
- `LOCAL-AGENT-CHECKLIST.md`：只读验收和上手检查
- `WALLET-AND-MINTS.md`：钱包政策与历史持仓
- `NONCE.md`：Nonce 专项；未授权不得 `start_attempt`

非投资建议。新盘、NFT 和领取操作都可能亏损或失败；任何真实操作前必须重新核对链上状态。
