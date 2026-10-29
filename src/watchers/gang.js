import { ethers } from 'ethers';

// 2026-10-29 BSC 主网只读核对（eth_getCode / getLogs / curves / kindOf / sales / bondOf）。
// 话题哈希与下面 VERIFIED_TOPICS 一致的，都在真实创建交易里对过；其余来自同一份官方事件签名。
const ZERO = ethers.ZeroAddress;
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';

export const GANG_OLD = '0x315Ba2e8952D06094CC636b2B84229FA32fb23A7';
export const GANG_V2 = '0x1B8F3f69DFa0a7F63d308C7EB0Fd38D8b099966E';
export const GANG_U = '0xF81C4E51c48466c6025B0165b1Ea0F6978c712cb';
export const GANG_S = '0x60aee38576035E757deD30fF8db8A8DA476430C1';
export const GANG_PAD = '0x15CFD2dc8278Fb87a1783ef42111618E20874365';
export const GANG_BOND = '0xe92dC940CB23Dc328639A7334e69F9CCdf3a14E4';

const SIG = {
  oldCreated: 'event Created(address indexed token, address indexed creator, string name, string symbol)',
  v2Created: 'event Created(address indexed token, address indexed creator, string name, string symbol, string logoURI, bool taxed, address indexed quote, address refPair, uint256 gradAmt)',
  v3Created: 'event Created(address indexed token, address indexed creator, string name, string symbol, string logoURI, address indexed quote, address refPair, uint256 gradAmt)',
  fairCreated: 'event Created(address indexed token, address indexed creator, string name, string symbol, string logoURI, address indexed quote, address refPool, uint256 raiseBnb, uint256 sharePrice, uint256 capShares, uint256 holdBps, uint256 mintFeeBps, uint256 exitFeeBps)',
  sCreated: 'event Created(address indexed token, address indexed creator, string name, string symbol, address indexed quote, uint256 gradAmt)',
  oldGraduated: 'event Graduated(address indexed token, address indexed pair, uint256 tokenAmount, uint256 bnbAmount)',
  graduated: 'event Graduated(address indexed token, address indexed pair, address quote, uint256 tokenAmount, uint256 quoteAmount)',
  launched: 'event Launched(address indexed token, address indexed pair, address quote, uint256 tokenAmount, uint256 quoteAmount)',
  bondPosted: 'event BondPosted(address indexed token, address indexed creator, uint32 round, address quote, uint256 amount, uint256 holdAmount, uint64 duration, uint64 deadline)',
};

const VERIFIED_TOPICS = {
  oldCreated: '0xe57a519fe6a031fac5d360f4b8ce246c86dd280b40dc37b68c0a7cc7394ef9c0',
  v2Created: '0xd23a447045c377a966a79f59983bae21db7b92fead61df8ace4aea5628043791',
  v3Created: '0x416fe98c8f1ea2977674a1a4ee6252eb72597a8392fc2d7d0599a2bf5d8fdb63',
  fairCreated: '0xd46f0c9c36ad8c7839cf830c7cb08aa3a24392965d09cf84e5c8d3bf098d6a4f',
  sCreated: '0x3794109b2940f03560225200c3d62de2cb3933623779e29e612558c9876c68dc',
};

export const gangEvents = new ethers.Interface(Object.values(SIG));
export const GANG_TOPICS = Object.fromEntries(Object.keys(SIG).map((key) => [key, gangEvents.getEvent(SIG[key].slice(6)).topicHash]));
for (const [key, topic] of Object.entries(VERIFIED_TOPICS)) {
  if (GANG_TOPICS[key] !== topic) throw new Error(`Gang topic 与链上核对值不一致: ${key}`);
}

const FACTORIES = {
  [GANG_OLD.toLowerCase()]: 'old',
  [GANG_V2.toLowerCase()]: 'v2',
  [GANG_U.toLowerCase()]: 'u',
  [GANG_S.toLowerCase()]: 's',
  [GANG_PAD.toLowerCase()]: 'pad',
  [GANG_BOND.toLowerCase()]: 'bond',
};

