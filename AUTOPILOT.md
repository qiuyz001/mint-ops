# 多发射台自动扫描与买卖

本次增加独立 `autopilot` 运行入口，原有 Gang watch / 免费 mint 入口保持可用。默认 `paper`，扫描、规则计算、持仓管理、提醒均不调用语言模型，**模型 token 消耗为零**；RPC、服务器、第三方服务以及交易费用仍可能收费。

## 当前范围

| 组件 | 实现 | 验证状态 |
|---|---|---|
| Gang | 原生 market API，多 kind 扫描、进度加速提醒 | 本机实时读取成功 |
| BSC | Binance Pulse 聚合 Four.meme、Flap、Open Four | 本机实时读取成功 |
| Solana | Pump.fun、LaunchLab、Bonk、Meteora Dynamic BC、Jupiter Studio、Bags | 聚合数据读取成功；非原生链上订阅 |
| Base | Clanker、Bankr、Flaunch、Flap | 聚合数据读取成功；空列表也可能正常 |
| 买入 | 动量 + 市场/筹码门禁 + 独立审计；paper / BAW broker | 模拟场景测试通过；实盘未验收 |
| 卖出 | 独立持仓循环、止损、分批止盈、移动止盈、时间与停滞退出 | 模拟场景测试通过；实盘未验收 |
| 提醒 | 本地持久化 outbox + webhook 或 Telegram | 本地写入已测；未配置收件方，未向外发送 |

这些是**聚合排行榜采样**：每链每阶段最多 100 条，不保证发现每个币；每轮查询新盘、临毕业、迁移后三个阶段。不是毫秒级狙击系统，数据源也可能延迟或缓存。`netBuy` 是源返回的累计/榜单周期量，**不是本脚本计算的最近 10 秒净流入**。首次只建动量基线，下一次采样才可能触发买入。

Gang API 没有提供完整流动性和筹码字段，目前这些值保留 null，所以 **Gang 能提醒，但不能自动通过买入门禁**。Flap/Four.meme 等也会因为税率或审计未知被拒绝。不能用“缺失 = 安全”去扩大可交易范围。新系统未改造原有 `FlapWatcher` 为最新合约全版本；Flap 的新增覆盖来自 Binance 聚合源，并修复旧链上 watcher 的未知税率误判。

## 运行

Node >=22；推荐 Node 24。项目根目录：

```sh
npm test
npm run check
npm run autopilot:once
npm run autopilot
```

限时模拟运行：`npm run autopilot -- --duration-sec 900`，到时停止新循环，等在途请求收尾后退出并释放进程锁。Windows 状态文件原子替换遇到短暂 EPERM/EACCES/EBUSY 时会有限重试，持续失败仍显式报错。

自定义配置：`node scripts/autopilot.mjs --config /absolute/path/config.json`。相对 dataDir 基于仓库根目录解析。默认 `data/autopilot/`：

- `paper-state.json`：模拟账户、持仓、分批止盈状态、北京时间日预算、订单。
- `live-state.json`：实盘单独账户；不得与模拟盘混用。
- `health.json`：最后一轮扫描时间、样本数、逐源失败信息。
- `events.jsonl`：拒绝理由、提醒、订单和异常日志。
- `notifications.jsonl` 与 `notification-cursor.json`：至少一次投递，接收方用 id 去重。
- `paper.lock` / `live.lock`：同模式进程锁。崩溃后必须确认旧进程已经退出、检查未决订单后手动移除锁；程序不自动抢锁。
- `HALT_BUYS`：创建空文件即可暂停新增买入，现有仓位仍管理退出。

Node fetch 默认不一定读取 Windows 系统代理。本机联调使用现有系统代理，通过 `HTTP_PROXY` / `HTTPS_PROXY` 和 Node 24 的 `--use-env-proxy` 成功读取所有源；不要把机器专属代理地址写进公共配置。生产服务器应直接访问源，或显式配置自己的代理。

