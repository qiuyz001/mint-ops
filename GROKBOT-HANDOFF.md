# 给云端 Grok Bot 的交接说明

用户要求：常规扫描和自动规则不耗模型 token；单笔最大 $5；不设每日亏损上限；由 Grok Bot 给用户提醒。先以 paper 跑通部署和提醒，实盘钱包接入仍需验收。

## 可直接转给 Grok Bot 的任务

请读取 `qiuyz001/mint-ops` 的 `feat/autonomous-launchpad` 分支，先看 AUTOPILOT.md。在你的持久化云电脑上部署该脚本，保留 mode=paper。不要用模型每隔几秒循环扫描；不要更改单笔 $5 上限，不要重新加入每日亏损限制，也不要默认关闭已有的逐笔退出规则。

1. 找到或 clone 仓库到固定路径，不覆盖已有改动；检出该分支。检查 Node >=22，执行 npm install --ignore-scripts、npm test、npm run check、npm run autopilot:once。
2. 核对 data/autopilot/health.json，报告逐源错误，不把“进程启动了”当成“行情正常”。需要代理时配置云电脑自己的环境，不使用作者电脑的 localhost 代理地址。
3. 使用云电脑支持的进程托管启动 npm run autopilot；托管能力取决于实际权限，可以使用 systemd --user 或已有 supervisor。不能假定后台进程在任务结束/云电脑重建后必定存活。验证聊天任务结束后进程、health 时间戳仍持续更新。
4. 脚本把候选、模拟成交、退出和错误写入 notifications.jsonl。若你的环境支持**外部事件触发 Bot 的正式入口**，配置该入口为 MINT_OPS_WEBHOOK_URL；否则使用你实际具备的文件事件/消息集成来转发。不要编造 Grok webhook URL，也不要承诺本地写文件就能发手机推送。不得把所有正常轮询都送给模型。
5. 如果没有支持的事件触发入口，请明确报告此项尚未接通，提供可用的替代渠道或让用户在 Grok 内配置提醒；不得静默退化成频繁模型轮询。需要自然语言生成/推送的 Grok 调用可能计费，只有脚本本身能保证零 LLM 调用。
6. 用一条明确标注 TEST 的测试事件验收用户确实收到提醒，并确认正常扫描不会刷屏。消息必须包含链、完整 CA、进度/速度、缺失门禁、是否只是 paper；不能将候选提示写成已经买入。
7. 最后交付实际部署路径、进程托管方式、启动/停止命令、通知接入方式、health 时间和模拟持仓。当前没有任何真实买卖授权参数被脚本自动启用；不要顺便打开 live。

实盘准备：安装并核实官方 BAW 版本，登录用户指定的小额钱包；钱包身份、余额、BNB gas、滑点和 App 限额均检查通过后，再验收一笔 <=$5 的买入、实际成交对账和退出。Binance App 审批不能绕过。仓库的实盘代码是候选实现，未进行真实订单验收。用户已授权自动化方向，不代表钱包凭证已就绪。

## Grok 平台边界

Grok Bot [官方电脑说明](https://docs.x.ai/grok-bot/computer-and-apps) 表明它提供持久化云电脑，文件和登录可跨任务保留；这支持把代码交给它部署，但不等同于已验证的永久 daemon 服务。其 [通知说明](https://docs.x.ai/grok-bot/settings-and-notifications) 描述的是 Bot 完成/等待用户时的通知，并未在本次查阅中确认“任意脚本直接推送 Bot”的公开入站 API。

本次 Codex 已连接 GitHub，**没有连接该用户的 Grok Bot 云电脑**，因此仓库代码和这份交接文件不代表已经在 Grok 云端上线。不要向用户声称通知或实盘已经启用。
