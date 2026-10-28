# 盯盘 · 三轨 + Flap + 汇报模板

## 三轨（用户 2026-10-24 定）

1. **Agent mint** — 需 `.ai` / SPACE Agent ID 的 NFT 或份额铸造（免费档优先）
2. **发射台 Launchpad** — Four / Flap / Gang / pipfun / 项目自建曲线等（慢盘线索 + 快盘轻扫分开）
3. **空投 / 领取** — claim、社交挖矿登记、持有者空投预告（先核 CA 与领取条件）

主 Agent 找线索并汇报；**不自动参与**；有 **substantialChange** 才通知。

## 「是否值得观察」维度（固定写）

对每个 notify 项写结论：**值得 / 低–中 / 暂不**，并点名维度：

1. **Sourcify** — exact / match / not_found
2. **Agent 门禁是否闭合** — SPACE `mint` OK vs 随机 EOA revert（误差码最好钉死）
3. **费用与供应可读** — `priceFor`/`quote`/`cost` 与文案一致；MAX / totalSupply
4. **admission / mintOpen 真开** — 不只是官网文案
5. **相对上次实质变化** — 新 CA、暂停落链、破进度阈值、入口 selector 闭合等

参考口径来自 NONCE Genesis 汇报习惯与用户 2026-10-27 要求。

## substantialChange 判据（实用）

**算实质（应通知）示例：**

- 新 LIVE 且 Agent 门禁可测 / 新硬 CA
- 进度大跳（如 +数个百分点以上，或跃过关键阈值如 JAGENT 9500）
- 开关变化：`paused`、`mintOpen`、开池 `openedAt`、换约
- 费用规则首次闭合（免费档边界钉死）
- Flap：窗内 **NEW 带 extension 进 DEX**；或关注盘 **首次 ≥70%** 且仍 Tradable；或已报盘毕业进 DEX

**不算实质（可不通知）示例：**

- 已知盘缓增几枚、结论未变
- 已参与/已售罄的复读
- 无 Agent 门禁的公共 mint（除非用户改口径）
- Flap 无 extension 的普通 meme 毕业（可一句带过，不升格 Agent 专区）

## 慢盘 SCAN 报告字段模板

```markdown
# Mint/发射台/空投盯盘 · SCAN {日期时间} Asia/Shanghai
- 基线：上一 SCAN/VERIFY
- BNB 粗算：≈ $X
- 声明：非投资建议；未自动参与
## substantialChange
true|false
## notifyItems
### N) 项目名
- 类型 / CA / 门槛 / 状态 / 入口
- 费用：BNB 与 ≈USD
- 风险一句
- 是否值得观察：**…** — ①…②…③…④…⑤…
## softLeadsForXSearch
## deepVerifyForKimi
## 复扫已知（不单报）
## 不复报
```

## Flap 曲线快盘轻扫

- **数据源（已定）**：BSC Portal `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`
  - 事件：`TokenCreated` topic0 `0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603`
  - 状态：`getTokenV8Safe` / `getTokenV5`（进度优先 V8.progress，1e18=100%）
  - 文档：Flap docs「Index TokenCreated」「Inspect A Token」
- **不依赖** flap.sh 网页或用户本机浏览器
- **脚本**：`scripts/flap-portal-scan.mjs`（原路径 `/workspace/nft-check/flap-portal-scan.mjs`）
  - 用法：`node flap-portal-scan.mjs [hours]` — 默认 **3**；早间可用 12
  - 写出：`/workspace/nft-check/FLAP-PORTAL-SCAN-YYYY-MM-DD.md`
- **汇报关注**：
  - 窗内 TokenCreated 计数、nearGrad（Tradable∧≥70%）、withExt 数量
  - **NEW 带 extension 进 DEX**（标「未确认 Agent Curve」——缺官方 extensionID 映射时不要硬说是 ID Agent Curve）
  - pipfun 快照一句（常仅 $PIP 低进度）
- **风险**：全量 Portal ≠ Agent Curve；RPC eth_getLogs 需小窗口分批

## 二级持仓（暂停/降频）

用户曾要求观察二级涨势与「卖出净到手接近成本」；**Gearz Cog / NFT 二级例行曾跑后暂停**（见 ROUTINES）。本地接力默认**不要恢复高频二级扫**，除非用户重新打开。
