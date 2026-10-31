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
/**
 * 抗漂移检测（2026-10-31 重构）：
 *  - 按 kind 分别记录字段集合（fair 本来就没有 pad，跨 kind 取并集会闪）
 *  - 字段增删聚合成 **一条** 信号（+N/−M），不按字段刷屏
 *  - 空榜要**连续 2 次**才报，避免一次抖动误报
 */
export function detectDrift(prevMeta, results, cfg) {
  const drifts = [];
  const known = new Set(cfg.knownTracks ?? DEFAULT_TRACKS);
  const prevTracks = new Set(prevMeta?.tracks ?? []);
  const prevKindFields = prevMeta?.kindFields ?? {};
  const prevEmpty = prevMeta?.emptyStreak ?? {};

  const tracks = new Set();
  const kindFields = {};
  const emptyStreak = {};
  const addedAll = new Set();
  const removedAll = new Set();
  const byKind = {};

  for (const r of results) {
    const fields = new Set();
    for (const it of r.items) {
      tracks.add(it.track);
      for (const f of it._fields) fields.add(f);
    }
    kindFields[r.kind] = [...fields].sort();

    // 连续 2 次为空才报
    const streak = r.items.length === 0 ? (prevEmpty[r.kind] ?? 0) + 1 : 0;
    emptyStreak[r.kind] = streak;
    if (streak >= 2) {
      drifts.push({ type: "SCHEMA_DRIFT", kind: r.kind, detail: `榜单连续 ${streak} 次为空（疑似改版/限流）` });
    }

    // 按 kind 比字段（只在两边都有基线时比）
    const prevF = new Set(prevKindFields[r.kind] ?? []);
    if (prevF.size) {
      const added = [...fields].filter((f) => !prevF.has(f));
      const removed = [...prevF].filter((f) => !fields.has(f));
      if (added.length || removed.length) {
        byKind[r.kind] = { added, removed };
        added.forEach((f) => addedAll.add(f));
        removed.forEach((f) => removedAll.add(f));
      }
    }
  }

  // 字段变化聚合为一条
  if (addedAll.size || removedAll.size) {
    drifts.push({
      type: "SCHEMA_DRIFT",
      detail: `字段变化 +${addedAll.size}/−${removedAll.size}`,
      added: [...addedAll].sort(),
      removed: [...removedAll].sort(),
      byKind,
    });
  }

  for (const t of tracks) {
    if (!known.has(t)) drifts.push({ type: "NEW_MODE", track: t, detail: `出现未知 track=${t}（新模式）` });
    else if (!prevTracks.has(t) && prevTracks.size) drifts.push({ type: "NEW_MODE", track: t, detail: `首次观测到 track=${t}` });
  }

  const meta = {
    tracks: [...tracks].sort(),
    fields: [...new Set(Object.values(kindFields).flat())].sort(), // 仅作信息展示
    kindFields,
    emptyStreak,
    counts: Object.fromEntries(results.map((r) => [r.kind, r.items.length])),
    topLevelFields: [...new Set(results.flatMap((r) => r.topLevelFields))].sort(),
    at: Date.now(),
  };
  return { drifts, meta };
}

export { FIELDS };
