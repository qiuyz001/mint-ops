import fs from "node:fs";
import { buildDigest, buildAiQueue, buildPrompt } from "../src/watch/signals.js";

const cfg = JSON.parse(fs.readFileSync(new URL("../config/watch.json", import.meta.url), "utf8"));
const ranked = [
  { symbol: "FLY", address: "0xcd412f1a25875bbb03b56018905695d930542c99", track: "fly", progressPct: 100, raiseTargetBnb: 20, trades: 1088, createdAt: Math.floor(Date.now() / 1000) - 3600, graduated: true, graduatedAt: Math.floor(Date.now() / 1000) - 2823, holders: 900, fdvUsd: 0, score: 88, reasons: ["已打满"] },
  { symbol: "AGI", address: "0x7605a8bdd43aad88fa274a5c95c34cca9edcee67", track: "fly", progressPct: 4, raiseTargetBnb: 20, trades: 100, createdAt: Math.floor(Date.now() / 1000) - 2400, graduated: false, holders: null, fdvUsd: 0, score: 40, reasons: [] },
];
const signals = [
  { type: "FAST_FILL", priority: "high", symbol: "FLY", address: ranked[0].address, track: "fly", progressPct: 100, fillMinutes: 12.8, trades: 1088, raiseTargetBnb: 20, at: Date.now() },
  { type: "NEW_MODE", priority: "high", detail: "出现未知 track=swim（新模式）", track: "swim", at: Date.now() },
  { type: "NEW_TOKEN", priority: "med", symbol: "AGI", address: ranked[1].address, track: "fly", at: Date.now() },
];
const meta = { counts: { fly: 5, fair: 25, v3: 60, stocks: 60 } };

const digest = buildDigest({ ranked, signals, meta, cfg: cfg.gang, topN: 6, maxBytes: 3500 });
const queue = buildAiQueue(signals, cfg);
const prompt = buildPrompt({ digest, queue, signals, cfg });

console.log("=== digest", Buffer.byteLength(digest), "bytes ===");
console.log(digest);
console.log("\n=== queue", queue.length, "items ===");
console.log(JSON.stringify(queue, null, 1).slice(0, 500));
console.log("\n=== prompt", Buffer.byteLength(prompt), "bytes ===");
console.log(prompt);
