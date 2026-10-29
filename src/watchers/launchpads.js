import { ethers } from 'ethers';

// feat/gang-curve-scan：只读补齐 Gang V3/fair 事件与 OLD/V2/V3 进度、押金刷新，不触发交易。
const FOUR_MANAGER = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const FOUR_TOPIC = ethers.id('TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)');
export const GANG_OLD = '0x315Ba2e8952D06094CC636b2B84229FA32fb23A7';
export const GANG_V2 = '0x1B8F3f69DFa0a7F63d308C7EB0Fd38D8b099966E';
export const GANG_V3 = '0x15CFD2dc8278Fb87a1783ef42111618E20874365';
export const GANG_REGISTRY = '0x4fF77D4d9ac080939a24E1B805206bA094C44e5C';
export const GANG_BOND = '0xe92dc940cb23dc328639a7334e69f9ccdf3a14e4';
export const GANG_OLD_TOPIC = '0xe57a519fe6a031fac5d360f4b8ce246c86dd280b40dc37b68c0a7cc7394ef9c0';
export const GANG_V2_TOPIC = '0xd23a447045c377a966a79f59983bae21db7b92fead61df8ace4aea5628043791';
export const GANG_V3_TOPIC = ethers.id('Created(address,address,string,string,string,address,address,uint256)');
export const GANG_FAIR_TOPIC = ethers.id('Created(address,address,string,string,string,address,address,uint256,uint256,uint256,uint256,uint256,uint256)');
export const GANG_FACTORY_BLOCK = 130104322;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const fourIface = new ethers.Interface(['event TokenCreate(address creator,address token,uint256 requestId,string name,string symbol,uint256 totalSupply,uint256 launchTime,uint256 launchFee)']);
const gangIface = new ethers.Interface([
  'event Created(address indexed token,address indexed creator,string name,string symbol,string logoURI,address indexed quote,address refPair,uint256 gradAmt)',
  'event Created(address indexed token,address indexed creator,string name,string symbol,string logoURI,address indexed quote,address refPool,uint256 raiseBnb,uint256 sharePrice,uint256 capShares,uint256 holdBps,uint256 mintFeeBps,uint256 exitFeeBps)',
]);
const OLD_ABI = [
  'function curves(address) view returns (address creator,uint128 realBnb,uint128 sold,bool graduated,address pair)',
  'function GRADUATION_BNB() view returns (uint256)',
];
const V2_ABI = ['function curves(address) view returns (address creator,address quote,uint128 realQuote,uint128 sold,uint128 gradAmt,uint128 virtualQuote,bool graduated,bool taxed,address pair,address refPair)'];
const V3_ABI = [
  'function curves(address) view returns (address creator,address quote,uint128 realQuote,uint128 sold,uint128 gradAmt,uint128 virtualQuote,bool graduated,uint16 buyTaxBps,uint16 sellTaxBps,uint16 dividendBps,address pair,address refPair)',
  'function sales(address) view returns (address creator,uint64 progressAt,uint16 capShares,uint16 holdBps,address quote,uint16 sold,bool launched,uint16 mintFeeBps,uint16 exitFeeBps,address gate,uint128 sharePrice,address pair,address refPool,uint16 markSold)',
];
const REGISTRY_ABI = ['function lookup(address) view returns (address pad,uint8 kind)'];
const BOND_ABI = ['function bondOf(address) view returns (tuple(address creator,uint64 postedAt,uint32 round,address quote,uint8 state,uint64 deadline,uint64 duration,uint64 requestAt,uint128 amount,uint128 holdAmount,uint128 burnLeft))'];
const coder = ethers.AbiCoder.defaultAbiCoder();
const addr = (topic) => ethers.getAddress(`0x${topic.slice(26)}`).toLowerCase();
const QUOTES = new Map([
  ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 'BNB'],
  [ZERO_ADDRESS, 'BNB'],
  ['0x0c6302401aa5325c2e36f170f52c00b1d220b405', 'GANG'],
  ['0x4902c5ebc598265ed2212b559b042de8a5eeec3f', 'BNCB'],
  ['0x21caef8a43163eea865baee23b9c2e327696a3bf', 'XAUT'],
  ['0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a', 'BEM'],
]);
const quoteName = (address, fallback = null) => address ? (QUOTES.get(address.toLowerCase()) || fallback || address.toLowerCase()) : 'BNB';
const pairOrNull = (address) => address && address.toLowerCase() !== ZERO_ADDRESS ? address : null;
const progressPct = (part, total, graduated) => graduated ? 100 : total > 0n ? Number((part * 1_000_000n) / total) / 10_000 : 0;

