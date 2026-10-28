# NONCE Genesis mint 尝试报告 · 2026-10-28 r7

- **时间**：2026-10-28 01:21–01:45 Asia/Shanghai
- **结果**：**失败**（deadline 内未拼齐 32 碎片；未求解、未提交、未 mint）
- **声明**：非投资建议；失败挑战**不扣**免费铸造额度；本轮仅 **1** attempt，未自动连开
- **优化相对 r6**：高并发抢碎片（先 8 worker，后降为 3 worker 长重试）+ CDCL×WalkSAT 赛跑脚本就绪；实际卡在 MCP 持续 429，碎片未齐，求解窗为 **0**

## 钱包 / 身份

| 项 | 值 |
|----|----|
| baw | CONNECTED；devMode.enabled=true |
| BSC | `0x2840ebb9EcBb55f3f0C973ae9544b16266Cf99b8` |
| Agent ID | `renee.ai` / decimal `46733342984232160251235667863901846079652063203033289189490576535109795500798` |
| BNB | ≈0.0178（仅 gas） |
| mintedByWallet | **0**（链上 eth_call 复核，结束后仍为 0） |
| remainingMints | **2**（失败不消耗） |

## 开题时快照

- MCP `admission=open`（全程大量 429 / Service busy）
- FreeMint `paused=false`
- NFT `totalSupply` 开题约 **7002**；结束后约 **7114** / 7777
- version：`nonce-logic-balanced-1536`（1536 vars / 33792 clauses / 32 fragments / deadlineSeconds=900 / toolBudget=96）
- mintPrice=0，failureFee=0，maxMintsPerWallet=2

## 已完成步骤

1. 预热 MCP `protocol_info` → admission open；清理旧 kissat/walksat；**未**复用旧 bearer/attempt
2. baw status/settings OK；MCP auth challenge → baw EIP712 preview/execute → Bearer（expires ≈ 2026-10-27T18:23:22Z = 02:23 Asia/Shanghai）
3. `agent_identity` → `renee.ai`；`wallet_status` → remainingMints=2
4. （首轮 auth 脚本在 `wallet_status` 后 429 中断）→ **resume** 用同一 bearer：`prepare_attempt`（新 UUID）→ attempt `468fd6ef-7c7f-4eda-81a8-8f4bb535120e`
5. StartAuthorization 校验：domain NONCE Free Mint / FreeMint / attemptId=keccak(UUID) **match** → baw preview/execute OK
6. `start_attempt` → **ACTIVE**
   - deadline UTC：`2026-10-27T17:44:07.665Z`
   - deadline **Asia/Shanghai：2026-10-28 01:44:07**
   - ACTIVE 时刻约 **01:29:11 Asia/Shanghai**（≈885s 窗）
7. **碎片拉取（失败点）**
   - 第一波 `fetch_and_solve`（8 并发）：约 01:29–01:31，得 **7/32** 后因某片 18 次 429 失败退出
   - 第二波 `fetch_resume`（3 并发、长 jitter）：01:31–01:44，累计 **14/32**（ids: 0,1,2,3,8,9,10,16,17,19,23,24,26,30）
   - **未写出** `challenge.cnf`；**碎片墙钟 ≈ 整个 15 分钟窗**，有效求解秒数 **0**
8. 求解脚本 `solve_r7.py`（分量检测 + kissat 多配置 + Cadical/Glucose + WalkSAT×8）**未启动**（无 CNF）
9. **未进入** `submit_artifact` / `mint_transaction` / 链上 mint
10. deadline 后 MCP `attempt_status` 仍 429 未能读到；按 deadline 已过应视为 **EXPIRED**；链上 `mintedByWallet=0`

## 连通分量 / 求解

| 项 | 值 |
|----|----|
| 分量个数 | **N/A**（未拼题） |
| 是否拆开 | N/A |
| 有效求解秒数 | **0** |
| 碎片耗时 | ~01:29→01:44 Asia/Shanghai（整窗）；齐片目标 2–3 分钟 **未达成**（14/32） |

## 失败点

**卡在「拉齐碎片」**：MCP 持续 `HTTP 429 Service busy`；高并发与降并发长重试均无法在 deadline 前拿满 32 fragment。  
相对 r6：本轮更早把时间砸在抢碎片上，但服务器限流更重，**连求解都没开跑**。  
- attemptId：`468fd6ef-7c7f-4eda-81a8-8f4bb535120e`  
- deadline：**2026-10-28 01:44:07 Asia/Shanghai**  
- 无错误扣费；无链上交易；额度仍 **2**

## 产物路径

- 工作目录：`/workspace/nonce-mint-r7/`（fragments 14/32、auth/start JSON、fetch 日志；Bearer/capability 仅本地，未写入本报告）
- 本报告：`/workspace/nft-check/NONCE-MINT-2026-10-28-r7.md`
- **未**更新 `/workspace/nft-inventory.md`（无成功 mint）

## 说明

- 用户授权：父任务引用 `[pt118u]`（吸取经验优化后再打一次）；仅本 1 attempt
- 签名均 baw preview 后再 execute；未自动开第 2 次