const QUOTES = new Map([
  [WBNB, 'BNB'],
  ['0x0c6302401aa5325c2e36f170f52c00b1d220b405', 'GANG'],
  ['0x4902c5ebc598265ed2212b559b042de8a5eeec3f', 'BNCB'],
  ['0x21caef8a43163eea865baee23b9c2e327696a3bf', 'XAUT'],
  ['0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a', 'BEM'],
]);

const BOND_STATE = ['none', 'active', 'slashed', 'settled', 'refunded'];
const VIEW = {
  old: ['function curves(address) view returns (address creator, uint128 realBnb, uint128 sold, bool graduated, address pair)', 'function spotPrice(address) view returns (uint256)', 'function GRADUATION_BNB() view returns (uint256)'],
  v2: ['function curves(address) view returns (address creator, address quote, uint128 realQuote, uint128 sold, uint128 gradAmt, uint128 virtualQuote, bool graduated, bool taxed, address pair, address refPair)', 'function VIRTUAL_TOKEN() view returns (uint256)'],
  s: ['function curves(address) view returns (address creator, address quote, uint128 realQuote, uint128 sold, uint128 gradAmt, uint128 virtualQuote, bool graduated, address pair, address refPair)', 'function VIRTUAL_TOKEN() view returns (uint256)'],
  pad: [
    'function kindOf(address) view returns (uint8)',
    'function curves(address) view returns (address creator, address quote, uint128 realQuote, uint128 sold, uint128 gradAmt, uint128 virtualQuote, bool graduated, uint16 buyTaxBps, uint16 sellTaxBps, uint16 dividendBps, address pair, address refPair)',
    'function sales(address) view returns (address creator, uint64 progressAt, uint16 capShares, uint16 holdBps, address quote, uint16 sold, bool launched, uint16 mintFeeBps, uint16 exitFeeBps, address gate, uint128 sharePrice, address pair, address refPool, uint16 markSold)',
    'function VIRTUAL_TOKEN() view returns (uint256)',
    'function TOTAL_SHARES() view returns (uint256)',
  ],
  bond: ['function bondOf(address) view returns (address creator, uint64 postedAt, uint32 round, address quote, uint8 state, uint64 deadline, uint64 duration, uint64 requestAt, uint128 amount, uint128 holdAmount, uint128 burnLeft)'],
  erc20: ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
};

const cache = { gradBnb: null, virtualToken: new Map(), totalShares: null, decimals: new Map(), symbols: new Map() };

export const GANG_COVERAGE = {
  verifiedAt: '2026-10-29',
  chainId: 56,
  watched: [
    { id: 'old', address: GANG_OLD, note: '现行 BNB 曲线。GRADUATION_BNB=20 ether，tokenCount=61。话题与仓库原 GANG_OLD_TOPIC 一致。' },
    { id: 'v2', address: GANG_V2, note: 'LaunchpadV2。TARGET_GRAD_BNB=15 ether。话题与仓库原 GANG_V2_TOPIC 一致，创建交易仍在出。' },
    { id: 'u', address: GANG_U, note: 'LaunchpadU，曲线 ABI 与 V2 相同，创建话题与 V2 相同。约 11 个存量币，官方已停新创建。' },
    { id: 's', address: GANG_S, note: 'LaunchpadS，曲线无 taxed 字段。创建话题已用存量币创建交易核对。约 2 个存量币。' },
    { id: 'pad', address: GANG_PAD, note: 'GangLaunchpad：V3 曲线和打新共用。kindOf 1=曲线，2=打新。两条 Created 都在真实交易里对过。' },
    { id: 'bond', address: GANG_BOND, note: '现行 GangBond。bondOf 已读到 active 押金。BondPosted 签名来自官方 IGangBond。' },
  ],
  notWatched: [
    { id: 'soft-cli', address: '0x4E6f13c8A453c1b8b4E20b590082bb233a5b80d7', note: '官方 CLI 的 soft 地址有字节码，但 tokenCount=0。现行 BNB 曲线在 GANG_OLD，不另扫这个空合约。' },
    { id: 'bond-retired', address: '0xf26F33432E33FcE615abf3801ca0c91D1C62C817', note: '2026-10-29 官方文档弃用的第一版主网 GangBond。部署后没有押金事件，keeper 不再看它。' },
  ],
};

