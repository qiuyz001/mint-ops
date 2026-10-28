# 例行时刻表 · Asia/Shanghai

以下为原 Grok Bot 会话中的例行节奏。本地 Agent 请用本机 cron / 调度复刻；**额度紧张时可合并或降频**。

## 现行（建议保持）

| 名称 | 时刻（上海） | 动作 |
|------|--------------|------|
| **Mint 盯盘** | **09:00 / 13:00 / 18:00 / 22:00** | 三轨浅扫 → SCAN；有实质变化则通知；派 X / kimi |
| **曲线快盘轻扫** | **每 2 小时，约 09:00–21:00** | `node flap-portal-scan.mjs 3`（早间首扫可用 `12`）；substantialChange 才通知 |
| **Ptah POA 社交挖矿** | **约 10:00**（窗口至约 **12:44**） | 币安广场（或 X）打卡帖 → 登记 Ptah → 确认 `entered=true` |

## 已暂停 / 降频（默认不要自动恢复）

| 名称 | 说明 |
|------|------|
| **Gearz Cog / NFT 二级盯盘** | 曾按持仓二级涨跌提醒；后暂停。用户重新要求再开 |
| **SECONDARY-HOLDINGS 高频** | 10-26/27 曾半小时级；已停 |

## 槽位产出习惯

- Mint 槽：`SCAN-*.md` →（可选）VERIFY → 用户可见中文摘要
- Flap 槽：脚本写 `FLAP-PORTAL-SCAN-日期.md` + 短摘要；无实质可 `substantialChange=false` 不打扰
- Ptah：成功登记后一句确认即可；失败（登出/验证码）立刻找用户

## 时区

- **一律报 Asia/Shanghai**
- 链上 UTC / API `Z` 时间先换算再写进报告