提醒环境变量：`MINT_OPS_WEBHOOK_URL`；或同时设置 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`。不要把凭证提交到 Git。通知失败独立重试，不阻塞卖出；可无接收方运行并读取本地 outbox。日志和 outbox 需要按服务器磁盘容量定期归档；当前文件未自动轮转。

## 买入与预算

默认条件：创建 1 小时内，进度 75–98%，相邻快照不超过 60 秒且至少增加 1 个百分点/分钟；净买入 >=$2,000，流动性 >=$10,000，前十持仓 <=35%，开发者 <=5%，捆绑筹码 <=15%，买卖税均已知且 <=5%。标记刷量、已毕业、过期信号均拒绝。Agent ID 专属内盘在权限未核实前拒绝。

然后请求 Binance 独立 token audit：必须有有效支持、LOW、验证源码、无命中风险项、税率已知。安全检查不是收益预测，LOW 也不是安全保证。实盘还要求买入和反向卖出都能报价，往返预计损失 <=8%，滑点有上限、MEV 开启。

按用户最新要求：单笔输入最多 **$5**，`dailyLossUsd=null`，不设每日亏损熔断。CLI 和下单入口均检查 $5 上限。其余初始限制为最多 3 仓、总本金 $30、日投入 $50、订单不超过流动性的 0.1%；日投入限制与亏损限制是不同配置，后者已关闭。保留每笔持仓的退出规则。日界线按 Asia/Shanghai。若日后给 dailyLossUsd 设正数，程序会为现有仓位预留全部剩余本金损失。实盘 USDT 按 $1 记账，不处理脱锚；gas 另计。

这些是待回测的工程默认值，**没有证明能预测“爆发”或产生正收益**。paper 使用排行榜价格并对每边扣 1.5% 模型成本，不模拟真实深度、MEV、迁移停盘、成交拒绝；paper 收益不能当实盘收益。没有价格时发出 stale 提醒，绝不按旧价格虚构卖出。

## 卖出

以真实收到数量/实际支付成本建立仓位；止盈份额以**初始数量**计算，避免第二次“30%”变成剩余数量的 30%。

1. 亏损 15%：全部退出。
2. 1.5 倍：卖初始数量 30%；2 倍：再卖初始数量 30%。跳过多档时逐个处理。
3. 达到 1.4 倍后，从持仓期最高可卖价格回撤 20%：退出剩余。
4. 30 分钟时间退出；3 分钟后涨幅不超过 5%：停滞退出。

实盘每次用**当前整仓反向可执行报价**估值；扫描网络请求与仓位循环分开，审计和候选报价不占仓位互斥锁。单笔交易提交和对账仍需串行，因此 3 秒是目标检查间隔，不是成交延迟保证。路由失败、钱包锁定、App 二次确认、链拥堵时不能保证止损成交。

## BAW 实盘边界

当前默认 `paper`，没有部署后台服务、没有启用实盘。代码提供 BAW market-order adapter，但仍需在目标主机验收钱包/链上回执格式。

实盘只实现 BSC / 指定 USDT 结算，其他链仍为发现和模拟。启用同时需要配置 `mode=live`、`execution.armed=true`、准确 expectedAddress、环境变量 `MINT_OPS_LIVE=1`。Windows 的 baw 是 npm shell shim 时，设置 `execution.bawScript` 为已安装包的 JS 入口；程序直接执行 node，不拼 shell。Linux 可使用 bawBin。不要共享主钱包；独立小额钱包有利于防止外部交易污染本程序持仓。

钱包需已登录，链和地址匹配、没有 tx-lock、有 USDT 与 BNB gas；Binance App 的每日额度/风控仍然有效，不能绕过。普通 swap 不依赖免费 mint 的 Developer Mode。订单先落盘为 submitting，提交后记录 orderId；**orderId 不代表成交**。只有 FINISHED、确认的钱包收支指令和成功链上 receipt 均完整，才更新仓位。退款按实际净支出扣除；gas 从 receipt 的 gasUsed × effectiveGasPrice 计算并按 BNB 当前报价记账。

提交超时/返回结构未知会冻结后续发送，重启也不会重发；有 orderId 的 pending 自动查账，无 orderId 的 unknown 必须人工核对。明确失败暂停新买入；卖单失败还暂停该仓位的自动重试并提示处理，其他仓位可继续退出。外部手工买卖、部分成交、地址格式变化、链上重组均需要实盘验收。未决发送会冻结所有新发送，这是防重复交易的取舍。数量当前按 8 位人类单位向下截断，少于精度的残余需人工清理。记账使用 JS 浮点数，尚不适合高精度/大额资金审计。

## 部署建议

用 systemd / 容器常驻运行 `npm run autopilot`，设置失败重启和日志轮转；不要用模型 heartbeat 去每隔几秒唤醒机器人。机器人读取 outbox 或接收 webhook 即可，只有需要自然语言解释时才调用模型。建议先累计真实行情和 paper 成交，覆盖交易费/滑点/迁移失败，再决定参数和小额实盘验收。

## 参考与验证

- Binance 官方 [Meme Rush](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/meme-rush)：数据端点、协议代码、字段单位。
- Binance 官方 [market-order](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/market-order.md) 和 [token audit](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/query-token-audit)：报价、成交确认、审计。
- [Gang CLI](https://github.com/gangfun/cli)：官方已有 SSE stream，可作为之后原生低延迟 Gang 接入方向；本版仍是 HTTP 采样。
- [Flap 官方曲线文档](https://docs.flap.sh/en/flap/developers/wallet-and-terminal-and-bot-developers/bonding-curve-in-developers-perspective)：参数应逐 token 读取，不能硬编码固定募集目标。
- [Chainstack pumpfun-bonkfun-bot](https://github.com/chainstacklabs/pumpfun-bonkfun-bot)：参考持仓独立管理与迁移后路由的设计，没有安装或执行它的交易代码。
- [Pump 官方 SDK/IDL](https://github.com/pump-fun/pump-public-docs)：后续原生 Solana 订阅的依据。

2026-11-11：21 项 `npm test`、包含新增模块的 `npm run check`、`npm run test:prompt` 通过。代理配置后完整单轮采到 910 个去重币（该时点样本，非全市场），13 个源请求均无错误。随后本机连续模拟 15 分钟，加在途请求收尾共 928 秒：57 轮、1,355 个不同代币、57 条候选提醒（27 个不同币）、0 买入/0 卖出，模拟现金仍为 $100；完整扫描平均间隔约 16.17 秒。记录到 9 次源请求超时与 1 次 Windows 临时文件占用错误。已补充原子替换有限重试；独立无网络限时运行验证正常退出且不残留锁。另外，实际审计响应的 riskLevelEnum 为空但 riskLevel=0，原逻辑拒绝了一条通过市场门槛的候选；现按文档数字等级兼容，并在数字和文字等级冲突时采用更严格评级，缺失/未知仍拒绝。修复由回归测试覆盖，未把修复后的推测成交写回本轮结果。没有执行实盘订单；未配置通知渠道。Grok Bot 部署交接见 [GROKBOT-HANDOFF.md](GROKBOT-HANDOFF.md)。

## “牛逼”案例核对

Flap [官方币页](https://flap.sh/bnb/0x9665f094d862f4d5c221843e019b463d3c607777) 可确认 BSC 合约 `0x9665f094d862f4d5c221843e019b463d3c607777`，进度已满、在 DEX 交易；Binance Pulse 的 Flap 迁移列表也返回同一合约，并同时返回多个同名币。

公开报道关联的 [马斯克原帖](https://x.com/elonmusk/status/2119629310969467053) 本次直接访问返回 403；[案例报道及原始链接索引](https://trenches-on.com/en/runners/2026-11-09-awesome/) 记录了从原帖到其他账号附加 CA 的传播过程。不能据此声称马斯克发币或背书，也不能靠名字选定交易对象。没有把该案例当作策略收益或能提前捕获的证明；原生 X 实时订阅尚未实现。
