import { ethers } from 'ethers';
import { classifyGangLog, gangDefinition, gangEventFields, gangEvents, gangReadHint, GANG_COVERAGE, GANG_FOLLOW_RULES, readGangMarket } from './gang.js';

const FOUR_MANAGER = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const FOUR_TOPIC = ethers.id('TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)');
const fourIface = new ethers.Interface(['event TokenCreate(address creator,address token,uint256 requestId,string name,string symbol,uint256 totalSupply,uint256 launchTime,uint256 launchFee)']);

const DEFINITIONS = [
  { id: 'four', platform: 'four', address: [FOUR_MANAGER], topics: [[FOUR_TOPIC]] },
  gangDefinition(),
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
    if (this.config.intervals.pipfunSec > 0) this.pipfunLoop();
    this.refreshLoop();
  }

  async once(hours = 0) {
    this.gangRows = [];
    this.gangQuiet = 0;
    const tip = await this.rpc.blockNumber();
    const span = hours > 0 ? Math.max(1, Math.floor(hours * 8000)) : this.config.rpc.backfillBlocks;
    const from = Math.max(0, tip - span);
    const def = DEFINITIONS.find((item) => item.id === 'gang');
    await this.scan(def, from, tip);
    await this.refreshGang({ force: true });
    return {
      fromBlock: from,
      toBlock: tip,
      substantial: this.gangRows,
      quiet: this.gangQuiet,
      thresholds: this.config.thresholds,
      followRules: GANG_FOLLOW_RULES,
      armed: false,
      autoTrade: false,
      coverage: GANG_COVERAGE,
    };
  }

  async scan(def, fromBlock, toBlock) {
    if (fromBlock > toBlock) return;
    const windowSec = Math.max(this.config.strategy.maxNewTokenAgeSec, toBlock - fromBlock + 1);
    const previousWindow = this.scanWindowSec;
    if (def.platform === 'gang') this.scanWindowSec = windowSec;
    try {
      const logs = await this.rpc.logs({ address: def.address, topics: def.topics, fromBlock, toBlock, step: def.logStep });
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
      for (const log of logs) await this.handle(def, log);
    } finally {
      this.scanWindowSec = previousWindow;
    }
    this.store.state.cursors[`launch:${def.id}`] = toBlock;
    this.store.save();
  }

  async handle(def, log) {
    const id = `${log.transactionHash}:${log.index}`;
    if (this.store.hasEvent(id)) return;
    const block = await this.rpc.block(log.blockNumber);
    if (!block) throw new Error(`无法读取区块 ${log.blockNumber}`);
    let event;
    if (def.platform === 'gang') {
      await this.handleGang(log, id, block);
      return;
    }
    const parsed = fourIface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) return;
    const a = parsed.args;
    event = { token: a.token.toLowerCase(), creator: a.creator.toLowerCase(), name: a.name, symbol: a.symbol, platform: 'four', quote: 'BNB' };
    Object.assign(event, { blockNumber: log.blockNumber, blockTime: Number(block.timestamp), seenAt: Date.now(), txHash: log.transactionHash });
    this.store.markEvent(id);
    await this.rules.launchpad(event, { eventId: id });
    this.store.save();
  }

  async handleGang(log, id, block) {
    const kind = classifyGangLog(log);
    let parsed = null;
    try { parsed = gangEvents.parseLog({ topics: log.topics, data: log.data }); } catch { parsed = null; }
    if (!kind || !parsed?.args?.token) {
      this.store.markEvent(id);
      return;
    }
    const seenAt = Date.now();
    const fields = gangEventFields(parsed, kind);
    const market = await readGangMarket(this.rpc, fields.token, kind.factory);
    const current = {
      ...fields,
      ...(market || {}),
      token: fields.token,
      platform: 'gang',
      blockNumber: log.blockNumber,
      blockTime: Number(block.timestamp),
      seenAt,
      txHash: log.transactionHash,
    };
    if (fields.justGraduated) {
      current.graduated = true;
      current.justGraduated = true;
      if (current.progressPct == null) current.progressPct = 100;
    }
    if (fields.bondJustPosted) {
      current.bondJustPosted = true;
      current.bondExists = true;
    }
    if (fields.name) current.name = fields.name;
    if (fields.symbol) current.symbol = fields.symbol;
    this.store.markEvent(id, seenAt);
    const result = await this.rules.gang(current, { isNew: kind.event === 'created', eventId: id, windowSec: this.scanWindowSec || 0 });
    this.noteGang(result);
    this.store.save();
  }

  async refreshLoop() {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!this.running) break;
      try { await this.refreshGang(); }
      catch (error) { await this.error('gang-refresh', error); }
    }
  }

  async refreshGang({ force = false } = {}) {
    const now = Date.now();
    for (const token of Object.values(this.store.state.tokens)) {
      if (token.platform !== 'gang' || token.status === 4 || token.status === 3) continue;
      if (!force && (token.nextCheckAt || 0) > now) continue;
      if (force && token.updatedAt && now - token.updatedAt < 5000) continue;
      try {
        const latest = await readGangMarket(this.rpc, token.token, gangReadHint(token));
        if (!latest?.kind && latest?.source !== 'gang.fun') {
          await this.error(`gang-state:${token.token}`, new Error(latest?.readError || '曲线读取为空'));
          continue;
        }
        const result = await this.rules.gang({ ...token, ...latest, seenAt: now }, { windowSec: this.scanWindowSec || 0 });
        this.noteGang(result);
      } catch (error) {
        await this.error(`gang-state:${token.token}`, error);
      }
    }
    this.store.save();
  }

  noteGang(result) {
    if (!result) return;
    if (result.substantial && Array.isArray(this.gangRows)) this.gangRows.push(result.row);
    else if (!result.substantial && this.gangQuiet != null) this.gangQuiet += 1;
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
