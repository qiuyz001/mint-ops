# Flap Portal + pipfun 快盘扫描

- 扫描时间：**2026-10-28 09:13:10 Asia/Shanghai**
- 声明：非投资建议；未参与；只读链上/公开 API
- Flap 数据源：Portal `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` · topic0 TokenCreated `0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603`
- 窗口：block **130095466 → 130190378**（tip=130190378，约 **12h**，按 ~8000 block/h）
- 文档：[Index TokenCreated](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/index-token-created-events) · [Inspect A Token](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/inspect-a-token)

## 摘要

| 项 | 值 |
|----|----|
| TokenCreated（去重） | **2734** |
| Tradable（曲线中） | **2725** |
| 已 DEX/毕业 | **9** |
| 接近毕业（Tradable ∧ progress≥70%） | **1** |
| 有扩展 / 未确认 Agent Curve | **156**（ID Agent Curve 映射未硬编码，一律标未确认） |
| pipfun 非 legacy | **1**；接近毕业≥70%：**0** |

## 接近毕业（Flap · Tradable · ≥70%）

| 名/符 | CA | 进度% | reserve BNB | 创建 | Agent 标 | 创建时间(上海) |
|-------|----|------|-------------|------|----------|--------------|
| Giggle Mascot / TOM | `0x58E40949656a84189D47f52A0c0B53f895DE7777` | **83.4** (V8.progress) | 1668.3364 | Tradable | 不像 Agent Curve（无 extension） | 2026-10-28 08:47:28 Asia/Shanghai |

## 中段进度（40–70%，可选关注）

| 名/符 | CA | 进度% | reserve | Agent 标 |
|-------|----|------|---------|----------|
| BNCB国际 / BNCB国际 | `0xcB5e2De1b9E1469f49a526B526E469c9Dd8c7777` | 65.0 | 1300.0538 | 不像 Agent Curve（无 extension） |
| Binance Legend / Binance Legend | `0xFEf7bc4E81e92fb754DE0bFd77E037D5695A7777` | 61.7 | 9.8715 | 不像 Agent Curve（无 extension） |
| 币安AiPro / 币安AiPro | `0xb3bDC2F2AE583caCD60e4FD3B835086cDe687777` | 57.4 | 9.1873 | 未确认 Agent Curve |
| 打造高倍数代币147708429会议室 / BNB Standard | `0x3226010b428B2d4D36Fd9fEd6Cd97DB448507777` | 54.4 | 8.6988 | 不像 Agent Curve（无 extension） |
| Agent AI / Agent AI | `0xA3b0fb1886d59b5D1FB0F209690E99A7A5967777` | 50.7 | 43727344.9221 | 未确认 Agent Curve |
| Bizo / Bizo | `0x0dd054226A3188E5fC964d13af651538B0D27777` | 49.3 | 7.8847 | 不像 Agent Curve（无 extension） |
| BNB标准994977559 / BNB标准 | `0x7195027341340B702bba1CFb832C018a8b387777` | 47.1 | 942.1444 | 不像 Agent Curve（无 extension） |
| Charity / C | `0x47F0fAfc3E6dc70d96e3cAD6530A87aB0BEE7777` | 41.5 | 829.3757 | 不像 Agent Curve（无 extension） |

## 有扩展标记（未确认是否 ID Agent Curve）

