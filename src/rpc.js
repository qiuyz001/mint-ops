import { ethers } from 'ethers';
import WebSocket from 'ws';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shortError = (error) => String(error?.shortMessage || error?.message || error).slice(0, 300);

export class RpcManager {
  constructor(config) {
    this.config = config;
    this.providers = config.rpc.http.map((url) => {
      const request = new ethers.FetchRequest(url);
      request.timeout = config.rpc.timeoutMs;
      return { url, provider: new ethers.JsonRpcProvider(request, config.chainId, { staticNetwork: true }) };
    });
    this.index = 0;
    this.metrics = { calls: 0, failures: 0, wssConnections: 0 };
  }

  async call(fn, attempts = this.providers.length * 2) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      const slot = this.providers[this.index++ % this.providers.length];
      this.metrics.calls++;
      try { return await fn(slot.provider, slot.url); }
      catch (error) {
        this.metrics.failures++;
        lastError = error;
        await sleep(Math.min(2000, 150 * (i + 1)));
      }
    }
    throw lastError || new Error('所有 RPC 均不可用');
  }

  blockNumber() { return this.call((provider) => provider.getBlockNumber()); }
  block(number) { return this.call((provider) => provider.getBlock(number)); }
  code(address) { return this.call((provider) => provider.getCode(address)); }

  async logs({ address, topics, fromBlock, toBlock, step }) {
    const output = [];
    const size = Math.max(1, step || this.config.rpc.logStep);
    for (let start = fromBlock; start <= toBlock; start += size) {
      const end = Math.min(start + size - 1, toBlock);
      const logs = await this.call((provider) => provider.getLogs({ address, topics, fromBlock: start, toBlock: end }));
      output.push(...logs);
    }
    return output;
  }

  watchLogs(filter, onLog, onStatus = () => {}) {
    const watcher = new WsLogWatcher(this.config.rpc.wss, filter, onLog, onStatus, this.metrics);
    watcher.start();
    return watcher;
  }
}

class WsLogWatcher {
  constructor(urls, filter, onLog, onStatus, metrics) {
    this.urls = urls;
    this.filter = filter;
    this.onLog = onLog;
    this.onStatus = onStatus;
    this.metrics = metrics;
    this.index = 0;
    this.closed = false;
    this.live = false;
  }

  start() {
    if (this.closed || !this.urls.length) { this.onStatus({ live: false }); return; }
    const url = this.urls[this.index++ % this.urls.length];
    try { this.ws = new WebSocket(url, { handshakeTimeout: 10000 }); }
    catch { return this.retry(); }
    this.ws.on('open', () => {
      this.live = true;
      this.metrics.wssConnections++;
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['logs', this.filter] }));
      this.onStatus({ live: true, url });
    });
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.method !== 'eth_subscription') return;
        const log = message.params.result;
        for (const key of ['blockNumber', 'index', 'logIndex', 'transactionIndex']) {
          if (typeof log[key] === 'string' && log[key].startsWith('0x')) log[key] = Number.parseInt(log[key], 16);
        }
        if (log.removed) return this.onStatus({ live: this.live, removed: true, log });
        this.onLog(log);
      } catch (error) { this.onStatus({ live: this.live, error: shortError(error) }); }
    });
    this.ws.on('error', (error) => this.onStatus({ live: false, error: shortError(error) }));
    this.ws.on('close', () => { this.live = false; this.onStatus({ live: false }); this.retry(); });
  }

  retry() {
    this.live = false;
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.start(), 3000);
    this.timer.unref?.();
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    try { this.ws?.close(); } catch {}
  }
}

export { shortError, sleep };
