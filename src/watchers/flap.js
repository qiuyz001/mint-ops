import { ethers } from 'ethers';

export const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
export const TOPIC_CREATED = '0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603';
export const TOPIC_EXT = ethers.id('TokenExtensionEnabled(address,bytes32,address,uint8)');
const ZERO32 = `0x${'0'.repeat(64)}`;
const STATUS = { 0: 'Invalid', 1: 'Tradable', 2: 'InDuel', 3: 'Killed', 4: 'DEX', 5: 'Staged' };
const ABI = [
  'function getTokenV8Safe(address token) view returns (tuple(uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId))',
  'function getTokenV5(address token) view returns (tuple(uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID))',
  'event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)',
  'event TokenExtensionEnabled(address token,bytes32 extensionID,address extensionAddress,uint8 version)',
];
const iface = new ethers.Interface(ABI);

export class FlapWatcher {
  constructor({ config, rpc, store, rules }) {
    Object.assign(this, { config, rpc, store, rules });
    this.running = false;
    this.processed = 0;
  }

  async start() {
    this.running = true;
    const tip = await this.rpc.blockNumber();
    const from = Math.max(0, (this.store.state.cursors.flap ?? tip - this.config.rpc.backfillBlocks) + 1);
    await this.scan(from, tip);
    this.ws = this.rpc.watchLogs({ address: FLAP_PORTAL, topics: [[TOPIC_CREATED, TOPIC_EXT]] },
      (log) => this.handleLog(log).catch((error) => this.error('wss_log', error)),
      (status) => {
        this.wsLive = status.live;
        if (status.removed) this.error('reorg', new Error(`日志被重组移除 ${status.log.transactionHash}:${status.log.index}`));
      });
    this.backfillLoop();
    this.refreshLoop();
  }

  async once(hours = 0) {
    const tip = await this.rpc.blockNumber();
    const span = hours > 0 ? Math.max(1, Math.floor(hours * 8000)) : this.config.rpc.backfillBlocks;
    const from = Math.max(0, tip - span);
    await this.scan(from, tip);
    return { fromBlock: from, toBlock: tip, processed: this.processed, tracked: Object.keys(this.store.state.tokens).length };
  }

  async scan(fromBlock, toBlock) {
    if (fromBlock > toBlock) return;
    const logs = await this.rpc.logs({ address: FLAP_PORTAL, topics: [[TOPIC_CREATED, TOPIC_EXT]], fromBlock, toBlock });
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    for (const log of logs) await this.handleLog(log);
    this.store.state.cursors.flap = toBlock;
    this.store.save();
  }

  async handleLog(log) {
    const id = `${log.transactionHash}:${log.index}`;
    if (this.store.hasEvent(id)) return;
    let parsed;
    try { parsed = iface.parseLog({ topics: log.topics, data: log.data }); } catch { return; }
    const block = await this.rpc.block(log.blockNumber);
    if (!block) throw new Error(`无法读取区块 ${log.blockNumber} 的真实时间`);
    const seenAt = Date.now();
    let current;
    if (parsed.name === 'TokenCreated') {
      const a = parsed.args;
      current = await this.readState(a.token);
      Object.assign(current, {
        token: a.token.toLowerCase(), creator: a.creator, name: a.name, symbol: a.symbol,
        platform: 'flap', blockNumber: log.blockNumber, blockTime: Number(block.timestamp), seenAt,
        txHash: log.transactionHash,
      });
    } else if (parsed.name === 'TokenExtensionEnabled') {
      const a = parsed.args;
      const previous = this.store.token(a.token) || {};
      current = {
        ...previous, token: a.token.toLowerCase(), platform: 'flap', extensionID: a.extensionID,
        extensionAddress: a.extensionAddress, blockNumber: log.blockNumber, blockTime: Number(block.timestamp), seenAt,
      };
      if (!previous.status) Object.assign(current, await this.readState(a.token));
    } else return;
    this.store.markEvent(id, seenAt);
    this.processed++;
    await this.rules.flap(current, { isNew: parsed.name === 'TokenCreated', eventId: id });
    this.store.save();
  }

  async readState(token) {
    return this.rpc.call(async (provider) => {
      const contract = new ethers.Contract(FLAP_PORTAL, ABI, provider);
      try {
        const s = await contract.getTokenV8Safe(token);
        return this.normalize(token, s, true);
      } catch {
        const s = await contract.getTokenV5(token);
        return this.normalize(token, s, false);
      }
    });
  }

  normalize(token, s, v8) {
    const status = Number(s.status);
    const quoteAddress = s.quoteTokenAddress;
    const quote = ['0x0000000000000000000000000000000000000000', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'].includes(quoteAddress.toLowerCase()) ? 'BNB' : quoteAddress;
    return {
      token: token.toLowerCase(), platform: 'flap', status, statusName: STATUS[status] || `unknown(${status})`,
      reserve: s.reserve.toString(), price: s.price.toString(), quote, quoteAddress,
      extensionID: s.extensionID || ZERO32, buyTaxBps: v8 ? Number(s.buyTaxRate) : 0,
      sellTaxBps: v8 ? Number(s.sellTaxRate) : 0, pool: v8 ? s.pool : null,
      progressPct: v8 ? Number(s.progress) / 1e16 : null,
    };
  }

  async backfillLoop() {
    while (this.running) {
      const waitSec = this.wsLive ? this.config.rpc.backfillNormalSec : this.config.rpc.backfillDownSec;
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      if (!this.running) break;
      try {
        const tip = await this.rpc.blockNumber();
        const from = (this.store.state.cursors.flap ?? tip - this.config.rpc.backfillBlocks) + 1;
        await this.scan(from, tip);
      } catch (error) { await this.error('backfill', error); }
    }
  }

  async refreshLoop() {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const now = Date.now();
      for (const token of Object.values(this.store.state.tokens)) {
        if (token.platform !== 'flap' || (token.nextCheckAt || 0) > now || [3, 4].includes(token.status)) continue;
        token.nextCheckAt = now + 10_000;
        try {
          const latest = await this.readState(token.token);
          await this.rules.flap({ ...token, ...latest, seenAt: now });
        } catch (error) { await this.error(`state:${token.token}`, error); }
      }
    }
  }

  async error(kind, error) {
    await this.rules.anomalyOnce(`flap:${kind}`, 'flap_watcher_error', {
      summary: `Flap watcher ${kind} 失败`, evidence: { error: error.message }, suggestedAction: '检查 RPC/WSS；异常未闭合前不执行交易',
    });
  }

  async close() { this.running = false; this.ws?.close(); }
}
