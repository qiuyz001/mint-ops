import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { identity, number } from './feeds.js';
const exec = promisify(execFile);
export class BawBroker {
  constructor(config, run) {
    this.config = config;
    this.run = run ?? (async args => {
      // On Windows set bawScript to the installed CLI's JS entrypoint, avoiding shell execution.
      const c = config.execution;
      const { stdout } = await exec(c.bawScript ? process.execPath : c.bawBin,
        [...(c.bawScript ? [c.bawScript] : []), ...args, '--json'], { timeout: 20000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      const body = JSON.parse(stdout);
      if (body.success !== true) throw new Error('BAW request failed');
      return body.data;
    });
  }
  async preflight(chainId) {
    const c = this.config.execution;
    if (this.config.mode !== 'live' || c.armed !== true || process.env.MINT_OPS_LIVE !== '1') throw new Error('Live execution not armed');
    // First live rollout is BSC/USDT only. Other chains remain discovery + paper.
    if (chainId !== '56' || !c.allowedChains.includes(chainId) || c.settlementToken.toLowerCase() !== '0x55d398326f99059ff775485246999027b3197955') throw new Error('Live chain/settlement unsupported');
    identity(chainId, c.expectedAddress);
    const [status, addresses, lock] = await Promise.all([this.run(['wallet', 'status']), this.run(['wallet', 'address']), this.run(['wallet', 'tx-lock', '--binanceChainId', chainId])]);
    if (status?.status !== 'CONNECTED' || lock?.status !== 'UNLOCKED') throw new Error('Wallet disconnected or locked');
    if (!addresses?.addresses?.some(a => String(a.binanceChainId) === chainId && a.address.toLowerCase() === c.expectedAddress.toLowerCase())) throw new Error('Wallet identity mismatch');
  }
  args(t, side, qty) {
    const stable = this.config.execution.settlementToken;
    return ['--binanceChainId', t.chainId, '--fromToken', side === 'buy' ? stable : t.address,
      '--toToken', side === 'buy' ? t.address : stable, '--fromTokenQty', qty, '--slippage', String(this.config.execution.maxSlippagePct)];
  }
  async quote(t, side, qty) {
    const q = await this.run(['market-order', 'quote', ...this.args(t, side, qty)]);
    const amount = number(q?.toCoinAmount);
    if (amount === null || amount <= 0) throw new Error('Invalid executable quote');
    return { amount, at: Date.now() };
  }
  async balance(t) {
    const rows = await this.run(['wallet', 'balance', '--binanceChainId', t.chainId, '--tokenAddress', t.address]);
    if (!Array.isArray(rows)) throw new Error('Balance schema drift');
    const row = rows.find(x => String(x.binanceChainId) === t.chainId && x.address.toLowerCase() === t.address.toLowerCase());
    return row ? number(row.balance) : 0;
  }
  async submit(t, side, qty) {
    await this.preflight(t.chainId);
    const result = await this.run(['market-order', 'swap', ...this.args(t, side, qty), '--mev', 'true', '--gasLevel', 'HIGH']);
    if (!result?.orderId) throw new Error('Submission status unknown');
    return String(result.orderId);
  }
  async reconcile(order) {
    const result = await this.run(['market-order', 'list', '--orderId', order.orderId]);
    const row = result?.list?.find(x => String(x.orderId) === order.orderId);
    if (!row || !['FINISHED', 'FAILED'].includes(row.status)) return null;
    if (row.status === 'FAILED') return { failed: true };
    if (!/^0x[0-9a-fA-F]{64}$/.test(row.txHash ?? '')) return null;
    // The submit/list response does not reliably expose actual consumed input.
    // Reconcile confirmed wallet instructions, including refunds and fees, before updating positions.
    const history = await this.run(['wallet', 'tx-history', '--tx', row.txHash, '--binanceChainId', order.token.chainId]);
    const tx = history?.transactions?.find(x => x.txHash === row.txHash && x.status === 'confirmed');
    if (!tx) return null;
    const expected = this.config.execution.expectedAddress.toLowerCase();
    const legs = tx.txHashList?.filter(x => x.txHash === row.txHash && x.status === 'confirmed') ?? [];
    const input = order.side === 'buy' ? this.config.execution.settlementToken : order.token.address;
    const output = order.side === 'buy' ? order.token.address : this.config.execution.settlementToken;
    const sum = (direction, address) => legs.flatMap(x => x.instructions?.[direction] ?? []).filter(x =>
      x.addressInfo?.address?.toLowerCase() === expected && x.tokenInfo?.contractAddress?.toLowerCase() === address.toLowerCase()
    ).reduce((n, x) => {
      if (!/^\d+$/.test(x.amount) || !Number.isInteger(x.tokenInfo.decimals) || x.tokenInfo.decimals < 0 || x.tokenInfo.decimals > 36) throw new Error('Receipt amount schema drift');
      return n + Number(x.amount) / 10 ** x.tokenInfo.decimals;
    }, 0);
    const spent = sum('send', input) - sum('receive', input), received = sum('receive', output) - sum('send', output);
    if (!(spent > 0 && received > 0)) return null;
    // feeValue's denomination is not documented. Read actual BSC receipt gas and value it in USD.
    const response = await fetch(this.config.execution.receiptRpc, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [row.txHash] }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const receipt = (await response.json()).result;
    if (receipt?.status !== '0x1' || receipt.transactionHash?.toLowerCase() !== row.txHash.toLowerCase() || !receipt.gasUsed || !receipt.effectiveGasPrice) return null;
    const native = await this.run(['wallet', 'balance', '--binanceChainId', '56', '--tokenAddress', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE']);
    const nativePrice = number(native?.find(x => x.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')?.price);
    if (!(nativePrice > 0)) return null;
    const feeUsd = Number(BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)) / 1e18 * nativePrice;
    return { spent, received, feeUsd, txHash: row.txHash };
  }
}
