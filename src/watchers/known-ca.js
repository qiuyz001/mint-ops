import { ethers } from 'ethers';
import { resolveArgs } from '../config.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export class KnownCaWatcher {
  constructor({ config, rpc, store, rules, execution = null }) {
    Object.assign(this, { config, rpc, store, rules, execution });
    this.running = false;
  }

  async start() {
    this.running = true;
    await this.refreshAll();
    this.loop();
  }

  async once() { return this.refreshAll(); }

  async refreshAll() {
    const results = [];
    for (const project of this.config.projects) {
      try { results.push(await this.refresh(project)); }
      catch (error) {
        await this.rules.anomalyOnce(`known-fatal:${project.id}`, 'known_ca_refresh_failed', {
          summary: `${project.name} 刷新失败`, evidence: { error: error.message }, suggestedAction: '保持只读并核对项目适配器',
        });
      }
    }
    this.store.save();
    return results;
  }

  async refresh(project, { allowExecution = true } = {}) {
    const values = {}, errors = [];
    for (const read of project.reads) {
      try {
        values[read.key] = await this.rpc.call(async (provider) => {
          const contract = new ethers.Contract(project.address, project.abi, provider);
          const args = resolveArgs(read.args, this.config.wallet.expectedAddress);
          const result = await contract[read.method](...args);
          return typeof result === 'bigint' ? result.toString() : result;
        });
      } catch (error) { errors.push({ key: read.key, error: error.message }); }
    }
    const supply = Number(values[project.supplyKey] ?? 0);
    const maxSupply = Number(values.maxSupply ?? project.maxSupply ?? 0);
    const progressPct = supply >= 0 && maxSupply > 0 ? Math.min(100, supply / maxSupply * 100) : null;
    const current = { id: project.id, address: project.address, values, errors, progressPct, updatedAt: Date.now() };
    await this.rules.known(project, current);
    if (allowExecution && !errors.length && this.execution) await this.execution.maybeMint(project, current);
    return current;
  }

  async loop() {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const now = Date.now();
      for (const project of this.config.projects) {
        const state = this.store.project(project.id);
        if ((state?.nextCheckAt || 0) > now) continue;
        if (state) state.nextCheckAt = now + 10_000;
        try { await this.refresh(project); }
        catch (error) { await this.rules.anomalyOnce(`known-loop:${project.id}`, 'known_ca_refresh_failed', { summary: `${project.name} 刷新失败`, evidence: { error: error.message } }); }
      }
      this.store.save();
    }
  }

  async preflight(project) {
    const current = await this.refresh(project, { allowExecution: false });
    const values = current.values;
    const failures = [];
    for (const rule of project.execution?.requires || []) {
      const value = values[rule.key];
      if (rule.equals !== undefined && String(value) !== String(rule.equals)) failures.push(`${rule.key}=${value}，期望 ${rule.equals}`);
      if (rule.gt !== undefined && !(BigInt(value ?? 0) > BigInt(rule.gt))) failures.push(`${rule.key}=${value}，应大于 ${rule.gt}`);
      if (rule.lt !== undefined && !(BigInt(value ?? 0) < BigInt(rule.lt))) failures.push(`${rule.key}=${value}，应小于 ${rule.lt}`);
    }
    const supplyKey = project.supplyKey;
    if (supplyKey && values.maxSupply && BigInt(values[supplyKey] ?? 0) >= BigInt(values.maxSupply)) failures.push('已经售罄');
    if (values.pair && values.pair.toLowerCase() !== ZERO_ADDRESS && project.id === 'jagent') failures.push('旧 JAGENT 已开池，禁止沿用旧 mint 入口');
    if (failures.length) throw new Error(failures.join('；'));
    return current;
  }

  close() { this.running = false; }
}
