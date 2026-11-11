import { randomUUID } from 'node:crypto';

export const PULSE_URL = 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list/ai';
const AUDIT_URL = 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit';
export const number = v => v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export function identity(chainId, address) {
  chainId = String(chainId);
  if (chainId === 'CT_501') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error('Invalid Solana address');
  } else {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid EVM address');
    address = address.toLowerCase();
  }
  return `${chainId}:${address}`;
}
export async function jsonRequest(url, body, timeoutMs = 8000) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity', 'user-agent': 'mint-ops/2.0', source: 'agent' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data.success === false || (data.code !== undefined && String(data.code) !== '000000')) throw new Error(`Upstream code ${data.code}`);
  return data;
}
export function normalizePulse(row, chainId, stage, now = Date.now()) {
  if (String(row.chainId) !== String(chainId)) throw new Error('Feed chain mismatch');
  const key = identity(chainId, row.contractAddress);
  return { key, chainId: String(chainId), address: key.slice(key.indexOf(':') + 1), source: 'binance-pulse',
    protocol: number(row.protocol), symbol: String(row.symbol ?? '').slice(0, 80), stage,
    graduated: row.migrateStatus === 1 ? true : row.migrateStatus === 0 ? false : null, progress: number(row.progress), price: number(row.price),
    liquidity: number(row.liquidity), netBuy: number(row.netBuy),
    top10: number(row.holdersTop10Percent), dev: number(row.holdersDevPercent), bundler: number(row.bundlerHoldingPercent),
    buyTax: number(row.taxRateBuy), sellTax: number(row.taxRateSell),
    wash: row.tagDevWashTrading === 1 || row.tagInsiderWashTrading === 1,
    createdAt: number(row.createTime), observedAt: now, tokenVersion: row.tokenVersion ?? null };
}
export async function discover(config, request = jsonRequest, onRows = async () => {}) {
  const jobs = config.feeds.flatMap(f => f.stages.map(stage => ({ name: `pulse:${f.chainId}:${stage}`, run: async () => {
    const body = await request(PULSE_URL, { chainId: f.chainId, rankType: stage, protocol: f.protocols, limit: 100 }, config.timeoutMs);
    if (!Array.isArray(body.data)) throw new Error('Pulse schema drift: expected data[]');
    // Enforce locally too: the remote API silently ignores misspelled filters.
    return body.data.filter(row => f.protocols.includes(number(row.protocol))).map(row => normalizePulse(row, f.chainId, stage));
  } })));
  if (config.gang.enabled) for (const kind of config.gang.kinds) jobs.push({ name: `gang:${kind}`, run: async () => {
    const u = new URL(config.gang.api); u.search = new URLSearchParams({ kind, sort: 'new', limit: config.gang.limit });
    const body = await request(u, null, config.timeoutMs);
    if (!Array.isArray(body.items)) throw new Error('Gang schema drift: expected items[]');
    return body.items.map(row => { const key = identity('56', row.address); return {
      key, chainId: '56', address: key.slice(3), symbol: String(row.symbol ?? '').slice(0, 80), source: 'gang', protocol: 'gang',
      progress: number(row.progressPct), price: number(row.priceUsd), graduated: row.graduated === true,
      createdAt: number(row.createdAt) === null ? null : Number(row.createdAt) * 1000, observedAt: Date.now(),
      liquidity: null, netBuy: null, top10: null, dev: null, bundler: null, buyTax: null, sellTax: null,
    }; });
  } });
  const rows = [], errors = [];
  // Limit concurrency to three, preserving source-level errors without blocking other chains.
  for (let i = 0; i < jobs.length; i += 3) {
    const results = await Promise.allSettled(jobs.slice(i, i + 3).map(j => j.run()));
    results.forEach((r, k) => r.status === 'fulfilled' ? rows.push(...r.value) : errors.push({ source: jobs[i + k].name, error: r.reason.message }));
    await onRows(results.filter(r => r.status === 'fulfilled').flatMap(r => r.value));
  }
  return { rows: [...new Map(rows.map(r => [r.key, r])).values()], errors };
}
export async function audit(token, config, request = jsonRequest) {
  const body = await request(AUDIT_URL, { binanceChainId: token.chainId, contractAddress: token.address, requestId: randomUUID() }, config.timeoutMs);
  const d = body.data;
  if (d?.hasResult !== true || d?.isSupported !== true) throw new Error('Audit unavailable');
  if (!Array.isArray(d.riskItems) || !d.riskItems.length || d.riskItems.some(g => !Array.isArray(g.details) || !g.details.length || g.details.some(x => typeof x.isHit !== 'boolean'))) throw new Error('Audit schema incomplete');
  return { at: Date.now(), key: token.key, level: d.riskLevelEnum, verified: d.extraInfo?.isVerified,
    buyTax: number(d.extraInfo?.buyTax), sellTax: number(d.extraInfo?.sellTax),
    hits: d.riskItems.flatMap(g => g.details).filter(x => x.isHit === true).map(x => x.title) };
}