const DEFINITIONS = [
  { id: 'four', platform: 'four', address: [FOUR_MANAGER], topics: [[FOUR_TOPIC]] },
  { id: 'gang', platform: 'gang', address: [GANG_OLD, GANG_V2], topics: [[GANG_OLD_TOPIC, GANG_V2_TOPIC]] },
  { id: 'gang-v3', platform: 'gang', address: [GANG_V3], topics: [[GANG_V3_TOPIC, GANG_FAIR_TOPIC]] },
];

export class LaunchpadWatcher {
  constructor({ config, rpc, store, rules }) {
    Object.assign(this, { config, rpc, store, rules });
    this.running = false;
    this.sockets = [];
  }

  async start() {
    this.running = true;
    for (const def of DEFINITIONS) {
      try {
        const tip = await this.rpc.blockNumber();
        const cursorKey = `launch:${def.id}`;
        const from = Math.max(0, (this.store.state.cursors[cursorKey] ?? tip - this.config.rpc.backfillBlocks) + 1);
        await this.scan(def, from, tip);
        this.sockets.push(this.rpc.watchLogs({ address: def.address, topics: def.topics },
          (log) => this.handle(def, log).catch((error) => this.error(def.id, error)),
          (status) => {
            def.live = status.live;
            if (status.removed) this.error(`${def.id}:reorg`, new Error(`日志被重组移除 ${status.log.transactionHash}:${status.log.index}`));
          }));
        this.backfillLoop(def);
      } catch (error) { await this.error(def.id, error); }
    }
    this.refreshLoop();
    if (this.config.intervals.pipfunSec > 0) this.pipfunLoop();
  }

  async once(hours = 0) {
    const tip = await this.rpc.blockNumber();
    const span = hours > 0 ? Math.max(1, Math.floor(hours * 8000)) : this.config.rpc.backfillBlocks;
    const from = Math.max(0, tip - span);
    const scans = [];
    for (const def of DEFINITIONS.filter((x) => x.id.startsWith('gang'))) {
      await this.scan(def, from, tip);
      scans.push({ factory: def.id, fromBlock: from, toBlock: tip });
    }
    const progress = await this.refreshGang({ force: true });
    return { fromBlock: from, toBlock: tip, scans, progress };
  }

  async scan(def, fromBlock, toBlock) {
    if (fromBlock > toBlock) return;
    const logs = await this.rpc.logs({ address: def.address, topics: def.topics, fromBlock, toBlock });
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    for (const log of logs) await this.handle(def, log);
    this.store.state.cursors[`launch:${def.id}`] = toBlock;
    this.store.save();
  }