// 只读线索，不是买卖信号。config.thresholds（默认 70/90/95/100）决定进度跨线通知。
// 值得盯：未结束且进度 ≥90，或未结束且进度 ≥70。有押金且进度 ≥70 同样值得盯。
// 弱跟：有有效押金但进度 <70。不跟内盘：已毕业/打新已启动，或进度 <70 且无押金。
export const GANG_FOLLOW_RULES = {
  substantialProgressPct: 'config.thresholds',
  worthFollowPct: 70,
  nearGraduationPct: 90,
  weakBondBelowPct: 70,
  activeBondState: 'active',
};

export function gangDefinition() {
  return {
    id: 'gang',
    platform: 'gang',
    address: [GANG_OLD, GANG_V2, GANG_U, GANG_S, GANG_PAD, GANG_BOND],
    topics: [Object.values(GANG_TOPICS)],
    logStep: 1000,
  };
}

export function classifyGangLog(log) {
  const topic = String(log.topics?.[0] || '').toLowerCase();
  const factory = FACTORIES[String(log.address || '').toLowerCase()] || null;
  const found = Object.entries(GANG_TOPICS).find(([, hash]) => hash.toLowerCase() === topic);
  if (!found) return null;
  const [name] = found;
  if (name === 'bondPosted') return { event: 'bond', factory: 'bond' };
  if (name === 'oldGraduated' || name === 'graduated') return { event: 'graduated', factory };
  if (name === 'launched') return { event: 'launched', factory: factory || 'pad' };
  if (name === 'fairCreated') return { event: 'created', factory: 'pad', kind: 'fair' };
  if (name === 'v3Created') return { event: 'created', factory: 'pad', kind: 'v3' };
  if (name === 'sCreated') return { event: 'created', factory: 's', kind: 's' };
  if (name === 'v2Created') return { event: 'created', factory: factory === 'u' ? 'u' : 'v2', kind: factory === 'u' ? 'u' : 'v2' };
  if (name === 'oldCreated') return { event: 'created', factory: 'old', kind: 'old' };
  return null;
}

export function gangFollowClue({ progressPct, graduated, bondExists, isNew } = {}) {
  const progress = typeof progressPct === 'number' && Number.isFinite(progressPct) ? progressPct : null;
  const pct = progress == null ? '未知' : `${progress.toFixed(2)}%`;
  if (graduated) return { worthFollow: false, clue: `已结束（进度 ${pct}），不跟内盘` };
  if (progress != null && progress >= GANG_FOLLOW_RULES.nearGraduationPct) {
    return { worthFollow: true, clue: `进度 ${pct} ≥ 90，接近毕业，值得盯` };
  }
  if (bondExists && progress != null && progress >= GANG_FOLLOW_RULES.worthFollowPct) {
    return { worthFollow: true, clue: `有押金且进度 ${pct} ≥ 70，值得盯` };
  }
  if (progress != null && progress >= GANG_FOLLOW_RULES.worthFollowPct) {
    return { worthFollow: true, clue: `进度 ${pct} ≥ 70，可跟进度` };
  }
  if (bondExists) return { worthFollow: true, clue: `有押金，进度 ${pct} 未过 70，弱跟` };
  if (isNew) return { worthFollow: false, clue: `新盘进度 ${pct}，未过 70 且无押金，先只建档` };
  return { worthFollow: false, clue: `进度 ${pct} 未过 70 且无押金，不跟` };
}

export function gangReportLine(row) {
  const progress = typeof row.progressPct === 'number' ? `${row.progressPct.toFixed(2)}%` : '未知';
  const bond = row.bond == null ? '未知' : row.bond ? '有' : '无';
  const name = row.name || row.symbol || '未命名';
  return `${row.token} · ${name} · 进度 ${progress} · 押金 ${bond} · ${row.clue}`;
}

