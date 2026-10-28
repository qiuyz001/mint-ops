import { ethers } from 'ethers';

const TRANSFER = ethers.id('Transfer(address,address,uint256)');
const ZERO = `0x${'0'.repeat(64)}`;

export function parseErc721Receipt(receipt, expectedToken) {
  if (!receipt || receipt.status !== 1) throw new Error('交易未成功确认');
  const tokenIds = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedToken.toLowerCase()) continue;
    if (log.topics[0] !== TRANSFER || log.topics.length !== 4) continue;
    if (log.topics[1].toLowerCase() !== ZERO) continue;
    tokenIds.push(BigInt(log.topics[3]).toString());
  }
  return tokenIds;
}

export async function waitReceipt(rpc, txHash, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await rpc.call((provider) => provider.getTransactionReceipt(txHash)).catch(() => null);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const error = new Error(`交易已广播但 ${timeoutMs}ms 内未确认：${txHash}`);
  error.code = 'UNCONFIRMED';
  throw error;
}