  async handle(def, log) {
    const id = `${log.transactionHash}:${log.index}`;
    if (this.store.hasEvent(id)) return;
    const block = await this.rpc.block(log.blockNumber);
    if (!block) throw new Error(`无法读取区块 ${log.blockNumber}`);
    let event;
    if (def.id === 'four') {
      const parsed = fourIface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) return;
      const a = parsed.args;
      event = { token: a.token.toLowerCase(), creator: a.creator.toLowerCase(), name: a.name, symbol: a.symbol, platform: 'four', quote: 'BNB' };
    } else if (def.id === 'gang-v3') {
      const parsed = gangIface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) return;
      const a = parsed.args;
      const fair = log.topics[0] === GANG_FAIR_TOPIC;
      const quoteAddress = addr(log.topics[3]);
      event = {
        token: a.token.toLowerCase(), creator: a.creator.toLowerCase(), name: a.name, symbol: a.symbol,
        platform: 'gang', platformVersion: fair ? 'fair' : 'v3', quote: quoteName(quoteAddress), quoteAddress,
      };
    } else {
      const v2 = log.topics[0] === GANG_V2_TOPIC;
      const [name, symbol] = v2 ? coder.decode(['string', 'string', 'string'], log.data) : coder.decode(['string', 'string'], log.data);
      const quoteAddress = v2 ? addr(log.topics[3]) : null;
      event = {
        token: addr(log.topics[1]), creator: addr(log.topics[2]), name, symbol,
        platform: 'gang', platformVersion: v2 ? 'v2' : 'old', quote: quoteName(quoteAddress, 'UNKNOWN'), quoteAddress,
      };
    }
    Object.assign(event, { blockNumber: log.blockNumber, blockTime: Number(block.timestamp), seenAt: Date.now(), txHash: log.transactionHash });
    this.store.markEvent(id);
    if (event.platform === 'gang') await this.rules.gang(event, { isNew: true, eventId: id });
    else await this.rules.launchpad(event, { eventId: id });
    this.store.save();
  }

  async backfillLoop(def) {
    while (this.running) {
      const waitSec = def.live ? this.config.rpc.backfillNormalSec : this.config.rpc.backfillDownSec;
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      if (!this.running) break;
      try {
        const tip = await this.rpc.blockNumber();
        const key = `launch:${def.id}`;
        const from = (this.store.state.cursors[key] ?? tip - this.config.rpc.backfillBlocks) + 1;
        await this.scan(def, from, tip);
      } catch (error) { await this.error(def.id, error); }
    }
  }

  async refreshLoop() {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!this.running) break;
      await this.refreshGang();
    }
  }

  async refreshGang({ force = false } = {}) {
    const now = Date.now();
    const tokens = Object.values(this.store.state.tokens).filter((token) =>
      String(token.platform).startsWith('gang') && !token.graduated && token.status !== 4);
    const items = [];
    const errors = [];
    for (const token of tokens) {
      if (!force && (token.nextCheckAt || 0) > now) continue;
      token.nextCheckAt = now + 10_000;
      try {
        let latest;
        try {
          latest = await this.readGangState(token);
        } catch (chainError) {
          try {
            latest = await this.readGangApi(token);
          } catch (apiError) {
            throw new Error(`链上读取失败：${chainError.message}；API 降级失败：${apiError.message}`);
          }
        }
        const result = await this.rules.gang({ ...token, ...latest, seenAt: now });
        const current = this.store.token(token.token);
        items.push({
          token: current.token, name: current.name, symbol: current.symbol, platformVersion: current.platformVersion,
          progressPct: current.progressPct, graduated: current.graduated, quote: current.quote,
          bondAmount: current.bondAmount, hasBond: current.hasBond, raised: current.raised,
          source: current.source, substantial: result.substantial, changes: result.changes,
        });
      } catch (error) {
        errors.push({ token: token.token, error: error.message });
        await this.error(`gang:state:${token.token}`, error);
      }
    }
    this.store.save();
    return { tracked: tokens.length, refreshed: items.length, items, errors };
  }

  async readGangState(token) {
    const address = token.token;
    const version = token.platformVersion || (token.quoteAddress ? 'v2' : 'old');
    if (!ethers.isAddress(address)) throw new Error(`无效 Gang token 地址：${address}`);
    if (version === 'old') {
      return this.rpc.call(async (provider) => {
        const contract = new ethers.Contract(GANG_OLD, OLD_ABI, provider);
        const [c, target] = await Promise.all([contract.curves(address), contract.GRADUATION_BNB()]);
        const graduated = Boolean(c.graduated);
        return {
          token: address.toLowerCase(), platform: 'gang', platformVersion: 'old', creator: c.creator.toLowerCase(),
          progressPct: progressPct(c.realBnb, target, graduated), graduated, status: graduated ? 4 : 1,
          statusName: graduated ? 'DEX' : 'CURVE', quote: 'BNB', quoteAddress: null,
          pair: pairOrNull(c.pair), raised: (graduated ? target : c.realBnb).toString(), graduationTarget: target.toString(),
          sold: c.sold.toString(), hasBond: false, bondState: null, bondAmount: null, source: 'chain',
        };
      });
    }
    if (version === 'v2') {
      return this.rpc.call(async (provider) => {
        const contract = new ethers.Contract(GANG_V2, V2_ABI, provider);
        const c = await contract.curves(address);
        if (c.creator.toLowerCase() === ZERO_ADDRESS) throw new Error('V2 curves 返回空盘');
        const graduated = Boolean(c.graduated);
        const quoteAddress = c.quote.toLowerCase();
        return {
          token: address.toLowerCase(), platform: 'gang', platformVersion: 'v2', creator: c.creator.toLowerCase(),
          progressPct: progressPct(c.realQuote, c.gradAmt, graduated), graduated, status: graduated ? 4 : 1,
          statusName: graduated ? 'DEX' : 'CURVE', quote: quoteName(quoteAddress), quoteAddress,
          pair: pairOrNull(c.pair), raised: (graduated ? c.gradAmt : c.realQuote).toString(), graduationTarget: c.gradAmt.toString(),
          sold: c.sold.toString(), hasBond: false, bondState: null, bondAmount: null, source: 'chain',
        };
      });
    }
    if (!['v3', 'fair'].includes(version)) throw new Error(`未知 Gang 版本：${version}`);
    return this.rpc.call(async (provider) => {
      const registry = new ethers.Contract(GANG_REGISTRY, REGISTRY_ABI, provider);
      const pad = new ethers.Contract(GANG_V3, V3_ABI, provider);
      const bondContract = new ethers.Contract(GANG_BOND, BOND_ABI, provider);
      const lookup = await registry.lookup(address);
      const expectedKind = version === 'fair' ? 2 : 1;
      if (lookup.pad.toLowerCase() !== GANG_V3.toLowerCase() || Number(lookup.kind) !== expectedKind) {
        throw new Error(`Registry 盘型不匹配：pad=${lookup.pad} kind=${lookup.kind}`);
      }
      if (version === 'fair') {
        const [s, bond] = await Promise.all([pad.sales(address), bondContract.bondOf(address)]);
        const graduated = Boolean(s.launched);
        const sold = BigInt(s.sold);
        const target = BigInt(s.sharePrice) * 10_000n;
        const quoteAddress = s.quote.toLowerCase();
        return {
          token: address.toLowerCase(), platform: 'gang', platformVersion: 'fair', creator: s.creator.toLowerCase(),
          progressPct: progressPct(sold, 10_000n, graduated), graduated, status: graduated ? 4 : 1,
          statusName: graduated ? 'DEX' : 'MINTING', quote: quoteName(quoteAddress), quoteAddress,
          pair: pairOrNull(s.pair), raised: (graduated ? target : sold * BigInt(s.sharePrice)).toString(),
          graduationTarget: target.toString(), soldShares: Number(sold), totalShares: 10_000,
          sharePrice: s.sharePrice.toString(), ...this.normalizeBond(bond), source: 'chain',
        };
      }
      const [c, bond] = await Promise.all([pad.curves(address), bondContract.bondOf(address)]);
      const graduated = Boolean(c.graduated);
      const quoteAddress = c.quote.toLowerCase();
      return {
        token: address.toLowerCase(), platform: 'gang', platformVersion: 'v3', creator: c.creator.toLowerCase(),
        progressPct: progressPct(c.realQuote, c.gradAmt, graduated), graduated, status: graduated ? 4 : 1,
        statusName: graduated ? 'DEX' : 'CURVE', quote: quoteName(quoteAddress), quoteAddress,
        pair: pairOrNull(c.pair), raised: (graduated ? c.gradAmt : c.realQuote).toString(), graduationTarget: c.gradAmt.toString(),
        sold: c.sold.toString(), ...this.normalizeBond(bond), source: 'chain',
      };
    });
  }

  normalizeBond(bond) {
    const bondState = Number(bond.state);
    return { hasBond: bondState === 1, bondState, bondAmount: bond.amount.toString(), bondRound: Number(bond.round) };
  }

  async readGangApi(token) {
    const address = token.token.toLowerCase();
    const version = token.platformVersion || (token.quoteAddress ? 'v2' : 'old');
    const base = { old: 'tokens', v2: 'stocks/tokens', v3: 'v3/tokens', fair: 'fair/sales' }[version];
    if (!base) throw new Error(`未知 Gang 版本：${version}`);
    const response = await fetch(`https://gang.fun/api/${base}/${address}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`gang.fun HTTP ${response.status}`);
    const body = await response.json();
    const expectedTrack = { old: 'soft', v2: 'stocks', v3: 'v3', fair: 'fair' }[version];
    if (body.address?.toLowerCase() !== address || (body.track && body.track !== expectedTrack)) {
      throw new Error(`API 盘型或地址不匹配：track=${body.track} address=${body.address}`);
    }
    const graduated = Boolean(body.graduated || body.launched || body.status === 'launched');
    const decimals = Number(body.quoteDecimals ?? 18);
    const raw = (value) => ethers.parseUnits(String(value ?? '0'), decimals).toString();
    const target = version === 'old' ? ethers.parseEther('20').toString()
      : body.raiseQuote != null ? String(body.raiseQuote)
        : body.gradAmt != null ? String(body.gradAmt) : raw(body.gradAmtQuote);
    const raised = version === 'fair' && body.sold != null && body.sharePrice != null
      ? (BigInt(body.sold) * BigInt(body.sharePrice)).toString() : raw(body.raisedQuote ?? body.raisedBnb);
    const progress = Number(body.progressPct ?? (version === 'fair' ? Number(body.sold || 0) / 100 : 0));
    if (!Number.isFinite(progress)) throw new Error('API progressPct 非数值');
    const bondState = body.bond ? (body.bond.state === 'active' ? 1 : Number(body.bond.state ?? 1)) : 0;
    return {
      token: address, platform: 'gang', platformVersion: version, name: body.name, symbol: body.symbol,
      creator: body.creator?.toLowerCase(), progressPct: progress, graduated, status: graduated ? 4 : 1,
      statusName: graduated ? 'DEX' : version === 'fair' ? 'MINTING' : 'CURVE',
      quote: quoteName(body.quoteAddress, body.quoteSymbol), quoteAddress: body.quoteAddress?.toLowerCase() || null,
      pair: pairOrNull(body.pair), raised: graduated ? target : raised, graduationTarget: target,
      soldShares: version === 'fair' ? Number(body.sold || 0) : undefined,
      hasBond: Boolean(body.bond) && bondState === 1, bondState: body.bond ? bondState : null,
      bondAmount: body.bond?.amount != null ? String(body.bond.amount) : null, source: 'api',
    };
  }

  async pipfunLoop() {
    while (this.running) {
      try { await this.refreshPipfun(); }
      catch (error) { await this.error('pipfun', error); }
      await new Promise((resolve) => setTimeout(resolve, this.config.intervals.pipfunSec * 1000));
    }
  }

  async refreshPipfun() {
    const response = await fetch('https://pipfun.xyz/v1/coins?sort=new&limit=100', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`pipfun HTTP ${response.status}`);
    const body = await response.json();
    const items = (body.items || body || []).filter((x) => !x.legacy);
    for (const item of items) {
      const key = `pipfun:${String(item.address).toLowerCase()}`;
      const previous = this.store.state.tokens[key];
      const progressPct = Number(item.progress || 0) * 100;
      const current = {
        token: key, address: item.address, platform: 'pipfun', name: item.name, symbol: item.symbol,
        progressPct, status: item.graduated ? 4 : 1, updatedAt: Date.now(),
      };
      this.store.setToken(key, current);
      const crossed = this.config.thresholds.filter((x) => (previous?.progressPct || 0) < x && progressPct >= x);
      await this.rules.notifier.event('pipfun_state', current, {
        substantial: crossed.length > 0,
        reason: crossed.length ? `pipfun 进度跨过 ${crossed.join('/')}%，当前 ${progressPct.toFixed(2)}%` : '常规快照',
      });
    }
    this.store.save();
    return items.length;
  }

  async error(kind, error) {
    await this.rules.anomalyOnce(`launchpad:${kind}`, 'launchpad_watcher_error', {
      summary: `${kind} watcher 失败`, evidence: { error: error.message }, suggestedAction: '核对平台合约、topic 和 RPC；只读降级',
    });
  }

  close() { this.running = false; for (const socket of this.sockets) socket.close(); }
}