export function shanghaiNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function formatGangReport({ at, fromBlock, toBlock, substantial = [], quiet = 0, thresholds = [] }) {
  const lines = [
    `[Gang扫描] ${at} Asia/Shanghai · armed=false · 只读 · 区块 ${fromBlock}-${toBlock}`,
    `实质变化 ${substantial.length} · 静默 ${quiet} · 进度跨线 ${thresholds.join('/')}`,
    ...(substantial.length ? substantial.map(gangReportLine) : ['（无实质变化）']),
    '线索：未结束且进度≥90 值得盯；≥70 可跟进度；有押金但<70 弱跟；已结束或未过 70 且无押金则不跟内盘。不是买卖建议。',
  ];
  return lines.join('\n');
}

const apiBase = () => (process.env.GANG_API || 'https://gang.fun/api').replace(/\/+$/, '');

export async function readGangMarket(rpc, token, hint) {
  const address = String(token || '').toLowerCase();
  if (!ethers.isAddress(address)) return null;
  let onChain = null;
  try {
    onChain = await rpc.call((provider) => readOnChain(provider, address, hint));
  } catch (error) {
    onChain = { readError: error.shortMessage || error.message };
  }
  if (onChain?.kind) return { ...onChain, token: address, platform: 'gang' };
  const api = await readGangApi(address);
  if (api) return api;
  if (onChain?.readError) return { token: address, platform: 'gang', source: 'unavailable', readError: onChain.readError };
  return null;
}

async function readOnChain(provider, token, hint) {
  const order = hint ? [hint] : ['pad', 'v2', 'u', 's', 'old'];
  let market = null;
  for (const kind of order) {
    if (kind === 'bond') continue;
    market = await readFactory(provider, token, kind);
    if (market) break;
  }
  if (!market && hint && hint !== 'pad') market = await readFactory(provider, token, 'pad');
  const bond = await readBond(provider, token);
  if (!market && !bond?.bondExists) return null;
  return { ...(market || { token, source: 'chain' }), ...bond };
}

async function readFactory(provider, token, kind) {
  if (kind === 'pad') return readPad(provider, token);
  if (kind === 'old') return readOld(provider, token);
  if (kind === 'v2' || kind === 'u') return readQuoteCurve(provider, token, kind, VIEW.v2);
  if (kind === 's') return readQuoteCurve(provider, token, kind, VIEW.s);
  return null;
}

async function readPad(provider, token) {
  const pad = new ethers.Contract(GANG_PAD, VIEW.pad, provider);
  let kind = 0;
  try { kind = Number(await pad.kindOf(token)); } catch { return null; }
  if (kind === 1) {
    const curve = await pad.curves(token);
    if (curve.creator === ZERO) return null;
    const done = Boolean(curve.graduated);
    const quote = await quoteMeta(provider, curve.quote);
    const raised = done ? curve.gradAmt : curve.realQuote;
    return {
      kind: 'v3', factory: GANG_PAD, factoryId: 'pad', creator: curve.creator.toLowerCase(), ...quote,
      progressPct: progressOf(curve.realQuote, curve.gradAmt, done), graduated: done,
      raisedQuote: fmt(raised, quote.decimals), fdvQuote: done ? null : await curveFdv(provider, GANG_PAD, curve, quote.decimals),
      buyTaxBps: Number(curve.buyTaxBps), sellTaxBps: Number(curve.sellTaxBps), pair: cleanAddr(curve.pair), source: 'chain',
    };
  }
  if (kind === 2) {
    const sale = await pad.sales(token);
    if (sale.creator === ZERO) return null;
    const shares = cache.totalShares ?? await pad.TOTAL_SHARES().then((value) => { cache.totalShares = value; return value; });
    const done = Boolean(sale.launched);
    const quote = await quoteMeta(provider, sale.quote);
    const sold = BigInt(sale.sold);
    return {
      kind: 'fair', factory: GANG_PAD, factoryId: 'pad', creator: sale.creator.toLowerCase(), ...quote,
      progressPct: done ? 100 : Number(shares) > 0 ? Number(sold * 10000n / shares) / 100 : null,
      graduated: done, raisedQuote: fmt(sale.sharePrice * sold, quote.decimals), fdvQuote: null,
      pair: cleanAddr(sale.pair), source: 'chain',
    };
  }
  return null;
}

