# Mint Ops Handoff · 本地 Agent 接力包

- **生成时间**：2026-10-28 约 14:50 Asia/Shanghai
- **来源**：Grok Bot「币安钱包 / mint 盯盘」会话备份（只读交接，**无私钥/密码/API token**）
- **对象**：Randy 本机本地 Agent —— 承接例行盯盘、线索核验汇报、以及用户授权后的免费 mint / 登记
- **语言**：中文为主；合约地址、函数名、项目名可保留英文

## 这是什么

本目录是一套**自洽交接文档**：说明工作怎么做、信息从哪来、例行时刻表、钱包与持仓约定、Nonce 注意点，并附带 2026-10-28 最新 SCAN/VERIFY/Flap 摘要与持仓清单副本。

**不是**自动交易机器人说明；默认规则始终是：**找线索 → 核验 → 汇报 → 等用户授权再 mint**。

## 如何使用（本地 Agent 今晚）

1. 先读 [`LOCAL-AGENT-CHECKLIST.md`](./LOCAL-AGENT-CHECKLIST.md)
2. 再读 [`WORKFLOW.md`](./WORKFLOW.md) + [`MONITORING.md`](./MONITORING.md)
3. 需要动手时对照 [`WALLET-AND-MINTS.md`](./WALLET-AND-MINTS.md)、[`ROUTINES.md`](./ROUTINES.md)、[`SOURCES.md`](./SOURCES.md)
4. 细节事实以 [`artifacts/`](./artifacts/) 内最新报告为准；链上以 eth_call / Sourcify 复核，勿盲信社媒 CA
5. Nonce Genesis 另见 [`NONCE.md`](./NONCE.md) —— **未授权不要 `start_attempt`（会占额度）**

## 文件索引

| 文件 | 用途 |
|------|------|
| `README.md` | 本说明 |
| `WORKFLOW.md` | 分工与端到端流程 |
| `MONITORING.md` | 三轨盯盘 + Flap 轻扫 + substantialChange + 汇报模板 |
| `SOURCES.md` | 信息源与队友角色 |
| `ROUTINES.md` | Asia/Shanghai 例行时刻表 |
| `WALLET-AND-MINTS.md` | 公开钱包/handle、持仓、免费优先、Ptah POA |
| `NONCE.md` | Nonce Genesis 高层流程与现状 |
| `ARTIFACTS.md` | artifacts/ 索引 |
| `LOCAL-AGENT-CHECKLIST.md` | 今晚上手清单 |
| `scripts/flap-portal-scan.mjs` | Flap Portal 只读扫描脚本 |
| `scripts/jager-status.mjs` | JAGENT 旧/参考探针示例（CA 可能已过时，用前核对） |
| `artifacts/*` | 最新报告与 inventory 副本 |

## 硬约束（务必遵守）

- **不自动参与** mint / swap / 卖出；付费 mint 必须先报 **≈USD** 并等用户明确授权
- 汇报用中文；固定写「**是否值得观察**」及维度（见 MONITORING）
- **无密钥写入本仓**；签名走本机已配置的钱包 CLI（如 `baw`），预览后再 execute
- 非投资建议；所有进度数字会变，动手前链上复扫

## GitHub

本包先落在箱路径 `/workspace/mint-ops-handoff/`。父层若要建 GitHub 仓：把本目录推成公开/私有仓均可，但**不要**把含密钥的 `baw` 会话、Bearer、`.env` 一并提交。本交接包刻意不含这些内容。
