import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { entryDecision, exitDecision, riskDecision, auditAllowed } from '../src/autopilot/strategy.js';
import { identity, normalizePulse, normalizeAudit, discover } from '../src/autopilot/feeds.js';
import { Engine, StateFile, initialState, decimal } from '../src/autopilot/engine.js';
import { BawBroker } from '../src/autopilot/broker.js';
const config = () => JSON.parse(fs.readFileSync(new URL('../config/autopilot.json', import.meta.url)));
const now = 1800000000000;
const addr = `0x${'a'.repeat(40)}`;
const token = () => ({ key: `56:${addr}`, address: addr, chainId: '56', source: 'test', progress: 90, price: 1, graduated: false,
  createdAt: now - 60000, observedAt: now, liquidity: 20000, netBuy: 3000, top10: 20, dev: 1, bundler: 2, buyTax: 0, sellTax: 0 });
const prev = () => ({ ...token(), progress: 88, observedAt: now - 20000 });
const audit = async t => ({ key: t.key, at: now, level: 'LOW', verified: true, hits: [], buyTax: 0, sellTax: 0 });
function memory(c) { return { state: initialState(c), dir: os.tmpdir(), save() {}, event() {} }; }
test('entry needs momentum, age, depth and complete risk fields', () => {
  const c = config(), t = token(); assert.equal(entryDecision(t, prev(), c, now).eligible, true);
  for (const field of ['progress', 'liquidity', 'top10', 'dev', 'bundler', 'buyTax', 'sellTax', 'createdAt', 'price']) {
    assert.equal(entryDecision({ ...t, [field]: null }, prev(), c, now).eligible, false, field);
  }
  assert.equal(entryDecision(t, null, c, now).eligible, false);
  assert.equal(entryDecision(t, { ...prev(), observedAt: now - 120000 }, c, now).eligible, false);
  assert.equal(entryDecision({ ...t, observedAt: now - 20000 }, prev(), c, now).eligible, false);
  assert.equal(entryDecision({ ...t, graduated: true }, prev(), c, now).eligible, false);
});
test('identity preserves Solana case and separates EVM chains', () => {
  assert.notEqual(identity('56', addr), identity('8453', addr));
  const sol = 'So11111111111111111111111111111111111111112';
  assert.equal(identity('CT_501', sol), `CT_501:${sol}`);
  assert.throws(() => identity('56', 'unknown'));
  assert.throws(() => normalizePulse({ chainId: '8453', contractAddress: addr }, '56', 20));
});
test('pulse percentages are already percentages and unknown tax remains null', () => {
  const t = normalizePulse({ chainId: '56', contractAddress: addr, progress: '95.5', taxRateBuy: null }, '56', 20, now);
  assert.equal(t.progress, 95.5); assert.equal(t.buyTax, null);
});
test('missing and stale audit is rejected', async () => {
  const c = config(), t = token(), a = await audit(t);
  assert.equal(auditAllowed(a, t, c, now), true);
  for (const patch of [{ verified: null }, { hits: ['honeypot'] }, { sellTax: null }, { at: now - 40000 }, { key: 'wrong' }])
    assert.equal(auditAllowed({ ...a, ...patch }, t, c, now), false);
});
test('stop, partial profits, trailing, timeout and stalled exits', () => {
  const c = config().exit, p = { entryPrice: 1, peakPrice: 1, qty: 100, originalQty: 100, openedAt: now, taken: [] };
  assert.equal(exitDecision(p, 0.8, c, now).reason, 'stop_loss');
  const first = exitDecision(p, 1.6, c, now); assert.equal(first.fraction, 0.3);
  assert.equal(exitDecision({ ...p, qty: 70, taken: [0] }, 2.1, c, now).fraction, 30 / 70);
  assert.equal(exitDecision({ ...p, peakPrice: 2 }, 1.5, c, now).reason, 'trailing_stop');
  assert.equal(exitDecision(p, 1.2, c, now + c.maxHoldMs).reason, 'time_exit');
  assert.equal(exitDecision(p, 1, c, now + c.stallAfterMs).reason, 'stalled');
  assert.equal(exitDecision(p, null, c, now), null);
});
test('risk reserves potential full loss and blocks unresolved orders', () => {
  const c = config(), t = token(); c.risk.dailyLossUsd = 7.5; const s = initialState(c);
  assert.equal(riskDecision(s, t, c, now).eligible, true);
  s.positions.other = { qty: 1, costRemaining: 10 };
  assert.ok(riskDecision(s, t, c, now).reasons.includes('daily_loss_budget'));
  s.orders.push({ status: 'unknown' }); assert.ok(riskDecision(s, t, c, now).reasons.includes('unresolved_order'));
});
test('paper buy/sell persists fills and never invokes a wallet', async () => {
  const c = config(), store = memory(c), t = token(); store.state.snapshots[t.key] = prev();
  const e = new Engine(c, store, { now: () => now, audit, broker: new Proxy({}, { get() { throw Error('wallet called in paper mode'); } }) });
  await e.scan([t]); assert.ok(store.state.positions[t.key].qty > 0); assert.equal(store.state.cashUsd, 95);
  store.state.snapshots[t.key] = { ...t, price: 0.8 };
  await e.tick(); assert.equal(store.state.positions[t.key].qty, 0); assert.ok(store.state.cashUsd < 100);
});
test('live send timeout is durably unknown and never resubmitted', async () => {
  const c = config(); c.mode = 'live'; const store = memory(c); let calls = 0;
  const e = new Engine(c, store, { now: () => now, broker: { async submit() { calls++; throw Error('timeout'); } } });
  await e.place(token(), 'buy', '5', { day: '2027-01-15' });
  assert.equal(store.state.orders[0].status, 'unknown');
  await e.place(token(), 'buy', '5', {}); await e.tick(); assert.equal(calls, 1);
});
test('BAW unconfirmed FINISHED is not a fill', async () => {
  const c = config(); const broker = new BawBroker(c, async () => ({ list: [{ orderId: '1', status: 'FINISHED', txHash: null }] }));
  assert.equal(await broker.reconcile({ orderId: '1', token: token() }), null);
});
test('durable state rejects corruption instead of resetting account', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-ops-test-'));
  try { const c = config(); const s = new StateFile(dir, c); s.state.cashUsd = 42; s.save(); assert.equal(new StateFile(dir, c).state.cashUsd, 42);
    fs.writeFileSync(s.file, '{bad'); assert.throws(() => new StateFile(dir, c));
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('source failure is isolated and malformed schema is explicit', async () => {
  const c = config(); c.gang.enabled = false; c.feeds = [{ chainId: '56', protocols: [2002], stages: [10, 20] }];
  const r = await discover(c, async (_url, body) => body.rankType === 10 ? { data: {} } : { data: [{ chainId: '56', contractAddress: addr, protocol: 2002 }] });
  assert.equal(r.rows.length, 1); assert.equal(r.errors.length, 1);
});
test('decimal uses human units without scientific notation', () => {
  assert.equal(decimal(10), '10'); assert.equal(decimal(0.00001), '0.00001'); assert.throws(() => decimal(1e-10));
});
test('slow candidate audit does not block an existing stop loss', async () => {
  const c = config(); c.risk.dailyLossUsd = 100;
  const store = memory(c), t = token(), old = { ...t, key: `56:0x${'b'.repeat(40)}`, address: `0x${'b'.repeat(40)}` };
  store.state.snapshots[t.key] = prev();
  let release, started;
  const waiting = new Promise(r => { started = r; });
  const e = new Engine(c, store, { now: () => now, audit: async t => { started(); await new Promise(r => { release = r; }); return audit(t); } });
  e.buyFill(old, 10, 10, 0, 'test'); store.state.snapshots[old.key] = { ...old, price: 0.7 };
  const scan = e.scan([t]); await waiting;
  await e.tick(); assert.equal(store.state.positions[old.key].qty, 0);
  release(); await scan;
});
test('a failed sell pauses only its own retries; other positions can exit', async () => {
  const c = config(); c.mode = 'live'; const store = memory(c); let submits = 0;
  const e = new Engine(c, store, { now: () => now, broker: { quote: async () => ({ amount: 7 }), submit: async () => { submits++; return 'new'; } } });
  const t = token(); e.buyFill(t, 10, 10, 0, 'test'); store.state.paused = true;
  await e.tick(); assert.equal(submits, 1);
});
test('missing migration status never becomes confirmed bonding', () => {
  const t = normalizePulse({ chainId: '56', contractAddress: addr }, '56', 20, now);
  assert.equal(t.graduated, null);
});
test('partial fills keep the unfilled take-profit quantity outstanding', () => {
  const c = config(), store = memory(c), t = token();
  const e = new Engine(c, store, { now: () => now }); e.buyFill(t, 100, 100, 0, 'test');
  const p = store.state.positions[t.key]; e.sellFill(p, 10, 15, 0, 0);
  assert.deepEqual(p.taken, []);
  assert.equal(exitDecision(p, 1.6, c.exit, now).fraction, 20 / 90);
  e.sellFill(p, 20, 30, 0, 0); assert.deepEqual(p.taken, [0]);
});
test('user mandate caps buys at $5 and permits no daily loss cap', async () => {
  const c = config(); assert.equal(c.risk.orderUsd, 5); assert.equal(c.risk.dailyLossUsd, null);
  const store = memory(c); store.state.days[new Date(now + 28800000).toISOString().slice(0, 10)] = { spent: 0, pnl: -100 };
  assert.equal(riskDecision(store.state, token(), c, now).eligible, true);
  const e = new Engine(c, store); await assert.rejects(e.place(token(), 'buy', '5.01', {}), /mandate/);
});
test('state replacement tolerates temporary Windows sharing violations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-ops-sharing-test-'));
  const rename = fs.renameSync;
  let attempts = 0;
  try {
    const store = new StateFile(dir, config()); store.save(); store.state.cashUsd = 95;
    fs.renameSync = (...args) => {
      if (++attempts <= 2) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' });
      return rename(...args);
    };
    store.save(); assert.equal(attempts, 3);
    assert.equal(new StateFile(dir, config()).state.cashUsd, 95);
  } finally { fs.renameSync = rename; fs.rmSync(dir, { recursive: true }); }
});
test('permanent state replacement errors remain fatal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-ops-save-failure-'));
  const rename = fs.renameSync;
  try {
    const store = new StateFile(dir, config()); store.save();
    fs.renameSync = () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); };
    assert.throws(() => store.save(), /no space/);
  } finally { fs.renameSync = rename; fs.rmSync(dir, { recursive: true }); }
});
test('audit accepts documented numeric risk grade when the text enum is absent', () => {
  const d = { hasResult: true, isSupported: true, riskLevelEnum: null, riskLevel: 0,
    extraInfo: { isVerified: true, buyTax: '0', sellTax: '0' }, riskItems: [{ details: [{ isHit: false }] }] };
  const t = token(), a = normalizeAudit(d, t.key, now);
  assert.equal(a.level, 'LOW'); assert.equal(a.levelSource, 'numeric'); assert.equal(auditAllowed(a, t, config(), now), true);
  assert.equal(normalizeAudit({ ...d, riskLevel: null }, t.key).level, null);
  assert.equal(normalizeAudit({ ...d, riskLevel: -1 }, t.key).level, null);
  assert.equal(normalizeAudit({ ...d, riskLevel: 4 }, t.key).level, 'HIGH');
});
test('numeric audit fallback keeps stronger risks and all availability checks', () => {
  const d = { hasResult: true, isSupported: true, riskLevelEnum: 'LOW', riskLevel: 5,
    extraInfo: { isVerified: true, buyTax: '0', sellTax: '0' }, riskItems: [{ details: [{ isHit: false }] }] };
  const t = token(); assert.equal(normalizeAudit(d, t.key).level, 'HIGH');
  assert.equal(normalizeAudit({ ...d, riskLevelEnum: 'HIGH', riskLevel: 0 }, t.key).level, 'HIGH');
  assert.throws(() => normalizeAudit({ ...d, hasResult: false }, t.key));
  assert.throws(() => normalizeAudit({ ...d, riskItems: [] }, t.key));
});
