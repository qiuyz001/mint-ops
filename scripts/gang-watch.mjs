#!/usr/bin/env node
/**
 * Gang 扫盘（抗漂移 + 省 AI）
 *
 *   node scripts/gang-watch.mjs                 # 扫一次，打印信号 + 写 digest
 *   node scripts/gang-watch.mjs --watch          # 常驻；HIGH 信号出现时退出(exit 10) 以便上层唤醒 AI
 *   node scripts/gang-watch.mjs --watch --stay   # 常驻且永不退出（只写文件，不打扰）
 *   node scripts/gang-watch.mjs --json           # 只输出机器可读结果
 *
 * 退出码：0 正常 · 10 出现 HIGH 信号 · 11 出现抗漂移事件（新 track / 字段变化） · 1 出错
 */
import fs from "node:fs";
import path from "node:path";
import { fetchAll, detectDrift } from "../src/watch/gang-api.js";
import { rank } from "../src/watch/score.js";
import { diff, dedupe, buildDigest, buildAiQueue, buildPrompt, appendSignals, writeState } from "../src/watch/signals.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const cfgAll = JSON.parse(fs.readFileSync(path.join(ROOT, "config/watch.json"), "utf8"));
const cfg = cfgAll.gang;
const OUT = path.join(ROOT, "data/gang");

const flag = (name) => process.argv.includes(`--${name}`);
const val = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const watch = flag("watch");
const stay = flag("stay");
const asJson = flag("json");
const interval = Number(val("interval", cfg.pollSec)) * 1000;
const only = val("kind", null);

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};

const state = readJson(path.join(OUT, "meta.json"), { prevMeta: null, meta: null, seen: {} });
let prevTokens = (() => {
  const cur = readJson(path.join(OUT, "current.json"), null);
  return cur?.tokens ?? {};
})();
let prevSnapshotAt = (() => {
  const cur = readJson(path.join(OUT, "current.json"), null);
  return cur?.at ?? null;
})();

async function cycle() {
  const started = Date.now();
  const conf = only ? { ...cfg, kinds: [only] } : cfg;
  const { results, errors } = await fetchAll(conf);
  if (!results.length) throw new Error(`所有请求失败：${JSON.stringify(errors).slice(0, 300)}`);

  const flat = [];
  const order = new Map(conf.kinds.map((k, i) => [k, i]));
  const byAddr = new Map();
  for (const r of results) {
    for (const it of r.items) {
      const cur = byAddr.get(it.address);
      if (!cur) { byAddr.set(it.address, it); continue; }
      // 同一 token 可能在多个 kind 里出现：保留更具体的 kind，字段互补
      if ((order.get(it.kind) ?? 9) < (order.get(cur.kind) ?? 9)) {
        for (const k of Object.keys(cur)) if (it[k] === null || it[k] === undefined) it[k] = cur[k];
        byAddr.set(it.address, it);
      } else {
        for (const k of Object.keys(it)) if (cur[k] === null || cur[k] === undefined) cur[k] = it[k];
      }
    }
  }
  for (const it of byAddr.values()) flat.push(it);

  // 打分（确定性）
  const ranked = rank(flat, prevTokens, cfg);

  // 漂移（抗漂移核心）
  const { drifts, meta } = detectDrift(state.prevMeta, results, conf);
  meta.counts = meta.counts || {};
  meta.uniqueCounts = flat.reduce((acc, t) => { acc[t.kind] = (acc[t.kind] || 0) + 1; return acc; }, {});

  // 信号
  const gapMs = prevSnapshotAt ? Date.now() - prevSnapshotAt : null;
  const gapTooLong = gapMs !== null && gapMs > (cfg.baselineResetAfterMin ?? 60) * 60_000;
  const baseline = !state.prevMeta || gapTooLong; // 首次运行 / 停机过久：只建基线，不补课
  const raw = diff(prevTokens, ranked, drifts, cfg, { baseline });
  const signals = dedupe(raw, state.seen);
  const high = signals.filter((s) => s.priority === "high");

  // 落盘
  const nextTokens = Object.fromEntries(ranked.map((t) => [t.address, { progressPct: t.progressPct, graduated: t.graduated, at: Date.now() }]));
  writeState(OUT, {
    current: { at: Date.now(), tokens: nextTokens },
    prevMeta: meta,
    meta,
    seen: state.seen,
  });
  // 关键：常驻模式下必须回写内存基线，否则下一轮还在跟"启动时快照"比
  prevTokens = nextTokens;
  prevSnapshotAt = Date.now();
  state.prevMeta = meta;
  appendSignals(OUT, signals);

  const digest = buildDigest({ ranked, signals, meta, cfg, topN: cfgAll.digest.topN, maxBytes: cfgAll.digest.maxBytes });
  fs.writeFileSync(path.join(OUT, "digest.md"), digest);

  const queue = buildAiQueue(signals, cfgAll);
  if (queue.length) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.appendFileSync(path.join(OUT, "ai-queue.jsonl"), queue.map((q) => JSON.stringify(q)).join("\n") + "\n");
  }

  // 只在高信号时生成"开箱即用"的 prompt；否则删掉旧的，避免 AI 读到过期内容
  const promptFile = path.join(OUT, cfgAll.ai?.promptFile ?? "prompt.txt");
  const prompt = buildPrompt({ digest, queue, signals, cfg: cfgAll });
  if (prompt) fs.writeFileSync(promptFile, prompt);
  else if (fs.existsSync(promptFile)) fs.unlinkSync(promptFile);

  const summary = {
    at: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    counts: meta.counts,
    uniqueCounts: meta.uniqueCounts,
    baseline,
    gapMinutes: gapMs === null ? null : Math.round(gapMs / 60000),
    signals: signals.map((s) => ({ type: s.type, category: s.category, priority: s.priority, symbol: s.symbol, address: s.address, detail: s.detail ?? null, fillMinutes: s.fillMinutes ?? null })),
    top: ranked.slice(0, cfgAll.digest.topN).map((x) => ({ symbol: x.symbol, address: x.address, score: x.score, progressPct: x.progressPct, track: x.track, trades: x.trades })),
    aiQueue: queue.length,
    promptFile: prompt ? path.relative(ROOT, promptFile) : null,
    errors,
  };
  return { summary, signals, drifts, digest, queue };
}

