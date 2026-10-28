# Nonce Genesis · 高层说明

## 性质

- BSC 上 **Agent 门槛** 的解谜/挑战型免费 mint（逻辑题 + MCP 拉碎片 + SAT 求解）
- **失败挑战通常不扣**免费铸造额度；但 **`start_attempt` 会占用一次 attempt 窗口**
- **在用户明确授权重试之前，不要 `prepare_attempt` / `start_attempt`**

## 高层步骤（概念）

1. 查 MCP `protocol_info`：`admission` 是否 open；链上 FreeMint `paused`、供应
2. `baw` 登录态 OK；MCP auth（EIP-712 via baw preview→execute）→ Bearer（**勿写入本仓**）
3. `agent_identity` / `wallet_status` → 确认 `renee.ai`、`remainingMints`
4. 用户授权后：`prepare_attempt` → 校验 StartAuthorization → `start_attempt` → ACTIVE
5. 拉齐 fragments → 拼 DIMACS → 求解（CDCL / WalkSAT 等）→ `submit_artifact` → mint
6. 全程大量 **HTTP 429**：需退避；健康探针连续失败则**不要硬开题**（见 r8b）

## 额度与授权习惯

- `maxMintsPerWallet` 曾见 **2**；失败不消耗 minted 计数
- 用户常授权「再打一次 / 补打 1/2」—— **一 attempt 一轮**，不要自动连开
- 未凑齐「admission open + 健康探针」时：报告 TIMEOUT，**额度未动**

## 截至最后已知（2026-10-28）

| 项 | 状态 |
|----|------|
| 链上 `mintedByWallet` | **0**（多次失败均未 mint 成功） |
| remainingMints | 报告中曾为 **2**（以开题前 `wallet_status` 为准） |
| r5–r7 | 失败：连通分量拆不开 / 429 拉不齐碎片 / EXPIRED |
| r8b | **HEALTH TIMEOUT**：登录后 MCP 长期 429；**未 prepare / start_attempt**，额度未动 |
| version（当时） | `nonce-logic-balanced-1536`（1536 vars / 32 fragments / ~900s deadline） |

详情副本：`artifacts/NONCE-MINT-2026-10-28-r7.md`、`artifacts/NONCE-MINT-2026-10-28-r8b-timeout.md`。

工作目录历史：`/workspace/nonce-mint-r3` … `r8b/`（含求解脚本；**可能含本地 bearer 文件 —— 不要复制进 GitHub**）。

## NFT CA（曾核）

- FreeMint / NFT：`0x053259A3D30E63d9447E3d90813C6a494bcB398a`（Sourcify exact；以当前链上为准再确认）

## 本地接力建议

- 白天 MCP 较闲时再试；加长 health wait；降并发拉碎片
- 任何新 attempt **先问 Randy**
- 不要提交本仓时带上 `bearer.txt` / capability JSON