| 名/符 | CA | 状态 | 进度% | extensionID |
|-------|----|------|------|-------------|
| Foilum / Foilum | `0xd45504eB497ed15770FC829dB91f90269c057777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Moffy / Moffy | `0xE3E6a8940b0ee52a3573c29EC5bbF77778517777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| GANG / GANG | `0x86A5481B88a77eCD87449254042d9B108b917777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| F.AI / F.AI | `0x2D634895afC91351e9Cd036DB3a655F5A3577777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| CONSO / CONSO | `0xed4AFe30BeEC1b5f98ac2F70C9Bff729C4297777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| PTAH / PTAH | `0x7dFFAD1A80FE42522790A4b737afc51F1A637777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| BinanceAgent / AGENT | `0xE75AE63936808AE3ca070a5c8F557cd342877777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Binance Agent / BINANCE AGENT | `0x0561753A200bec7277dd337ea939632542E87777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Binance Agent / 7AGENT | `0x8B52b3bd105BCc8F76Cd2ed7486437EFB9a47777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| BNB Standard / BNB STANDARD | `0x66f0DcBdF9c647060c467bF143dBa2b230eE7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| BNB Standard / BNBSTANDARD | `0x7a20719D46D9586Ef709E8C4dD7a09DB61ff7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Binance AI / 币安AI | `0x85b6ABb39E273bA8D37C3ef37DC68022077c7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| PTAH / PTAH | `0xe81F3E6550E576150aC318B75a42F255Cc7B7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| GANG / GANG | `0x9c63568f8EAc97968864Dd8004dA7F304D907777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Ptah.Trade / PTAH | `0x17cD998A07C6F485CB7abAfd9767082278617777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| GIGAX / GIGAX | `0xeEb36885AFdDC3ee1257c83dA6aBE989e0b47777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| dead chip / dead chip | `0xE3212BEd970Bf23871D009A7dbC669E53CC87777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| BNB金库 / BNB金库 | `0x68d94E92517B9aE69dB6892cDeb1D5b7156E7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Chicken cheems / cheems | `0x2E872f7bd880b43b2B949fB8F6AD3d6eAFaF7777` | Tradable | 2.4 | `0x0f1f338177d85790…` |
| 狗鸡吧币 / 狗鸡吧币 | `0x86E6C452b076A13017Aa7af2aCf2e86052DD7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Chimkem / CHIMKEM | `0x0C2C28ea22Cf424de61d84415C2508bb457f7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Dogecock / DOCK | `0x2f42f3a15815bd03E6f1C045ffC37671251E7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| CHEEKUN / CHEEKUN | `0x58928B7F54352CFdeEA99647F68B3c00ff397777` | Tradable | 4.8 | `0x0f1f338177d85790…` |
| DOGECOCK / DOCK | `0x502f279626ccf1062F3170b2b10dF13512307777` | Tradable | 1.1 | `0x0f1f338177d85790…` |
| Dogecock / DOCK | `0x7057cfA2633979Cb647302680e9Ee52f820d7777` | Tradable | 0.3 | `0x0f1f338177d85790…` |
| DOGECOCK / DOGECOCK | `0x100ec7e1F8d1D0f6240d613FcBb1a4d81f047777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| DOGECOCK / DOGECOCK | `0xdda30b113D8273ade4f9a009B3a3fc97eE527777` | Tradable | 0.2 | `0x0f1f338177d85790…` |
| LiteDoge / LITEDOGE | `0x7Ac769B80B962568AD028D52954104789dCF7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Ptah.Trade / PTAH | `0x2d67F022A18aBcB87A1238BD4275673b0fe57777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| PTAH / PTAH | `0x802f1aDc7D537d37b4b39c8958b4576E913E7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| Bullshot / BULLSHOT | `0x9b5dE922586fA55E05c3227047b991EA2bEE7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |
| BNB Robot / BNBOT | `0x90B3cdAB6A6f668604cF43BD44A09fCdce517777` | Tradable | 0.1 | `0xc87a159bf445e834…` |
| board sit / SIT | `0x8571f6eaA4e5C47e1015cC34A4438BF053527777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Hostile Takeovers On-Chain / TAKEOVERS | `0x456fDFcA394C7F40D620AbED80A4ae496Fb47777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| coke / COKE | `0x5917C3484d088bE051637Dbc55B577e4055E7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| coke / COKE | `0xf41033c61A5FF375143b53e629412f273f137777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Cocainu / Cocainu | `0x3280993dCB264b4E465Be77D383fDb4b7E537777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Bankcoin / BANK | `0x170E2e78D857867C66A64079719549Ee73cD7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| Bankcoin / BANK | `0x5f9450FA97566d488F2a17a9f732Ca1C530E7777` | Tradable | 0.0 | `0x0f1f338177d85790…` |
| yutongjuncz / yutongjun | `0x86aB6d411314a121C7D7c613008b50A32caC7777` | Tradable | 0.0 | `0xc87a159bf445e834…` |

