/**
 * 信号层：把"两次快照的差"变成结构化的信号，并生成两份产物：
 *   - digest.md    ← 给 AI 读（<= maxBytes，只有值得看的东西）
 *   - ai-queue.jsonl ← 只有必须 AI 判断的异常（每条一行 JSON，带证据）
 *
 * 这里没有任何模型调用：脚本算出"发生了什么"，AI 只负责"这意味着什么"。
 */
import fs from "node:fs";
import path from "node:path";

const HIGH = new Set(["NEW_MODE", "SCHEMA_DRIFT", "FAST_FILL", "VELOCITY_SPIKE", "GRADUATED", "TRADE_BURST"]);

/** 信号分类：情报（事后）vs 可观察窗口（事前） */
const CATEGORY = {
  NEW_MODE: "intel",
  SCHEMA_DRIFT: "intel",
  FAST_FILL: "intel",
  GRADUATED: "intel",
  NEW_TOKEN: "intel",
  VELOCITY_SPIKE: "actionable",
  TRADE_BURST: "actionable",
  PROGRESS_LADDER: "watch",
};

export function makeSignal(type, token, extra = {}) {
  const category = extra.step !== undefined && type === "PROGRESS_LADDER" ? (extra.step >= 50 ? "actionable" : "watch") : (CATEGORY[type] ?? "intel");
  return {
    type,
    category,
    priority: HIGH.has(type) ? "high" : "med",
    symbol: token?.symbol ?? null,
    address: token?.address ?? null,
    kind: token?.kind ?? null,
    track: token?.track ?? null,
    progressPct: token?.progressPct ?? null,
    score: token?.score ?? null,
    reasons: token?.reasons ?? [],
    at: Date.now(),
    ...extra,
  };
}

/** 两次快照对比 → 信号数组 */
export function diff(prev, ranked, driftEvents, cfg, { baseline = false } = {}) {
  const signals = [];
  const nowSec = Date.now() / 1000;

  for (const d of driftEvents) {
    signals.push({ type: d.type, priority: "high", detail: d.detail, field: d.field ?? null, track: d.track ?? null, at: Date.now() });
  }

  for (const t of ranked) {
    const p = prev[t.address];

    if (!p) {
      if (baseline) continue; // 首次建基线：只记录，不产生噪音信号
      const ageSec = t.createdAt ? nowSec - t.createdAt : null;
      const fresh = ageSec !== null && ageSec <= (cfg.freshWindowSec ?? 300);
      const active = (t.trades ?? 0) >= (cfg.freshTradesIn5Min ?? 20);
      if (fresh || active) signals.push(makeSignal("NEW_TOKEN", t, { ageSec: ageSec === null ? null : Math.round(ageSec), note: fresh ? "新盘" : "有成交" }));
      continue;
    }

    // 进度阶梯
    for (const step of cfg.progressLadder ?? []) {
      if ((p.progressPct ?? 0) < step && (t.progressPct ?? 0) >= step) {
        signals.push(makeSignal("PROGRESS_LADDER", t, { step, from: p.progressPct, to: t.progressPct }));
      }
    }

    // 速度异常
    if (t.velocity >= (cfg.velocityPctPerMin ?? 3)) {
      signals.push(makeSignal("VELOCITY_SPIKE", t, { velocity: Number(t.velocity.toFixed(2)), from: p.progressPct, to: t.progressPct }));
    }

    // 打满
    if (!p.graduated && t.graduated) {
      const fillMin = t.graduatedAt && t.createdAt ? (t.graduatedAt - t.createdAt) / 60 : null;
      signals.push(makeSignal("GRADUATED", t, { fillMinutes: fillMin === null ? null : Number(fillMin.toFixed(1)), trades: t.trades }));
      if (fillMin !== null && fillMin <= (cfg.fillFastMinutes ?? 30)) {
        signals.push(makeSignal("FAST_FILL", t, { fillMinutes: Number(fillMin.toFixed(1)), trades: t.trades, raiseTargetBnb: t.raiseTargetBnb }));
      }
    }

    // 短时间交易爆发
    const ageSec = t.createdAt ? nowSec - t.createdAt : null;
    if (ageSec !== null && ageSec <= (cfg.freshWindowSec ?? 300) && (t.trades ?? 0) >= (cfg.freshTradesIn5Min ?? 20)) {
      signals.push(makeSignal("TRADE_BURST", t, { ageSec: Math.round(ageSec), trades: t.trades }));
    }
  }
  return signals;
}

/** 只保留"值得打扰"的信号（去重：同类型+同地址在窗口内只发一次） */
export function dedupe(signals, seen, windowMs = 30 * 60_000) {
  const now = Date.now();
  const out = [];
  for (const s of signals) {
    if (!s.address && !s.type.startsWith("NEW_MODE") && s.type !== "SCHEMA_DRIFT") { out.push(s); continue; }
    const key = `${s.type}:${s.address ?? s.field ?? s.track}`;
    if (seen[key] && now - seen[key] < windowMs) continue;
    seen[key] = now;
    out.push(s);
  }
  return out;
}

export function writeState(dir, { current, prevMeta, meta, seen }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "current.json"), JSON.stringify(current, null, 0));
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ prevMeta, meta, seen }, null, 2));
}

export function appendSignals(dir, signals) {
  if (!signals.length) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "signals.jsonl");
  fs.appendFileSync(file, signals.map((s) => JSON.stringify(s)).join("\n") + "\n");
}

