import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const csv = (value) => String(value || '').split(',').map((x) => x.trim()).filter(Boolean);

export function loadConfig(overrides = {}) {
  const config = readJson(path.join(ROOT, 'config/default.json'));
  const projects = readJson(path.join(ROOT, 'config/projects.json'));
  if (process.env.BSC_HTTP_RPCS) config.rpc.http = csv(process.env.BSC_HTTP_RPCS);
  if (process.env.BSC_WSS_URLS) config.rpc.wss = csv(process.env.BSC_WSS_URLS);
  if (process.env.MINT_OPS_DATA_DIR) config.dataDir = process.env.MINT_OPS_DATA_DIR;
  if (process.env.MINT_OPS_WEBHOOK_URL) config.webhookUrl = process.env.MINT_OPS_WEBHOOK_URL;
  if (process.env.MINT_OPS_ARMED) config.execution.armed = process.env.MINT_OPS_ARMED === '1';
  if (process.env.BAW_BIN) config.execution.bawBin = process.env.BAW_BIN;
  Object.assign(config, overrides);
  config.rootDir = ROOT;
  config.dataDir = path.resolve(ROOT, config.dataDir);
  config.projects = projects.filter((p) => p.enabled !== false);
  validate(config);
  return config;
}

function validate(config) {
  if (config.chainId !== 56) throw new Error('当前仅支持 BSC 主网 chainId=56');
  if (!config.rpc.http.length) throw new Error('至少配置一个 BSC HTTP RPC');
  if (!ethers.isAddress(config.wallet.expectedAddress)) throw new Error('钱包地址无效');
  for (const p of config.projects) {
    if (!p.id || !ethers.isAddress(p.address)) throw new Error(`项目地址无效: ${p.id || 'unknown'}`);
    if (!Array.isArray(p.abi) || !Array.isArray(p.reads)) throw new Error(`项目 ABI/reads 无效: ${p.id}`);
    new ethers.Interface(p.abi);
    if (p.execution?.value !== undefined && p.execution.value !== '0') {
      throw new Error(`仅允许零费用自动执行配置: ${p.id}`);
    }
  }
}

export function resolveArgs(args, wallet) {
  return (args || []).map((arg) => arg === '{wallet}' ? wallet : arg);
}
