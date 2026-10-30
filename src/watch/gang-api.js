/**
 * Gang 市场发现层（抗漂移）
 *
 * 设计原则：
 *  1) 模式枚举不写死 —— 每次请求都记录服务端返回的 `track` / 字段集合，
 *     出现新 track、字段增删、字段类型变化都会产出 drift 事件，而不是静默丢弃。
 *  2) 只依赖 HTTP API，不耗 RPC，不需要 WSS；出问题能一眼看出是"网络"还是"平台改版"。
 *  3) 输出统一 schema，后续打分/信号/摘要全部确定性计算，AI 不参与。
 */

export const DEFAULT_TRACKS = ["main", "v3", "fly", "fair", "stocks"];

/** 统一字段（缺字段保留 null，不编造） */
const FIELDS = [
  "address", "name", "symbol", "creator", "creatorHandle", "track",
  "createdAt", "graduated", "graduatedAt", "progressPct",
  "raiseTargetBnb", "raisedBnb", "trades", "trades24h", "holders",
  "priceUsdt", "fdvUsd", "volume24hUsd", "quoteSymbol", "lastTradeAt",
];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bnb = (v) => {
  const n = num(v);
  return n === null ? null : n / 1e18;
};

export function normalize(item, kind) {
  const out = {
    kind,
    address: String(item.address || "").toLowerCase(),
    name: item.name ?? null,
    symbol: item.symbol ?? null,
    creator: item.creator ? String(item.creator).toLowerCase() : null,
    creatorHandle: item.creatorHandle ?? null,
    track: item.track ?? kind,
    createdAt: num(item.createdAt),
    graduated: Boolean(item.graduated),
    graduatedAt: num(item.graduatedAt),
    progressPct: num(item.progressPct),
    raiseTargetBnb: bnb(item.raiseBnb),
    raisedBnb: bnb(item.raisedBnb),
    trades: num(item.trades),
    trades24h: num(item.trades24h),
    holders: num(item.holders),
    priceUsdt: num(item.priceUsd),
    fdvUsd: num(item.fdvUsd),
    volume24hUsd: num(item.volume24hUsd),
    quoteSymbol: item.quoteSymbol ?? null,
    lastTradeAt: num(item.lastTradeAt),
  };
  // 记录服务端实际给了哪些字段，供漂移检测
  out._fields = Object.keys(item).sort();
  return out;
}

async function fetchJson(url, { timeoutMs = 20000, retries = 3 } = {}) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "mint-ops-watch/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    }
  }
  throw lastError;
}

/**
 * 拉取一个 kind 的榜单。
 * 返回 { kind, items, total, raw }，raw 用于漂移检测（是否出现新字段/新结构）。
 */
export async function fetchKind(kind, cfg) {
  const url = `${cfg.api}?kind=${encodeURIComponent(kind)}&sort=${cfg.sort ?? "new"}&limit=${cfg.limit ?? 60}`;
  const raw = await fetchJson(url, cfg);
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    kind,
    raw,
    total: num(raw?.total),
    items: items.map((x) => normalize(x, kind)),
    topLevelFields: Object.keys(raw || {}).sort(),
  };
}

/** 一次拉取全部 kind */
export async function fetchAll(cfg) {
  const results = [];
  const errors = [];
  for (const kind of cfg.kinds) {
    try {
      results.push(await fetchKind(kind, cfg));
    } catch (error) {
      errors.push({ kind, error: String(error.message || error).slice(0, 200) });
    }
  }
  return { results, errors };
}

/**
 * 抗漂移检测：对比上一次看到的 track 集合 / 字段集合 / 顶层结构。
 * 任何"平台改版"都会变成显式事件，而不是让代码静默失效。
 */
export function detectDrift(prevMeta, results, cfg) {
  const drifts = [];
  const known = new Set(cfg.knownTracks ?? DEFAULT_TRACKS);
  const prevTracks = new Set(prevMeta?.tracks ?? []);
  const prevFields = new Set(prevMeta?.fields ?? []);
  const prevTop = new Set(prevMeta?.topLevelFields ?? []);
  const seenTracks = new Set();
  const seenFields = new Set();
  const topFields = new Set();

  for (const r of results) {
    for (const f of r.topLevelFields) topFields.add(f);
    for (const it of r.items) {
      seenTracks.add(it.track);
      for (const f of it._fields) seenFields.add(f);
    }
    // 空榜 + 之前有数据 = 可能改版或限流
    if (prevMeta?.counts?.[r.kind] > 0 && r.items.length === 0) {
      drifts.push({ type: "SCHEMA_DRIFT", kind: r.kind, detail: "该 kind 由有数据变为空，疑似改版/限流/参数失效" });
    }
  }

  for (const t of seenTracks) {
    if (!known.has(t)) drifts.push({ type: "NEW_MODE", track: t, detail: `出现未知 track=${t}（新模式）` });
    else if (!prevTracks.has(t) && prevTracks.size) drifts.push({ type: "NEW_MODE", track: t, detail: `首次观测到 track=${t}` });
  }
  if (prevFields.size) {
    for (const f of seenFields) if (!prevFields.has(f)) drifts.push({ type: "SCHEMA_DRIFT", field: f, detail: `新增字段 ${f}` });
    for (const f of prevFields) if (!seenFields.has(f)) drifts.push({ type: "SCHEMA_DRIFT", field: f, detail: `字段消失 ${f}（可能改名）` });
  }
  if (prevTop.size) {
    for (const f of topFields) if (!prevTop.has(f)) drifts.push({ type: "SCHEMA_DRIFT", field: `top.${f}`, detail: `顶层新增字段 ${f}` });
    for (const f of prevTop) if (!topFields.has(f)) drifts.push({ type: "SCHEMA_DRIFT", field: `top.${f}`, detail: `顶层字段消失 ${f}` });
  }

  const meta = {
    tracks: [...seenTracks].sort(),
    fields: [...seenFields].sort(),
    topLevelFields: [...topFields].sort(),
    counts: Object.fromEntries(results.map((r) => [r.kind, r.items.length])),
    at: Date.now(),
  };
  return { drifts, meta };
}

export { FIELDS };
