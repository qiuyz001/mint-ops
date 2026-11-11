#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, audit } from '../src/autopilot/feeds.js';
import { StateFile, Engine } from '../src/autopilot/engine.js';
import { BawBroker } from '../src/autopilot/broker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const durationIndex = args.indexOf('--duration-sec');
const durationSec = durationIndex >= 0 ? Number(args[durationIndex + 1]) : null;
if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec <= 0)) throw new Error('duration-sec must be positive');
const configArg = args.indexOf('--config');
const cfg = JSON.parse(fs.readFileSync(configArg >= 0 ? path.resolve(args[configArg + 1]) : path.join(root, 'config/autopilot.json'), 'utf8'));
if (!['paper', 'live'].includes(cfg.mode)) throw new Error('mode must be paper or live');
for (const [group, names] of Object.entries({ risk: ['orderUsd', 'maxExposureUsd', 'maxPositions', 'dailySpendUsd', 'dailyLossUsd', 'maxPositionLiquidityPct', 'cooldownMs'], entry: ['minProgress', 'maxProgress', 'minVelocityPerMin', 'maxSnapshotGapMs', 'maxAgeMs', 'minNetBuyUsd', 'minLiquidityUsd', 'maxTop10Pct', 'maxDevPct', 'maxBundlerPct', 'maxTaxPct', 'maxQuoteLossPct', 'signalTtlMs', 'auditTtlMs'], exit: ['stopLossPct', 'trailActivateMultiple', 'trailDrawdownPct', 'maxHoldMs', 'stallAfterMs', 'stallMaxGainPct'] })) {
  for (const name of names) {
    if (group === 'risk' && name === 'dailyLossUsd' && cfg.risk.dailyLossUsd === null) continue;
    if (!(typeof cfg[group]?.[name] === 'number' && Number.isFinite(cfg[group][name]) && cfg[group][name] > 0)) throw new Error(`Invalid ${group}.${name}`);
  }
}
if (cfg.risk.orderUsd > 5) throw new Error('User mandate: at most $5 input per buy');
if (!(cfg.scanIntervalMs >= 1000 && cfg.positionIntervalMs >= 1000 && cfg.timeoutMs > 0) || cfg.entry.minProgress >= cfg.entry.maxProgress || cfg.entry.maxProgress > 100 || cfg.exit.stopLossPct >= 100 || cfg.exit.trailDrawdownPct >= 100 || !(cfg.paper.initialCashUsd > 0) || !(cfg.paper.costBpsPerSide >= 0 && cfg.paper.costBpsPerSide < 10000)) throw new Error('Invalid timing, progress or paper settings');
if (!Array.isArray(cfg.exit.takeProfit) || cfg.exit.takeProfit.some(s => !(s.multiple > 1 && s.originalPct > 0)) || cfg.exit.takeProfit.reduce((n, s) => n + s.originalPct, 0) > 100) throw new Error('Invalid take-profit ladder');
if (cfg.mode === 'live' && (process.env.MINT_OPS_LIVE !== '1' || cfg.execution.armed !== true || !/^0x[0-9a-fA-F]{40}$/.test(cfg.execution.expectedAddress) || !(cfg.execution.maxSlippagePct > 0 && cfg.execution.maxSlippagePct <= 5))) throw new Error('Live requires armed, expectedAddress, capped slippage and MINT_OPS_LIVE=1');
const dir = path.resolve(root, cfg.dataDir);
fs.mkdirSync(dir, { recursive: true });
const lockPath = path.join(dir, `${cfg.mode}.lock`);
// Never auto-break a lock: a crashed sender could still have an in-flight transaction.
const lock = fs.openSync(lockPath, 'wx'); fs.writeFileSync(lock, String(process.pid));
let stopping = false;
const timers = new Map();
const stop = () => { stopping = true; for (const [t, resolve] of timers) { clearTimeout(t); resolve(); } timers.clear(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const durationTimer = durationSec === null ? null : setTimeout(stop, durationSec * 1000);
const sleep = ms => new Promise(resolve => { const t = setTimeout(() => { timers.delete(t); resolve(); }, ms); timers.set(t, resolve); });
try {
  const store = new StateFile(dir, cfg), broker = new BawBroker(cfg);
  const outbox = path.join(dir, 'notifications.jsonl');
  const engine = new Engine(cfg, store, { audit, broker, notify: async row => {
    fs.appendFileSync(outbox, `${JSON.stringify({ id: crypto.randomUUID(), at: Date.now(), ...row })}\n`);
    console.log(JSON.stringify(row));
  } });
  let cursorFile = path.join(dir, 'notification-cursor.json');
  let cursor = fs.existsSync(cursorFile) ? JSON.parse(fs.readFileSync(cursorFile, 'utf8')).line : 0;
  async function deliver() {
    // Read credentials only from environment, never put them in config or logs.
    const url = process.env.MINT_OPS_WEBHOOK_URL;
    const telegram = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;
    if ((!url && !telegram) || !fs.existsSync(outbox)) return;
    const lines = fs.readFileSync(outbox, 'utf8').trim().split('\n');
    for (let sent = 0; cursor < lines.length && sent < 10; cursor++, sent++) {
      const row = JSON.parse(lines[cursor]);
      const text = JSON.stringify(row).slice(0, 3800);
      const response = await fetch(url || `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(url ? row : { chat_id: process.env.TELEGRAM_CHAT_ID, text }), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok || (!url && (await response.json()).ok !== true)) throw new Error('Notification delivery failed');
      fs.writeFileSync(`${cursorFile}.tmp`, JSON.stringify({ line: cursor + 1 })); fs.renameSync(`${cursorFile}.tmp`, cursorFile);
    }
  }
  async function scan() {
    const res = await discover(cfg, undefined, rows => engine.scan(rows));
    fs.writeFileSync(path.join(dir, 'health.json'), JSON.stringify({ at: Date.now(), count: res.rows.length, errors: res.errors }));
    for (const e of res.errors) await engine.notice('source_error', e, e.source);
  }
  if (args.includes('--once')) { await scan(); await engine.tick(); await deliver(); }
  else {
    console.log(`autopilot mode=${cfg.mode}; LLM calls=0; data=${dir}`);
    // Separate loops: slow source polling does not hold up position marking / order reconciliation.
    async function loop(fn, interval, label) {
      while (!stopping) {
        const started = Date.now();
        try { await fn(); } catch (e) { store.event({ type: `${label}_error`, error: label === 'notify' ? 'delivery failed' : e.message }); }
        if (!stopping) await sleep(Math.max(100, interval - (Date.now() - started)));
      }
    }
    await Promise.all([loop(scan, cfg.scanIntervalMs, 'scan'), loop(() => engine.tick(), cfg.positionIntervalMs, 'position'), loop(deliver, 5000, 'notify')]);
  }
} finally {
  if (durationTimer !== null) clearTimeout(durationTimer);
  fs.closeSync(lock); fs.unlinkSync(lockPath);
}
