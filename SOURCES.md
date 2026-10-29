# 信息源 · 从哪儿来

## 链上（BSC · 最高优先级）

- **RPC**：`bsc-rpc.publicnode.com`、`bsc.publicnode.com`、binance dataseed、1rpc 等（脚本内多源轮换）
- **只读**：`eth_call` / `eth_getLogs` / `eth_getCode`
- **Sourcify v2**：验证 exact_match / match / not_found；能读源码则钉 free 规则与误差码
- **SPACE ID .ai registry（常用）**：`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
  - 试读：本钱包 `balanceOf=1`；对照随机 EOA `balanceOf=0` 测门禁
- **试读钱包（仅 view）**：`0x2840ebb9EcBb55f3f0C973ae9544b16266Cf99b8`（handle `renee`）

## Flap Portal

- Portal CA：`0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`
- 脚本：`scripts/flap-portal-scan.mjs`
- 兼扫 pipfun 公开 `/v1` 类快照（脚本内；失败则报告 error 一句）

## Gang（只读）

2026-10-29 用 BSC `eth_getCode` / `getLogs` / `curves` / `kindOf` / `sales` / `bondOf` 对过。进度优先读链，链上读不到再用 `https://gang.fun/api`（可用 `GANG_API` 改）。

| 角色 | 地址 | 扫描 |
|------|------|------|
| 旧 BNB 曲线（仓库原 `GANG_OLD`） | `0x315Ba2e8952D06094CC636b2B84229FA32fb23A7` | 是。毕业 20 BNB |
| LaunchpadV2（仓库原 `GANG_V2`） | `0x1B8F3f69DFa0a7F63d308C7EB0Fd38D8b099966E` | 是。话题与原常量一致 |
| LaunchpadU | `0xF81C4E51c48466c6025B0165b1Ea0F6978c712cb` | 是。创建话题与 V2 相同，官方已停新创建 |
| LaunchpadS | `0x60aee38576035E757deD30fF8db8A8DA476430C1` | 是。曲线没有 `taxed` 字段 |
| GangLaunchpad（V3 曲线 + 打新） | `0x15CFD2dc8278Fb87a1783ef42111618E20874365` | 是。两条 `Created` 都在真实交易里对过 |
| GangBond | `0xe92dC940CB23Dc328639A7334e69F9CCdf3a14E4` | 是。只读 `bondOf` / `BondPosted` |

不扫：CLI 里的 soft `0x4E6f13c8A453c1b8b4E20b590082bb233a5b80d7`（有字节码，`tokenCount=0`，现行 BNB 曲线在 `GANG_OLD`）；已弃用的第一版 GangBond `0xf26F33432E33FcE615abf3801ca0c91D1C62C817`（官方记录部署后无押金事件）。

脚本：`scripts/gang-scan.mjs`。不自动买入、卖出或参加打新。

## 项目站 / API（示例）

| 项目 | 入口 |
|------|------|
| JAGENT | https://jager.live/ · API stats；官 X @jagerbnb_ |
| DigiWarriors | https://digiwarriors.fun · @digiwarriorsfun |
| Ptah POA | https://ptah.trade/poa · NFT `0xD87ADb2E47979d6cb323896B1A9320E0dd132213` |
| BOO | https://boo-mint.pages.dev · CA 以链+站一致为准 |
| Onchain Crystals | https://onchaincrystals.surge.sh · @OnchainCrystals |
| AGENT SEAL | https://agentseal.netlify.app/ |
| Nonce Genesis | MCP + 站内协议（见 NONCE.md）；NFT 曾核 `0x053259…398a` |
| BLOB Miner | 站常 403；以合约 `0x4ADD…84A6` + claim 路径为准 |

站只做线索；**费用/门禁以链上为准**。

## X（社媒）

- **官号优先**：如 @jagerbnb_、@digiwarriorsfun、@Ptahtrade、@Handln、@world_ygg、@StonkRobotics、@gearzfun …
- **聚合/清单**：社区清单号（如 congge918 等）→ 只当 soft lead，必须链上坐实
- **派活**：X搜索小b —— 输出「标题 + 链接 + Asia/Shanghai 时间 + 声称 CA（标注弱源）」
- 贴近用户时间线发现机会（用户偏好），但仍要过门禁/Sourcify 维度

## 币安广场（Ptah POA 社交挖矿）

- 每日发帖模板（历史）：
  ```
  Proof of Agent 社交挖矿打卡
  #ProofOfAgent Agent #18497
  https://ptah.trade/poa
  ```
- 发帖后到 Ptah 登记当期 submission；查 `entered` / `status=verified`
- 窗口约至每日 **12:44 Asia/Shanghai**（以官网当期为准）；活动约至 **2026-11-09** 后结束（例行曾设自删）
- 也可用 X 发同样内容再登记（用户可选）

## 队友

| Agent | 职责 |
|-------|------|
| 主盯盘（本地接力） | 浅扫、派活、汇报、授权后执行 |
| X搜索小b | X 只搜不参与 |
| kimi小b | Kimi 深核写 VERIFY |

无队友时：本地 Agent 需**自己**完成搜 X + 深核，或降低并发、拉长间隔以免额度爆。

## 钱包工具（本机）

- **`baw`**：币安 Agent Wallet CLI —— `wallet status/address/balance`、`contract-call` preview→execute、`sign-message`
- **勿把** baw 登录态、Bearer、私钥写进本 handoff 仓