async function readQuoteCurve(provider, token, kind, abi) {
  const address = kind === 'v2' ? GANG_V2 : kind === 'u' ? GANG_U : GANG_S;
  const pad = new ethers.Contract(address, abi, provider);
  let curve;
  try { curve = await pad.curves(token); } catch { return null; }
  if (!curve.creator || curve.creator === ZERO) return null;
  const done = Boolean(curve.graduated);
  const quote = await quoteMeta(provider, curve.quote);
  const raised = done ? curve.gradAmt : curve.realQuote;
  return {
    kind, factory: address, factoryId: kind, creator: curve.creator.toLowerCase(), ...quote,
    progressPct: progressOf(curve.realQuote, curve.gradAmt, done), graduated: done,
    raisedQuote: fmt(raised, quote.decimals), fdvQuote: done ? null : await curveFdv(provider, address, curve, quote.decimals),
    taxed: curve.taxed == null ? null : Boolean(curve.taxed), pair: cleanAddr(curve.pair), source: 'chain',
  };
}

async function readOld(provider, token) {
  const pad = new ethers.Contract(GANG_OLD, VIEW.old, provider);
  let curve;
  try { curve = await pad.curves(token); } catch { return null; }
  if (!curve.creator || curve.creator === ZERO) return null;
  const done = Boolean(curve.graduated);
  if (cache.gradBnb == null) cache.gradBnb = await pad.GRADUATION_BNB();
  let fdvQuote = null;
  if (!done) {
    try { fdvQuote = fmt(await pad.spotPrice(token) * 1_000_000_000n, 18); } catch { fdvQuote = null; }
  }
  return {
    kind: 'old', factory: GANG_OLD, factoryId: 'old', creator: curve.creator.toLowerCase(), quote: 'BNB', quoteAddress: null, decimals: 18,
    progressPct: progressOf(curve.realBnb, cache.gradBnb, done), graduated: done,
    raisedQuote: fmt(done ? cache.gradBnb : curve.realBnb, 18), fdvQuote, pair: cleanAddr(curve.pair), source: 'chain',
  };
}

async function readBond(provider, token) {
  const bond = new ethers.Contract(GANG_BOND, VIEW.bond, provider);
  try {
    const row = await bond.bondOf(token);
    const state = BOND_STATE[Number(row.state)] || `unknown(${row.state})`;
    const active = Number(row.state) === 1;
    const quote = row.quote && row.quote !== ZERO ? await quoteMeta(provider, row.quote) : { decimals: 18 };
    return { bondExists: active, bondState: state, bondAmountQuote: active ? fmt(row.amount, quote.decimals) : null };
  } catch {
    return { bondExists: null, bondState: null, bondAmountQuote: null };
  }
}

async function curveFdv(provider, factory, curve, decimals) {
  try {
    const virtual = cache.virtualToken.get(factory) ?? await new ethers.Contract(factory, ['function VIRTUAL_TOKEN() view returns (uint256)'], provider).VIRTUAL_TOKEN();
    cache.virtualToken.set(factory, virtual);
    const left = virtual - curve.sold;
    if (left <= 0n) return null;
    const price = ((curve.virtualQuote + curve.realQuote) * 10n ** 18n) / left;
    return fmt(price * 1_000_000_000n, decimals);
  } catch { return null; }
}

