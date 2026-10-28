# 钱包 · 持仓 · Mint 政策

## 公开身份（可写入报告）

| 项 | 值 |
|----|-----|
| BSC 钱包 | `0x2840ebb9EcBb55f3f0C973ae9544b16266Cf99b8` |
| Agent handle | `renee`（`renee.ai`） |
| Ptah / POA Agent # | **18497**（tokenId 同号） |
| POA NFT CA | `0xD87ADb2E47979d6cb323896B1A9320E0dd132213` |
| SPACE registry | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` |

**禁止**在文档/仓内保存：私钥、助记词、baw 密码、MCP Bearer、邮箱验证码、支付卡。

## 持仓清单约定

- 权威副本（原会话）：`/workspace/nft-inventory.md`
- 本包副本：`artifacts/nft-inventory.md`（生成时快照；之后以本机持续更新的 inventory 为准）
- 只记录本钱包相关 Agent/Mint 系；每笔追加：**项目、CA、Token ID、取得方式、上海时间、tx、状态**
- 变更日志表必须追加一行

## 政策

- **免费优先**（value=0，仅 gas）—— 用户常授权「免费的都打」
- **付费**：先报 BNB 与 **≈USD**，等明确授权（例：JAGENT 10 份、Nomio）
- **不自动卖**；二级提醒规则见 inventory「盯盘规则」段（成本参照=该项目付费档 mint 价）
- 每项目注意 `MAX_PER_WALLET` / `hasMinted` / `freeLeft`，避免重复打 revert

## 截至 2026-10-28 14:20 已持有（摘要）

免费 gas-only（节选）：BZERO、AIVY、ADPASS、AGM-CARD、Noir、PixelVulpes、Ptah POA #18497、AI Coin、Agentlings、OCRYSTAL×2、Flaggies、DigiWarriors、BOO、Agent Pandas、BLOB Miner。

付费：Nomio（≈$0.20）；**JAGENT 10/10**（≈$10.1，`mintedCount(renee)=10`）。

完整表见 `artifacts/nft-inventory.md`。

## JAGENT 注意（2026-10-28 13:16 核验）

- Mint `0x120215D5DebeF4e337Ae7dF0793c68e54259782E` / Token `0xd657274a5458eAc6784556036Ed3DE1Bd510A100`
- ≈9515/10000 时链上 **`paused=true`**；API mintingOpen=false；**仍无新 CA、未开池、pair 空壳**
- 本钱包已满额 → **不要再打旧 CA**；盯 **redeploy / 新 CA / openedAt**
- 官帖曾自相矛盾（喊停又 Continue）→ 以链为准

## BLOB Miner

- NFT mint **免费**（仅 gas）；CA `0x4ADDBd796eDF3d4d186Fb5AA314cAfF3F98984A6`
- 之后 `claim(uint256[] tokenIds)` 挖 `$BLOB`（token `0xF445bA4E3E3DF68C81fCF1E8364F413c9Ad8E3Fb`）至约 **2026-11-26**
- 勿把挖矿代币当确定收益；售罄后仅 claim 观察

## 2026-10-28 已打免费档（授权后）

OCRYSTAL #3338/#3339、FLAG #1809、DWG #1340、BOO #1068、APANDA #1686、BLOB #3147。详见 inventory。

## Ptah POA 每日流程

1. 查当期 period：`entered` 是否已 true（官网/API）
2. 若未进：登录币安广场（或 X）发打卡帖（含 `#ProofOfAgent` + `Agent #18497` + poa 链接）
3. 将帖子 URL **登记到 Ptah**（POST submissions / 站内「提交」——以 https://ptah.trade/poa 当前前端为准）
4. 确认 `status=verified` / `entered=true`
5. 截止约 **当日 12:44 上海**；错过则等下一日
6. 活动约 **2026-10-26 → 2026-11-09**（以官网为准）

今日（10-28）会话中已登记成功一例：广场帖 `382021586950337`，period 3 entered。

## 待观察（VERIFY-1308，未自动打）

| 项目 | 结论 | 备注 |
|------|------|------|
| JAGENT | 值得盯换约/开池 | 勿再 mint |
| Worldygg | 低–中 | 宣称上海 21:00 开铸；**无硬 CA** |
| AGENT SEAL | 低–中 | 官 CA `0x9541…d404`；首枚约 0.0005 BNB 累进；非免费 |
| UNBROKEN | 暂不 | 免费档已过；付费不强制 Agent |
