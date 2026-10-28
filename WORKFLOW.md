# 工作流 · 脚本主跑，AI 处理异常

## 角色分工

| 角色 | 负责 | 不负责 |
|------|------|--------|
| 常驻 Node.js 服务 | 事件订阅、回补、去重、状态机、限额、通知、模拟和回执对账 | 不让模型参与每个事件的判断 |
| AI / Kimi | 新 ABI 与源码核验、异常解释、X/项目资料收集、规则复盘 | 不直接改执行配置，不持有私钥，不自动连发交易 |
| 用户 | 审核项目、规则、执行白名单和真实操作 | 不需要再依靠定时提示 AI 全市场扫描维持盯盘 |

## 主链路

1. Flap/Four/Gang 通过 WSS 接收事件，HTTP getLogs 按游标补漏；pipfun 使用低频公开快照。
2. 读取真实区块时间，按 `txHash:logIndex` 去重；旧事件只建档。
3. watcher 统一输出项目、CA、平台、报价币、进度、费用、门禁和事件时间。
4. 规则引擎比较上次状态，决定静默、加热、通知或生成模拟策略卡。
5. 无法闭合的事实进入 `data/ai-queue.jsonl`，主服务继续处理其他项目。
6. 只有人工配置的免费 mint 项目才进入执行层；preview、执行和回执分开记录。

## 已知 CA 适配

`config/projects.json` 保存已核验 ABI 和规则。新增项目先做：

- `eth_getCode`、Sourcify、官网/官 X 交叉核验；
- 确认 SPACE Agent 门禁、入口 selector、价格、供应、每钱包额度；
- 将只读字段加入 `reads`，将需要通知的字段加入 `watchKeys`；
- 无法闭合时只进入 AI 异常队列，不猜 ABI，不自动执行。

## 真实 mint 流程

1. `known-ca.preflight` 重新读取当前链上状态，不能使用数分钟前的缓存。
2. 执行策略检查 `autoAllowed`、项目白名单、armed、value=0 和每日上限。
3. BAW 检查登录、预期钱包、Developer Mode 和钱包锁。
4. `contract-call preview` 无高危风险且不需要 App 确认后才允许 execute。
5. 广播后等待实际回执；ERC-721 从零地址 `Transfer` 解析 Token ID，写 `data/receipts.jsonl`。
6. 超时、`PENDING_CONFIRMATION` 和结果未知都禁止盲目重试，进入异常队列。

付费 mint、swap 和卖出沿用人工单独授权，不从“免费 mint 已授权”推导。
