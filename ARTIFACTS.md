# artifacts/ 索引

均为**原件复制或摘要**，生成于 2026-10-28 交接时。链上状态会过期，动手前复扫。

| 文件 | 说明 | 约大小 |
|------|------|--------|
| `nft-inventory.md` | 钱包持仓清单快照（至 14:20 上海） | ~8 KB |
| `SCAN-2026-10-28-0900.md` | 早间 Mint 浅扫 | ~7 KB |
| `SCAN-2026-10-28-1300.md` | 13:00 Mint 浅扫（substantialChange=true） | ~8 KB |
| `VERIFY-2026-10-28-0907.md` | 早间 kimi 深核 | ~13 KB |
| `VERIFY-2026-10-28-1308.md` | 13:08 kimi 深核（JAGENT paused 等）**首选定稿** | ~17 KB |
| `FLAP-PORTAL-SCAN-2026-10-28-SUMMARY.md` | 当日 Flap 轻扫**文首摘要**（完整 ~2.2MB 仍在箱内原路径） | ~14 KB |
| `NONCE-MINT-2026-10-28-r7.md` | Nonce r7 失败详报 | ~4 KB |
| `NONCE-MINT-2026-10-28-r8b-timeout.md` | Nonce r8b 健康超时（未开题） | ~0.5 KB |

## 箱内未整包拷贝但有用的路径

| 路径 | 说明 |
|------|------|
| `/workspace/nft-check/FLAP-PORTAL-SCAN-2026-10-28.md` | Flap 全日完整报告（含大 JSON） |
| `/workspace/nft-check/flap-portal-scan.mjs` | 与 `scripts/` 副本同源 |
| `/workspace/nft-check/probe-1308*.mjs` | VERIFY-1308 探针 |
| `/workspace/nonce-mint-r*/` | Nonce 工作目录（**可能含密钥材料，勿公开推送**） |

## scripts/

| 文件 | 用法 |
|------|------|
| `flap-portal-scan.mjs` | `node flap-portal-scan.mjs [hours]` 需 ethers；写出到 `/workspace/nft-check/`（可改 outPath） |
| `gang-scan.mjs` | `node scripts/gang-scan.mjs [hours]` 只读 Gang 曲线进度，JSON 打到 stdout |
| `jager-status.mjs` | 示例探针；内嵌 CA 可能是**旧 mint**，用前改成当前 CA |
