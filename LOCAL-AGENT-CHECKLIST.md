# 本地 Agent · 今晚上手清单

目标：在 Grok Bot 周额度耗尽后，**接力例行盯盘 + 用户授权的打新**，并读懂历史结论。

## 启动前（一次）

- [ ] 通读 `README.md` → `WORKFLOW.md` → `MONITORING.md`
- [ ] 记下钱包 `0x2840…99b8` / handle `renee` / POA **#18497**
- [ ] 确认本机 `baw`（或等价）已登录且能 `wallet address` 对上上述地址
- [ ] 准备 BSC 只读 RPC；可选安装 `ethers` 跑 `scripts/flap-portal-scan.mjs`
- [ ] **不要**把私钥、bearer、密码拷进 git

## 今晚优先（按上海时间）

- [ ] **读** `artifacts/VERIFY-2026-10-28-1308.md` + `artifacts/nft-inventory.md` —— 建立「当前值得/已打/勿打」心智模型
- [ ] **JAGENT**：只盯新 CA / `paused` / 开池；**禁止**再打旧 mint（已 10/10 + paused）
- [ ] **Flap**：若落在 2h 槽，跑 `node scripts/flap-portal-scan.mjs 3`，有实质再报
- [ ] **Worldygg**：官宣称约 **21:00 上海** 开铸 —— 仍无硬 CA 时只监控，出现 CA 再 Sourcify+门禁
- [ ] **BLOB**：若仍可 mint 且用户要补；已持有则考虑是否 `claim`（另需授权）
- [ ] **Ptah POA**：若明日白天接力 —— 10:00 前准备广场/X 打卡；先查 `entered`

## 每次 Mint 盯盘槽（9/13/18/22）

- [ ] 对比上一 SCAN/VERIFY 基线
- [ ] 复扫：JAGENT、BLOB 剩余、VERIFY 里「值得」且未满额项目
- [ ] X：官号 + 新 soft CA（或等价搜索）
- [ ] `substantialChange`？是 → 中文通知 + 写 SCAN；否 → 可静默
- [ ] 深核：Sourcify + SPACE vs EOA + 费用档；写「是否值得观察」五维
- [ ] **无用户授权 → 停止在汇报**

## 用户说「打免费」时

- [ ] 列出将打的 CA / selector / 预期 value=0
- [ ] 逐个 `hasMinted`/`freeLeft` 预检
- [ ] 执行 → 记 inventory → 回传 tx
- [ ] 付费档**不要**顺手打

## Nonce

- [ ] 未授权：**零** `start_attempt`
- [ ] 若用户要打：先 health/admission；429 则延期并报告

## 汇报口吻

- 中文；非投资建议；未参与 / 已按授权参与 要写清
- 费用写 BNB 与 ≈USD
- 时间标 **Asia/Shanghai**

## 交接完成标准

本地 Agent 应能独立回答：

1. 三轨是什么？谁深核、谁搜 X？
2. Flap Portal CA 与脚本怎么跑？
3. 什么叫 substantialChange？
4. 今晚绝对不要再打哪个项目？
5. Ptah #18497 每日怎么进抽奖？
