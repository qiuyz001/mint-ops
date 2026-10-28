import { ethers } from 'ethers';

const FOUR_MANAGER = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const FOUR_TOPIC = ethers.id('TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)');
const GANG_OLD = '0x315Ba2e8952D06094CC636b2B84229FA32fb23A7';
const GANG_V2 = '0x1B8F3f69DFa0a7F63d308C7EB0Fd38D8b099966E';
const GANG_OLD_TOPIC = '0xe57a519fe6a031fac5d360f4b8ce246c86dd280b40dc37b68c0a7cc7394ef9c0';
const GANG_V2_TOPIC = '0xd23a447045c377a966a79f59983bae21db7b92fead61df8ace4aea5628043791';
const fourIface = new ethers.Interface(['event TokenCreate(address creator,address token,uint256 requestId,string name,string symbol,uint256 totalSupply,uint256 launchTime,uint256 launchFee)']);
const coder = ethers.AbiCoder.defaultAbiCoder();
const addr = (topic) => ethers.getAddress(`0x${topic.slice(26)}`).toLowerCase();
const QUOTES = new Map([
  ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 'BNB'],
  ['0x0000000000000000000000000000000000000000', 'BNB'],
  ['0x0c6302401aa5325c2e36f170f52c00b1d220b405', 'GANG'],
  ['0x4902c5ebc598265ed2212b559b042de8a5eeec3f', 'BNCB'],
  ['0x21caef8a43163eea865baee23b9c2e327696a3bf', 'XAUT'],
  ['0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a', 'BEM'],
]);

const DEFINITIONS = [
  { id: 'four', platform: 'four', address: [FOUR_MANAGER], topics: [[FOUR_TOPIC]] },
  { id: 'gang', platform: 'gang', address: [GANG_OLD, GANG_V2], topics: [[GANG_OLD_TOPIC, GANG_V2_TOPIC]] },
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
    } else {
      const v2 = log.topics[0] === GANG_V2_TOPIC;
      const [name, symbol] = v2 ? coder.decode(['string', 'string', 'string'], log.data) : coder.decode(['string', 'string'], log.data);
      const quoteAddress = v2 ? addr(log.topics[3]) : null;
      event = {
        token: addr(log.topics[1]), creator: addr(log.topics[2]), name, symbol,
        platform: 'gang', quote: quoteAddress ? (QUOTES.get(quoteAddress) || 'UNKNOWN') : 'BNB', quoteAddress,
      };
    }
    Object.assign(event, { blockNumber: log.blockNumber, blockTime: Number(block.timestamp), seenAt: Date.now(), txHash: log.transactionHash });
    this.store.markEvent(id);
    await this.rules.launchpad(event, { eventId: id });
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
