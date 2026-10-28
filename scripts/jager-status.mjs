import { ethers } from 'ethers';
const p = new ethers.JsonRpcProvider('https://bsc-rpc.publicnode.com');
const abi = [
  'function TOTAL_SHARES() view returns (uint256)',
  'function SHARE() view returns (uint256)',
  'function MAX_PER_ID() view returns (uint256)',
  'function sharePrice() view returns (uint256)',
  'function totalMinted() view returns (uint256)',
  'function mintingOpen() view returns (bool)',
  'function finalized() view returns (bool)',
  'function canFinalize() view returns (bool)',
  'function OPEN_AT() view returns (uint256)',
  'function mintStart() view returns (uint256)',
  'function openedAt() view returns (uint256)',
  'function openedTime() view returns (uint256)',
  'function reserveLeft() view returns (uint256)',
  'function swapFeeBps() view returns (uint256)',
  'function registrar() view returns (address)',
  'function treasury() view returns (address)',
  'function usdtUnit() view returns (uint256)',
  'function status() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)',
  'function token() view returns (address)',
  'function pair() view returns (address)',
  'function LP_BPS() view returns (uint256)',
  'function lastFlushMinted() view returns (uint256)',
  'function flushCount() view returns (uint256)',
  'function pendingLp() view returns (uint256)',
];
const c = new ethers.Contract('0x2239f7C884833e181302501B22f5D5265520BFd7', abi, p);
for (const f of abi) {
  const n = f.match(/function (\w+)/)[1];
  try {
    const r = await c[n]();
    if (typeof r === 'bigint') console.log(n, r.toString());
    else if (r && typeof r === 'object' && typeof r.length === 'number') {
      console.log(n, [...r].map(x => typeof x==='bigint'?x.toString():String(x)).join(' | '));
    } else console.log(n, String(r));
  } catch(e) { console.log(n, 'FAIL', e.shortMessage); }
}
const start = Number(await c.mintStart());
console.log('mintStart', new Date(start*1000).toISOString(), new Date(start*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));
const taddr = await c.token();
const t = new ethers.Contract(taddr, [
  'function TAX_BPS() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
], p);
console.log('token', await t.name(), await t.symbol(), 'TAX_BPS', (await t.TAX_BPS()).toString(), 'supply', (await t.totalSupply()).toString(), 'dec', await t.decimals());