/** 给 AI 的紧凑摘要：只含结论性字段，不带原始 JSON */
export function buildDigest({ ranked, signals, meta, cfg, topN = 6, maxBytes = 3500 }) {
  const lines = [];
  const t = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  lines.push(`# Gang 扫盘摘要 · ${t}`);
  lines.push("");
  const counts = Object.entries(meta?.uniqueCounts ?? meta?.counts ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ");
  lines.push(`**榜单**：${counts || "-"}`);
  const high = signals.filter((s) => s.priority === "high");
  lines.push(`**信号**：high=${high.length} / total=${signals.length}`);
  lines.push("");

  if (high.length) {
    lines.push("## 需要判断（HIGH）");
    high.slice(0, 8).forEach((s, i) => {
      const bits = [s.type, s.symbol, s.address ? s.address.slice(0, 10) + "…" : "", s.detail ?? ""].filter(Boolean);
      const ev = [];
      if (s.progressPct !== null && s.progressPct !== undefined) ev.push(`进度${s.progressPct}%`);
      if (s.fillMinutes) ev.push(`打满${s.fillMinutes}分钟`);
      if (s.trades) ev.push(`${s.trades}笔`);
      if (s.velocity) ev.push(`${s.velocity}%/min`);
      if (s.raiseTargetBnb) ev.push(`目标${s.raiseTargetBnb}BNB`);
      lines.push(`${i + 1}. ${bits.join(" · ")}${ev.length ? " —— " + ev.join(" / ") : ""}`);
    });
    lines.push("");
  }

  lines.push(`## 分数榜（前 ${topN}）`);
  lines.push("| 分数 | 符号 | 地址 | track | 进度 | 目标 | 交易 | 创建 |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const x of ranked.slice(0, topN)) {
    const created = x.createdAt ? new Date(x.createdAt * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }).slice(5) : "-";
    lines.push(
      `| ${x.score} | ${x.symbol ?? "?"} | ${x.address.slice(0, 10)}… | ${x.track} | ${x.progressPct ?? "-"}% | ${x.raiseTargetBnb ?? "-"} | ${x.trades ?? "-"} | ${created} |`
    );
  }
  lines.push("");
  lines.push("## 数据缺口");
  const missing = new Set();
  for (const x of ranked.slice(0, topN)) {
    if (x.holders === null) missing.add("holders");
    if (!x.fdvUsd) missing.add("fdvUsd");
    if (x.raiseTargetBnb === null) missing.add("raiseBnb");
    if (!x.createdAt) missing.add("createdAt");
  }
  lines.push(missing.size ? `- ${[...missing].join(" / ")}（部分盘缺失，判断时按"未知"处理）` : "- 无");

  let text = lines.join("\n");
  if (Buffer.byteLength(text) > maxBytes) text = text.slice(0, maxBytes) + "\n…（截断）";
  return text;
}

/** 只有需要判断的信号才进 AI 队列：high 信号 + 「可观察窗口」类（进度过半） */
export function buildAiQueue(signals, cfg) {
  const allow = new Set(cfg.ai?.onlySignals ?? []);
  const minStep = cfg.ai?.ladderMinStepForQueue ?? 50;
  return signals
    .filter((s) => {
      if (!allow.has(s.type)) return false;
      if (s.priority === "high") return true;
      return s.type === "PROGRESS_LADDER" && (s.step ?? 0) >= minStep;
    })
    .slice(0, cfg.ai?.maxQueueItemsPerRun ?? 3)
    .map((s) => ({
      type: s.type,
      category: s.category ?? null,
      symbol: s.symbol,
      address: s.address,
      track: s.track,
      evidence: {
        progressPct: s.progressPct, step: s.step ?? null, fillMinutes: s.fillMinutes, trades: s.trades,
        velocity: s.velocity, raiseTargetBnb: s.raiseTargetBnb, detail: s.detail ?? null,
      },
      ask: s.category === "intel"
        ? "这是事后情报：说明它为什么值得记录（或是否只是噪音），不要当成买入信号。"
        : "这是可观察窗口：说明它是否值得进一步采集（holders/资金流/合约门禁），并给出观察阈值。",
      at: new Date(s.at).toISOString(),
    }));
}

/**
 * 生成"开箱即用"的 prompt：上层只要把 prompt.txt 丢给模型即可，不用再拼格式。
 * 只在有 HIGH 信号时生成，避免 AI 读到"无信号"的废话。
 */
export function buildPrompt({ digest, queue, signals, cfg, generatedAt }) {
  const high = signals.filter((s) => s.priority === "high");
  if (!high.length) return null;
  const time = generatedAt ?? new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  const lines = [];
  lines.push(`你是链上打新情报分析员。下面是脚本自动扫出来的信号（${time} Asia/Shanghai）。`);
  lines.push(`脚本已经完成了抓取、比对、打分、去重；你只需要做判断，不要重新扫盘，不要编造数字。`);
  lines.push("");
  lines.push("## 硬约束");
  lines.push("- 只读分析：不要下单、不要签名、不要调用任何交易接口。");
  lines.push("- 只使用下面给出的数据；缺失的字段写“未知”，不要推测。");
  lines.push("- 输出必须 ≤ 5 行：①这信号意味着什么 ②风险或可疑点 ③是否值得进一步采集（具体采哪些字段） ④建议动作（观察/深入/忽略）。");
  lines.push("");
  lines.push("## 信号摘要");
  lines.push(digest);
  lines.push("");
  if (queue.length) {
    lines.push("## 待判断条目（优先级从高到低）");
    queue.forEach((q, i) => {
      lines.push(`${i + 1}. [${q.type}] ${q.symbol ?? "?"} ${q.address ?? ""} ${q.track ? "(" + q.track + ")" : ""}`);
      lines.push(`   证据：${JSON.stringify(q.evidence)}`);
    });
    lines.push("");
  }
  lines.push("## 回答格式");
  lines.push("每条形如：`[类型] 符号 地址 → 结论一句话 | 风险 | 下一步`，不要复述输入。");
  return lines.join("\n");
}

