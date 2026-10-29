# 盯盘 · 事件、状态机与通知

## 三轨保持，执行方式改变

1. **Agent mint**：已知 CA 按配置读取门禁、开关、费用、供应和钱包额度。
2. **Launchpad**：Flap/Four/Gang 以链上事件为主，pipfun 以 API 快照补充。
3. **空投/领取**：仍以专项配置和人工授权为准，不把 mint 权限扩展到 claim。

## 每个代币的状态

Flap 使用 `NEW → WATCH → HOT → DEX/DONE`：

- 新事件先记录，进度不足 40% 进入低频；
- 40–70% 进入关注频率；
- ≥70% 进入热路径；
- DEX、Killed、已屏蔽或长期无意义项目停止高频读取。

已知 CA 使用相同的冷热思想，但只读取配置中存在的函数。任何缺失/回退都记为未知，不把缺字段解释成 0 或安全。

## substantialChange

以下情况才通知：

- 新硬 CA 或新 LIVE 且规则可核；
- `paused`、`mintOpen`、`openedAt`、`pair`、`extensionID`、费用或 selector 变化；
- 首次跨过配置的 70/90/95/100% 阈值；
- Gang 新盘、曲线进度跨过上述阈值、新的有效押金、毕业或打新启动；
- 新盘带 extension，需进一步核对 Agent Curve 映射；
- 执行需要 App 确认、结果未知、未知 revert 或数据源持续冲突。

以下情况只写事件日志：

- 重复的 `txHash:logIndex`；
- 缓增但没有跨阈值（Gang 内盘慢涨同样只写日志）；
- 已参与、已售罄或已通知的同一状态；
- 无 extension 的普通 meme；
- 超过新盘年龄窗口的历史回补。

## 通知与 AI 的边界

- `data/events.jsonl`：完整、机器可读的事件流水。
- 控制台和可选 webhook：只发 substantialChange 中文短报。
- `data/ai-queue.jsonl`：只发需要外部核验或解释的异常。
- `data/state.json`：权威游标和上次状态，重启后从该状态继续。

AI 生成的规则建议必须人工审核，不得直接修改 `config/` 或执行开关。
