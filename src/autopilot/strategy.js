const finite = x => typeof x === 'number' && Number.isFinite(x);
export function entryDecision(t, prev, cfg, now = Date.now()) {
  const reasons = [], c = cfg.entry;
  const requireMin = (name, value, min) => { if (!finite(value) || value < min) reasons.push(name); };
  const requireMax = (name, value, max) => { if (!finite(value) || value < 0 || value > max) reasons.push(name); };
  if (!finite(t.observedAt) || now < t.observedAt || now - t.observedAt > c.signalTtlMs) reasons.push('stale_signal');
  if (!finite(t.createdAt) || t.createdAt > now || now - t.createdAt > c.maxAgeMs) reasons.push('age_unknown_or_old');
  requireMin('progress_low_or_unknown', t.progress, c.minProgress);
  requireMax('progress_too_late_or_unknown', t.progress, c.maxProgress);
  if (t.graduated !== false) reasons.push('not_confirmed_bonding');
  if (!finite(t.price) || t.price <= 0) reasons.push('price_unknown');
  const gap = prev ? t.observedAt - prev.observedAt : 0;
  const velocity = prev && finite(prev.progress) && gap > 0 && gap <= c.maxSnapshotGapMs ? (t.progress - prev.progress) / (gap / 60000) : null;
  requireMin('no_confirmed_momentum', velocity, c.minVelocityPerMin);
  requireMin('net_buy_unknown_or_low', t.netBuy, c.minNetBuyUsd);
  requireMin('liquidity_unknown_or_low', t.liquidity, c.minLiquidityUsd);
  requireMax('top10_unknown_or_high', t.top10, c.maxTop10Pct);
  requireMax('dev_unknown_or_high', t.dev, c.maxDevPct);
  requireMax('bundler_unknown_or_high', t.bundler, c.maxBundlerPct);
  requireMax('buy_tax_unknown_or_high', t.buyTax, c.maxTaxPct);
  requireMax('sell_tax_unknown_or_high', t.sellTax, c.maxTaxPct);
  if (t.wash === true) reasons.push('wash_trading');
  if (t.tokenVersion === 'openfour.meme.AgentIdExclusive' && !t.graduated) reasons.push('agent_id_entitlement_unverified');
  return { eligible: reasons.length === 0, reasons, velocity };
}
export function auditAllowed(a, t, cfg, now = Date.now()) {
  return a?.key === t.key && now >= a.at && now - a.at <= cfg.entry.auditTtlMs && a.level === 'LOW' && a.verified === true &&
    Array.isArray(a.hits) && a.hits.length === 0 && [a.buyTax, a.sellTax].every(x => finite(x) && x >= 0 && x <= cfg.entry.maxTaxPct);
}
export function exitDecision(p, price, cfg, now = Date.now()) {
  if (!finite(price) || price <= 0) return null;
  const multiple = price / p.entryPrice, peak = Math.max(p.peakPrice, price);
  if (multiple <= 1 - cfg.stopLossPct / 100) return { reason: 'stop_loss', fraction: 1 };
  if (peak / p.entryPrice >= cfg.trailActivateMultiple && price <= peak * (1 - cfg.trailDrawdownPct / 100)) return { reason: 'trailing_stop', fraction: 1 };
  if (now - p.openedAt >= cfg.maxHoldMs) return { reason: 'time_exit', fraction: 1 };
  if (now - p.openedAt >= cfg.stallAfterMs && multiple <= 1 + cfg.stallMaxGainPct / 100) return { reason: 'stalled', fraction: 1 };
  const step = cfg.takeProfit.findIndex((s, i) => !p.taken.includes(i) && multiple >= s.multiple);
  if (step !== -1) return { reason: `take_profit_${step}`, step, fraction: Math.min(1, (p.originalQty * cfg.takeProfit[step].originalPct / 100 - (p.stepSold?.[step] ?? 0)) / p.qty) };
  return null;
}
export function riskDecision(state, t, cfg, now = Date.now()) {
  const r = cfg.risk, positions = Object.values(state.positions).filter(p => p.qty > 0);
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const daily = state.days[day] ?? { spent: 0, pnl: 0 };
  const reasons = [];
  if (state.positions[t.key]?.qty > 0) reasons.push('already_holding');
  if (state.orders.some(o => !['confirmed', 'failed'].includes(o.status))) reasons.push('unresolved_order');
  if (now - (state.lastEntry[t.key] ?? -Infinity) < r.cooldownMs) reasons.push('cooldown');
  if (positions.length >= r.maxPositions) reasons.push('position_cap');
  if (positions.reduce((n, p) => n + p.costRemaining, 0) + r.orderUsd > r.maxExposureUsd) reasons.push('exposure_cap');
  if (daily.spent + r.orderUsd > r.dailySpendUsd) reasons.push('daily_spend_cap');
  // Charge open positions at their remaining cost: the daily loss cap reserves worst-case loss.
  if (r.dailyLossUsd !== null && Math.min(0, daily.pnl) - positions.reduce((n, p) => n + p.costRemaining, 0) - r.orderUsd < -r.dailyLossUsd) reasons.push('daily_loss_budget');
  if (r.orderUsd > t.liquidity * r.maxPositionLiquidityPct / 100) reasons.push('depth_cap');
  if (state.cashUsd < r.orderUsd) reasons.push('insufficient_cash');
  return { eligible: reasons.length === 0, reasons, day };
}