function printHuman({ summary, signals, digest, baseline }) {
  const c = summary.uniqueCounts || summary.counts;
  console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 榜单 ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ")} · ${summary.elapsedMs}ms${baseline ? " · 建立基线" : ""}`);
  if (!signals.length) { console.log("  无信号"); return; }
  for (const s of signals) {
    const tag = s.priority === "high" ? "!!" : "  ";
    const bits = [s.type, s.symbol ?? s.track ?? "", s.address ? s.address.slice(0, 8) : "", s.detail ?? ""].filter(Boolean);
    console.log(`${tag} ${bits.join(" ")}`);
  }
  console.log("--- digest ---");
  console.log(digest);
}

if (watch) {
  console.log(`[gang-watch] 每 ${interval / 1000}s 轮询 · kinds=${cfg.kinds.join("/")} · HIGH 时${stay ? "不退出" : "退出(10) 唤醒 AI"}`);
  let last = Date.now();
  for (;;) {
    try {
      const res = await cycle();
      // 每次轮询只打印一行，避免日志膨胀
      const high = res.signals.filter((s) => s.priority === "high");
      const prevAt = prevSnapshotAt ? new Date(prevSnapshotAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "-";
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] ${Object.entries(res.summary.uniqueCounts ?? res.summary.counts).map(([k, v]) => `${k}=${v}`).join(" ")} · signal=${res.signals.length} high=${high.length} · prev=${prevAt}`);
      if (high.length) printHuman(res);
      if (high.length && !stay) process.exit(high.some((s) => s.type === "NEW_MODE" || s.type === "SCHEMA_DRIFT") ? 11 : 10);
      if (high.length && stay) {
        // 已经通知过：更新 seen，下一轮不再重复
        last = Date.now();
      }
    } catch (error) {
      console.error(`[gang-watch] 轮询失败: ${String(error.message).slice(0, 160)}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
} else {
  const res = await cycle();
  if (asJson) console.log(JSON.stringify(res.summary, null, 2));
  else printHuman(res);
  if (res.drifts.length) process.exit(11);
  if (res.signals.some((s) => s.priority === "high")) process.exit(10);
  process.exit(0);
}
