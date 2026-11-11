import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { entryDecision, riskDecision, auditAllowed, exitDecision } from './strategy.js';

export function initialState(cfg) {
  return { version: 1, mode: cfg.mode, cashUsd: cfg.paper.initialCashUsd, positions: {}, days: {}, lastEntry: {}, snapshots: {}, orders: [], notices: {}, paused: false };
}
export class StateFile {
  constructor(dir, cfg) {
    fs.mkdirSync(dir, { recursive: true }); this.dir = dir; this.file = path.join(dir, `${cfg.mode}-state.json`);
    if (fs.existsSync(this.file)) {
      // Corruption is fatal; never silently replace an existing account with an empty one.
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (this.state.version !== 1 || this.state.mode !== cfg.mode || !this.state.positions || !this.state.orders || !this.state.days) throw new Error('Invalid account state');
    } else this.state = initialState(cfg);
  }
  save() {
    const tmp = `${this.file}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(this.state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
  }
  event(row) { fs.appendFileSync(path.join(this.dir, 'events.jsonl'), `${JSON.stringify({ at: Date.now(), ...row })}\n`); }
}
export class Engine {
  constructor(cfg, store, { audit, broker, notify = async () => {}, now = Date.now } = {}) {
    Object.assign(this, { cfg, store, audit, broker, notify, now }); this.busy = false;
  }
  async notice(type, data, key = type) {
    const s = this.store.state, now = this.now();
    if (now - (s.notices[key] ?? -Infinity) < 60000) return;
    s.notices[key] = now; this.store.save();
    const row = { type, ...data }; this.store.event(row);
    // Notification delivery must never block an exit. A separate outbox worker sends it.
    await this.notify(row);
  }
  async exclusive(fn) {
    if (this.busy) return;
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  async scan(rows) {
    // Discovery/audit/quote I/O runs outside the wallet mutex, so existing exits keep ticking.
    if (this.busy) return;
      const s = this.store.state;
      for (const t of rows) {
        const prev = s.snapshots[t.key]; s.snapshots[t.key] = t;
        const decision = entryDecision(t, prev, this.cfg, this.now());
        if (t.progress >= this.cfg.entry.minProgress && decision.velocity >= this.cfg.entry.minVelocityPerMin)
          await this.notice('candidate', { token: t, decision }, `candidate:${t.key}`);
        if (!decision.eligible || s.paused || fs.existsSync(path.join(this.store.dir, 'HALT_BUYS'))) continue;
        const risk = riskDecision(s, t, this.cfg, this.now());
        if (!risk.eligible) { this.store.event({ type: 'entry_rejected', key: t.key, reasons: risk.reasons }); continue; }
        try {
          const a = await this.audit(t, this.cfg);
          if (!auditAllowed(a, t, this.cfg, this.now())) { this.store.event({ type: 'audit_rejected', key: t.key, audit: a }); continue; }
          if (this.cfg.mode === 'live') {
            if (!this.cfg.execution.allowedChains.includes(t.chainId)) continue;
            const stable = { ...t, address: this.cfg.execution.settlementToken };
            if (await this.broker.balance(stable) < this.cfg.risk.orderUsd) throw new Error('Insufficient settlement balance');
            const q = await this.broker.quote(t, 'buy', String(this.cfg.risk.orderUsd));
            const reverse = await this.broker.quote(t, 'sell', decimal(q.amount));
            if (reverse.amount < this.cfg.risk.orderUsd * (1 - this.cfg.entry.maxQuoteLossPct / 100)) throw new Error('Round-trip loss too high');
            if (!auditAllowed(a, t, this.cfg, this.now()) || !entryDecision(t, prev, this.cfg, this.now()).eligible) throw new Error('Entry evidence expired');
            await this.exclusive(async () => {
              const latestRisk = riskDecision(s, t, this.cfg, this.now());
              if (latestRisk.eligible && !s.paused && !fs.existsSync(path.join(this.store.dir, 'HALT_BUYS')) && entryDecision(t, prev, this.cfg, this.now()).eligible)
                await this.place(t, 'buy', String(this.cfg.risk.orderUsd), { day: latestRisk.day });
            });
          } else {
            const cost = this.cfg.risk.orderUsd, qty = cost / t.price / (1 + this.cfg.paper.costBpsPerSide / 10000);
            await this.exclusive(async () => {
              if (!riskDecision(s, t, this.cfg, this.now()).eligible || s.paused || fs.existsSync(path.join(this.store.dir, 'HALT_BUYS'))) return;
              this.buyFill(t, cost, qty, 0, risk.day);
              this.store.save(); await this.notice('paper_buy', { key: t.key, cost, qty }, `buy:${t.key}`);
            });
          }
        } catch (e) { await this.notice('entry_error', { key: t.key, error: e.message }, `entry_error:${t.key}`); }
      }
      const cutoff = this.now() - this.cfg.entry.maxSnapshotGapMs;
      for (const [key, t] of Object.entries(s.snapshots)) if (t.observedAt < cutoff && !s.positions[key]?.qty) delete s.snapshots[key];
      this.store.save();
  }
  buyFill(t, spent, qty, fee, day) {
    const s = this.store.state, cost = spent + fee;
    s.cashUsd -= cost; s.days[day] ??= { spent: 0, pnl: 0 }; s.days[day].spent += cost;
    s.lastEntry[t.key] = this.now();
    s.positions[t.key] = { token: t, qty, originalQty: qty, entryPrice: cost / qty, peakPrice: cost / qty,
      costRemaining: cost, openedAt: this.now(), taken: [] };
  }
  sellFill(p, sold, received, fee, step) {
    if (sold > p.qty * 1.000001) throw new Error('Receipt sold more than managed position');
    const fraction = Math.min(1, sold / p.qty), cost = p.costRemaining * fraction;
    const day = new Date(this.now() + 8 * 3600000).toISOString().slice(0, 10);
    this.store.state.days[day] ??= { spent: 0, pnl: 0 };
    this.store.state.days[day].pnl += received - fee - cost; this.store.state.cashUsd += received - fee;
    p.qty = Math.max(0, p.qty - sold); p.costRemaining -= cost;
    if (step !== undefined) {
      p.stepSold ??= {}; p.stepSold[step] = (p.stepSold[step] ?? 0) + sold;
      if (p.stepSold[step] >= p.originalQty * this.cfg.exit.takeProfit[step].originalPct / 100 * (1 - 1e-8) && !p.taken.includes(step)) p.taken.push(step);
    }
  }
  async place(t, side, qty, extra) {
    const s = this.store.state;
    if (s.orders.some(o => !['confirmed', 'failed'].includes(o.status))) return;
    const o = { id: randomUUID(), status: 'submitting', side, qty, token: t, ...extra, at: this.now() };
    s.orders.push(o); this.store.save(); // durable before any transaction submission
    try { o.orderId = await this.broker.submit(t, side, qty); o.status = 'pending'; }
    catch (e) { o.status = 'unknown'; o.error = e.message; s.paused = true; }
    this.store.save(); await this.notice('order_submitted', { order: o }, o.id);
  }
  async tick() {
    return this.exclusive(async () => {
      const s = this.store.state;
      for (const o of s.orders.filter(x => x.status === 'pending')) {
        try {
          const fill = await this.broker.reconcile(o);
          if (!fill) continue;
          if (fill.failed) { o.status = 'failed'; s.paused = true; if (o.side === 'sell') s.positions[o.token.key].exitBlocked = true; }
          else {
            if (o.side === 'buy') this.buyFill(o.token, fill.spent, fill.received, fill.feeUsd, o.day);
            else this.sellFill(s.positions[o.token.key], fill.spent, fill.received, fill.feeUsd, o.step);
            o.status = 'confirmed'; o.fill = fill;
          }
          this.store.save(); await this.notice('order_terminal', { order: o }, `terminal:${o.id}`);
        } catch (e) { await this.notice('reconcile_error', { orderId: o.orderId, error: e.message }, `reconcile:${o.id}`); }
      }
      // Unknown/submitting orders freeze all further sends, including after restart.
      if (s.orders.some(o => !['confirmed', 'failed'].includes(o.status))) return;
      for (const p of Object.values(s.positions).filter(x => x.qty > 0)) {
        try {
          let price;
          if (this.cfg.mode === 'live') {
            const q = await this.broker.quote(p.token, 'sell', decimal(p.qty)); price = q.amount / p.qty;
          } else {
            const t = s.snapshots[p.token.key];
            if (!t || this.now() - t.observedAt > this.cfg.entry.signalTtlMs || !(t.price > 0)) {
              await this.notice('position_price_stale', { key: p.token.key }, `stale:${p.token.key}`); continue;
            }
            price = t.price * (1 - this.cfg.paper.costBpsPerSide / 10000);
          }
          const exit = exitDecision(p, price, this.cfg.exit, this.now());
          p.peakPrice = Math.max(p.peakPrice, price); this.store.save();
          if (!exit) continue;
          const qty = p.qty * exit.fraction;
          if (this.cfg.mode === 'live') {
            if (p.exitBlocked) { await this.notice('exit_needs_attention', { key: p.token.key, exit }, `exit_paused:${p.token.key}`); continue; }
            await this.place(p.token, 'sell', decimal(qty), { step: exit.step, reason: exit.reason });
          } else {
            this.sellFill(p, qty, qty * price, 0, exit.step); this.store.save();
            await this.notice('paper_sell', { key: p.token.key, qty, price, reason: exit.reason }, `sell:${p.token.key}:${exit.reason}`);
          }
        } catch (e) { await this.notice('exit_error', { key: p.token.key, error: e.message }, `exit_error:${p.token.key}`); }
      }
    });
  }
}
export function decimal(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid order amount');
  // Round down to 8 human-unit decimal places; never overspend from rounding.
  const amount = (Math.floor(value * 1e8) / 1e8).toFixed(8).replace(/\.?0+$/, '');
  if (!amount || Number(amount) <= 0) throw new Error('Amount below supported precision');
  return amount;
}
