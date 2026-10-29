# 本地 Agent · 上手与验收清单

## 启动前

- [ ] 阅读 `README.md`、`WORKFLOW.md`、`MONITORING.md`。
- [ ] Node.js ≥18，执行 `npm ci`。
- [ ] 核对 `config/default.json` 的预期钱包与 `config/projects.json` 的 CA/ABI。
- [ ] 如需私有 RPC，只通过 `BSC_HTTP_RPCS` / `BSC_WSS_URLS` 配置，不写进 git。
- [ ] 确认 `data/`、`.env`、bearer、baw 会话均在忽略规则内。

## 只读验收

- [ ] `npm run check` 通过。
- [ ] `npm run once -- 0.001` 能读取真实 Flap 日志、已知项目和 pipfun 快照。
- [ ] `npm run gang-scan -- 0.05` 输出 JSON，`armed` 为 false，且没有买卖交易。
- [ ] 再跑一次，已处理的 `txHash:logIndex` 不重复触发。
- [ ] `npm run observe` 能启动 WSS 和回补，Ctrl+C 后保存游标。
- [ ] `node scripts/mint-ops.mjs mint boo` 在免费额度已用时于 BAW 之前停止。
- [ ] 默认配置下所有真实执行均被阻止；未发生任何 `baw execute`。

## 日常判断

- [ ] 新 CA 先核 `eth_getCode`、Sourcify、门禁、selector、费用与供应。
- [ ] 缺字段/回退是“未知”，不是 0，也不是安全。
- [ ] 只有 substantialChange 才通知；异常才读 `data/ai-queue.jsonl`。
- [ ] 旧回补事件不得被当成刚发生的新盘。
- [ ] JAGENT 旧 CA 只盯换约/开池，禁止再 mint。
- [ ] 付费 mint、swap、卖出、Nonce attempt 仍需独立授权。

## 真实执行前另行检查

- [ ] 用户已明确指定项目、数量和授权范围。
- [ ] `autoAllowed`、项目白名单、armed 和命令参数均是有意设置，而不是 AI 自行修改。
- [ ] 钱包地址、Developer Mode、钱包锁、零费用和 preview 全部通过。
- [ ] 超时或 App 确认不自动重试；先查真实订单和链上回执。