async function quoteMeta(provider, quote) {
  if (!quote || quote === ZERO) return { quote: 'BNB', quoteAddress: null, decimals: 18 };
  const lower = quote.toLowerCase();
  if (lower === WBNB) return { quote: 'BNB', quoteAddress: lower, decimals: 18 };
  const known = QUOTES.get(lower) || null;
  let decimals = cache.decimals.get(lower);
  let symbol = known || cache.symbols.get(lower) || null;
  if (decimals == null || !symbol) {
    const erc = new ethers.Contract(quote, VIEW.erc20, provider);
    if (decimals == null) {
      try { decimals = Number(await erc.decimals()); cache.decimals.set(lower, decimals); } catch { decimals = null; }
    }
    if (!symbol) {
      try { symbol = await erc.symbol(); cache.symbols.set(lower, symbol); } catch { symbol = known; }
    }
  }
  return { quote: symbol || 'UNKNOWN', quoteAddress: lower, decimals: decimals ?? null };
}

async function readGangApi(token) {
  for (const path of [`/v3/tokens/${token}`, `/tokens/${token}`, `/stocks/tokens/${token}`]) {
    try {
      const response = await fetch(`${apiBase()}${path}`, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
      if (response.status === 404) continue;
      if (!response.ok) continue;
      const body = await response.json();
      if (!body?.address) continue;
      const progress = body.progressPct == null ? null : Number(body.progressPct);
      const bond = body.bond && typeof body.bond === 'object' ? body.bond : null;
      return {
        token: String(body.address).toLowerCase(), platform: 'gang', source: 'gang.fun',
        name: body.name || null, symbol: body.symbol || null,
        creator: body.creator ? String(body.creator).toLowerCase() : null,
        kind: body.track || null, factory: null,
        quote: body.quoteSymbol || null, quoteAddress: body.quoteAddress ? String(body.quoteAddress).toLowerCase() : null,
        progressPct: Number.isFinite(progress) ? progress : null,
        graduated: Boolean(body.graduated || body.launched),
        raisedQuote: body.raisedQuote || body.raisedBnb || null,
        fdvQuote: body.fdvQuote != null ? String(body.fdvQuote) : (body.fdvBnb != null ? String(body.fdvBnb) : null),
        bondExists: Object.prototype.hasOwnProperty.call(body, 'bond') ? Boolean(bond && (bond.state === 'active' || bond.state === 1)) : null,
        bondState: bond?.state ?? null,
        bondAmountQuote: null,
      };
    } catch { /* 下一个官方只读路径 */ }
  }
  return null;
}

function progressOf(real, grad, done) {
  if (done) return 100;
  if (grad == null || grad === 0n) return null;
  return Number((real * 10000n) / grad) / 100;
}

function fmt(amount, decimals) {
  if (amount == null || decimals == null) return null;
  return ethers.formatUnits(amount, decimals);
}

function cleanAddr(value) {
  if (!value || value === ZERO) return null;
  return String(value).toLowerCase();
}

export function gangReadHint(token = {}) {
  if (['pad', 'old', 'v2', 'u', 's'].includes(token.factoryId)) return token.factoryId;
  if (token.kind === 'v3' || token.kind === 'fair') return 'pad';
  if (['old', 'v2', 'u', 's'].includes(token.kind)) return token.kind;
  const factory = FACTORIES[String(token.factory || '').toLowerCase()];
  return factory && factory !== 'bond' ? factory : null;
}

export function gangEventFields(parsed, kind) {
  const args = parsed?.args || {};
  const fields = {
    token: String(args.token).toLowerCase(),
    creator: args.creator ? String(args.creator).toLowerCase() : undefined,
    name: args.name || undefined,
    symbol: args.symbol || undefined,
    kind: kind.kind,
    factory: kind.factory === 'bond' ? GANG_BOND : undefined,
  };
  if (args.quote && args.quote !== ZERO) fields.quoteAddress = String(args.quote).toLowerCase();
  if (kind.factory === 'old') fields.quote = 'BNB';
  if (kind.event === 'graduated' || kind.event === 'launched') {
    fields.graduated = true;
    fields.progressPct = 100;
    fields.justGraduated = true;
  }
  if (kind.event === 'bond') fields.bondJustPosted = true;
  return fields;
}