## 本窗口全部新开（按块高倒序）

| # | 名/符 | CA | 状态 | 进度% | reserveBNB | Agent | 创建(上海) | tx |
|---|-------|----|------|------|------------|-------|-----------|-----|
| 1 | TrumpBuck / TrumpBuck | `0x6f62322692D38beef11326901b85aD6A83017777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:31 Asia/Shanghai | `0x014506c8…` |
| 2 | TrumpBuck / TrumpBuck | `0x7774974a8CB29B82DF83ec00eda97557A13F7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:29 Asia/Shanghai | `0xfd84cf2e…` |
| 3 | TrumpBuck / TRUMPBUCK | `0x550aD9594035e91Af99d31e46707b200379E7777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:27 Asia/Shanghai | `0x87750948…` |
| 4 | TrumpBuck / TRUMPBUCK | `0x5e92d0289bAF15D4eaE298689D25c0cE198a7777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:22 Asia/Shanghai | `0x543902e6…` |
| 5 | TrumpBuck / TrumpBuck | `0x7822E712c505a4fD816DA41631c0eD251FE87777` | Tradable | 2.0 | 19.9023 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:16 Asia/Shanghai | `0xb42bdb57…` |
| 6 | Boo / BOO | `0x5599007C647078Caf63F456127465BC914337777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:05:10 Asia/Shanghai | `0xcaed724a…` |
| 7 | WWW / WWW | `0x8096A0A7F4f990ec25Bda4Bff7b4eF96E5e47777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:04:16 Asia/Shanghai | `0x1a73066d…` |
| 8 | WWW / WWW | `0xedA48c13EBfB780691F99d09838c03cD56af7777` | Tradable | 0.1 | 0.0121 | 不像 Agent Curve（无 extension） | 2026-10-28 09:04:02 Asia/Shanghai | `0xcce33fcb…` |
| 9 | 加微信15570927555一起暴富 / BNCB股票 | `0x31724311d0Fd16de9d40C6DC073c2E6e288c7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:04:02 Asia/Shanghai | `0x0dde59b2…` |
| 10 | 会议124 847 508 / 宇宙联盟 | `0xD15625e38B141E0e98D5bBa90BBe352024BA7777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:03:54 Asia/Shanghai | `0xfd219036…` |
| 11 | 原地起飞 / 起飞 | `0x965C1eFDE5b12d73C3DB8ee31c4c54F93b457777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:03:52 Asia/Shanghai | `0x847680c6…` |
| 12 | Blanko / BLANKO | `0xFD582d8AA3D0cDd43b5F2849A4b281B6fB127777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:03:52 Asia/Shanghai | `0x2e4f10d7…` |
| 13 | 原地起飞 / 起飞 | `0xd7bC6bD8DF3740Fb33fD4D1712978207F2237777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:03:25 Asia/Shanghai | `0x7a68ebd4…` |
| 14 | 原地起飞 / 起飞 | `0xa02EceC684f24E3aB8Ed996e209e5c032C577777` | Tradable | 15.0 | 300.0272 | 不像 Agent Curve（无 extension） | 2026-10-28 09:03:19 Asia/Shanghai | `0x4a06027f…` |
| 15 | 会议124 847 508 / 宇宙联盟 | `0xDc1972d4c7bfA604573498B70527207751957777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:54 Asia/Shanghai | `0xb8c83523…` |
| 16 | 会议124 847 508 / 宇宙联盟 | `0xD803bFE2b12d470cE7399b55B97fe21810097777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:54 Asia/Shanghai | `0x28371fcd…` |
| 17 | 会议124 847 508 / 宇宙联盟 | `0xC56A97b50b0eafe958c0D8A2b5e8133Cd9d57777` | Tradable | 0.0 | 0.0069 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:53 Asia/Shanghai | `0xf37618ab…` |
| 18 | 会议124 847 508 / 宇宙联盟 | `0xA19B7ACEf9fdd2C7E4B2cB969B8f7D5ab04C7777` | Tradable | 16.1 | 2.5771 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:47 Asia/Shanghai | `0x4d9644e0…` |
| 19 | QQQ / QQQ | `0x3f74947ad3703e554C78a1F25D5ef8e1a4dc7777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:24 Asia/Shanghai | `0x958565c4…` |
| 20 | Altinity / ALTINITY | `0xe031CF5bd6Fd57Cfe96a9697573a4750566C7777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:02:21 Asia/Shanghai | `0x96640053…` |
| 21 | 原地起飞 / 原地起飞 | `0x2846101Ec51d60C84BaB64e5EFA6bb7c36557777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:01:23 Asia/Shanghai | `0x428ce512…` |
| 22 | UDTF / UDTF | `0x573D2a346641eEf3C0bd5b59621dA67261197777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:01:18 Asia/Shanghai | `0x0e2f0bc6…` |
| 23 | USDC菜单 / 菜单 | `0x86E7aa744c8a1f00E9bc21c6cFFb0A9033Dc7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:52 Asia/Shanghai | `0x469dca39…` |
| 24 | QQQ / QQQ | `0xb82c888E49E5490D49bA67c78DC60Ae648B87777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:42 Asia/Shanghai | `0x5d463cb8…` |
| 25 | IQ / IQ | `0xb8f7C879fff07e02379812F812262f4383107777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:31 Asia/Shanghai | `0x43ce902a…` |
| 26 | 原地起飞 / 原地起飞 | `0x9ED627F51B59b1E2DeEccDdb47402bd45EDD7777` | Tradable | 0.0 | 0.0010 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:23 Asia/Shanghai | `0xb1ab97f1…` |
| 27 | Tofi / TOFI | `0xA0c5fa13c348e4D2D64A650259302770d7DD7777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:23 Asia/Shanghai | `0xa85c0a1b…` |
| 28 | 原地起飞 / 原地起飞 | `0xBE9654d2a19d97C2B87f1F89Bc2d9fF821c77777` | Tradable | 0.0 | 0.0009 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:21 Asia/Shanghai | `0xfb1d7572…` |
| 29 | 原地起飞 / 原地起飞 | `0x023a127C208eF72a0e41f0D3441228e3B18a7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:05 Asia/Shanghai | `0x33a89b93…` |
| 30 | 原地起飞 / 原地起飞 | `0x3E5b22610d3E68E1FBce9bbA8C51092E99F57777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 09:00:03 Asia/Shanghai | `0xbe00cd79…` |
| 31 | FRNLY COIN / FRNLY | `0xa7f6496adB5A90Fa497D56790642ABc1D6eB7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 08:59:38 Asia/Shanghai | `0xbed81c07…` |
| 32 | Loomie / LOOMIE | `0xC5eC59D85ff271Ae47eb26F0d573f21F2A0B7777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 08:58:47 Asia/Shanghai | `0xb623fe08…` |
| 33 | Drone Smash / ZAPPED | `0x39F4A2e3001aad1aC62440d54f5c67b44d357777` | Tradable | 0.0 | 0.0000 | 不像 Agent Curve（无 extension） | 2026-10-28 08:58:46 Asia/Shanghai | `0xa46fcc6d…` |


---
完整报告原路径（箱内，约 2.2MB）：`/workspace/nft-check/FLAP-PORTAL-SCAN-2026-10-28.md`
