# 工作流 · 怎么做

## 分工（历史 Grok Bot 会话约定）

| 角色 | 做什么 | 不做什么 |
|------|--------|----------|
| **主盯盘 Agent**（原 Grok Bot；今晚起本地 Agent 接力） | 找线索、浅扫链上、写 SCAN、派活、汇总中文汇报、用户授权后执行 mint/登记 | 不擅自付费；不把未核验 CA 当可打 |
| **X搜索小b** | 只搜 X：官帖/社区声称 CA、时间窗、入口链接；标题+链接+上海时间 | 不参与链上；不代打 |
| **kimi小b** | 用 Kimi/CLI 深核：Sourcify、eth_call、入口 selector、费用档、门禁实测 → 写 `VERIFY-*.md` | 不自动 mint |

主 Agent **负责找线索并汇总汇报**；细则核验派 kimi 以省额度；打新预告线索可派 X 搜索。

## 端到端（一次 Mint 盯盘槽）

```
1. 读基线：上一份 SCAN + VERIFY + nft-inventory
2. 浅扫：已知 CA eth_call（供应/开关/paused）+ 站/API（如 jager.live/api/stats）
3. 搜线索：X 官号/聚合帖/项目站（或派 X搜索小b）
4. 标记 softLeads / deepVerify 清单
5. 若有实质变化 → 写 SCAN-YYYY-MM-DD-HHmm.md → 中文通知用户
6. 派 kimi 深核（priority）→ 收 VERIFY → 再报「是否值得观察」定稿
7. 用户说「打免费的」等明确授权 → 仅打授权范围 → 写回 inventory + tx 链接
```

曲线快盘（Flap）**单独槽**，见 MONITORING / ROUTINES；不要和慢盘 SCAN 混成一份硬结论。

## 铁律

1. **Never auto trade / auto mint** — 没有用户当轮明确授权，只观察与汇报。
2. **付费必报 ≈USD** — 用扫时 BNB 价粗算；写清 gas 另计。
3. **免费优先** — 用户常说「免费的都打」；付费档另问。
4. **中文汇报** — 短表 + 风险一句 + 是否值得观察。
5. **substantialChange=false 可静默** — 仅缓增/已报过的不刷屏（见 MONITORING）。
6. **CA 以链为准** — 社区声称必须 Sourcify / bytecode / 站内 JS 对账后再升格「值得」。

## 产出命名（建议延续）

- `/workspace/nft-check/SCAN-YYYY-MM-DD-HHmm.md` — 主 Agent 浅扫
- `/workspace/nft-check/VERIFY-YYYY-MM-DD-HHmm.md` — kimi 深核
- `/workspace/nft-check/FLAP-PORTAL-SCAN-YYYY-MM-DD.md` — 曲线轻扫（脚本写出）
- `/workspace/nft-inventory.md` — 本钱包持仓唯一清单

本地 Agent 若路径不同，保持**同一命名约定**，并在交接笔记里写清根目录。

## 执行 mint 时（授权后）

1. 复扫：`mintOpen` / `paused` / `hasMinted` / `priceFor` / 剩余供应
2. 用 SPACE 钱包（handle `renee`）调用正确 selector（见 VERIFY）
3. value 精确匹配（BOO 等要求精确 `priceFor`，多付会 revert）
4. 等收据 → 记 Token ID → 追加 `nft-inventory.md` 变更日志
5. 回用户：项目、Token ID、花费（0 + gas 或 BNB≈$）、tx 链接

工具习惯（原会话）：BSC 上多用 **`baw` CLI**（`wallet` / `contract-call` preview→execute）；只读可用 public RPC + `cast`/`ethers` 脚本。
