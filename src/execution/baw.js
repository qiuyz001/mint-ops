import { execFile } from 'node:child_process';
import { ethers } from 'ethers';
import { assertExecutionAllowed, validatePreview } from './policy.js';
import { parseErc721Receipt, waitReceipt } from './receipts.js';

export class BawExecutor {
  constructor({ config, store, rpc, knownWatcher, notifier }) {
    Object.assign(this, { config, store, rpc, knownWatcher, notifier });
  }

  run(args, timeoutMs = 90_000) {
    return new Promise((resolve, reject) => {
      execFile(this.config.execution.bawBin, ['--json', ...args], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        let body;
        try { body = JSON.parse(String(stdout || '').trim()); } catch { body = null; }
        if (error) return reject(new Error(body?.error?.message || String(stderr || error.message).slice(0, 400)));
        if (!body) return reject(new Error('baw 未返回 JSON'));
        if (body.success === false) return reject(new Error(body.error?.message || body.error?.name || 'baw 执行失败'));
        resolve(body.data ?? body);
      });
    });
  }

  async walletPreflight() {
    const status = await this.run(['wallet', 'status']);
    if (status?.status !== 'CONNECTED') throw new Error('币安 Agentic Wallet 未登录');
    const [addressData, settings, lock] = await Promise.all([
      this.run(['wallet', 'address']),
      this.run(['wallet', 'settings']),
      this.run(['wallet', 'tx-lock', '--binanceChainId', String(this.config.chainId)]),
    ]);
    const addresses = addressData?.addresses || [];
    const expected = this.config.wallet.expectedAddress.toLowerCase();
    if (!addresses.some((x) => String(x.address || x).toLowerCase() === expected)) throw new Error('baw 当前钱包与预期地址不一致');
    if (!settings?.devMode?.enabled) throw new Error('币安钱包 Developer Mode 未开启或已过期');
    if (lock?.status === 'LOCKED') throw new Error('钱包正等待 App 确认，禁止重复发起');
    return true;
  }

  buildCall(project) {
    const execution = project.execution;
    const iface = new ethers.Interface(project.abi);
    const signature = execution.function;
    const name = signature.slice(0, signature.indexOf('('));
    const args = (execution.args || []).map((x) => x === '{wallet}' ? this.config.wallet.expectedAddress : x);
    return {
      to: project.address,
      valueWei: ethers.parseEther(execution.value || '0').toString(),
      inputData: iface.encodeFunctionData(name, args),
    };
  }

  async preview(project) {
    const call = this.buildCall(project);
    return this.run([
      'contract-call', 'preview', '--binanceChainId', String(this.config.chainId),
      '--from', this.config.wallet.expectedAddress, '--to', call.to,
      '--value', call.valueWei, '--inputData', call.inputData,
    ], 45_000);
  }

  async mint(projectId, { execute = false, automatic = false } = {}) {
    const project = this.config.projects.find((x) => x.id === projectId);
    if (!project) throw new Error(`未知项目 ${projectId}`);
    const state = await this.knownWatcher.preflight(project);
    if (!execute) {
      const preview = await this.preview(project);
      return { status: 'preview', project: projectId, requestId: preview.requestId || null, requireConfirmation: !!preview.requireConfirmation, risks: preview.risks?.riskDetails || [] };
    }
    assertExecutionAllowed(this.config, project, state, { automatic });
    await this.walletPreflight();
    const preview = await this.preview(project);
    validatePreview(preview);
    this.store.state.reservations[project.id] = { status: 'pending', at: Date.now() };
    this.store.save();
    let result;
    try {
      result = await this.run(['contract-call', 'execute', '--requestId', String(preview.requestId)], 150_000);
    } catch (error) {
      this.store.state.reservations[project.id] = { status: 'unknown', at: Date.now(), error: error.message };
      this.store.save();
      await this.notifier.anomaly('execution_unknown', { summary: `${project.name} execute 结果未知，禁止自动重试`, evidence: { error: error.message } });
      throw error;
    }
    if (result.status === 'PENDING_CONFIRMATION' || !result.txHash) {
      this.store.state.reservations[project.id] = { status: 'unknown', at: Date.now(), result };
      this.store.save();
      await this.notifier.anomaly('execution_pending_confirmation', { summary: `${project.name} 需要 App 确认`, evidence: result });
      return { status: 'pending_confirmation', result };
    }
    this.store.state.reservations[project.id] = { status: 'broadcasted', at: Date.now(), txHash: result.txHash };
    this.store.save();
    const receipt = await waitReceipt(this.rpc, result.txHash);
    const tokenIds = project.execution.kind === 'erc721' ? parseErc721Receipt(receipt, project.address) : [];
    this.store.state.reservations[project.id] = { status: 'confirmed', at: Date.now(), txHash: result.txHash, tokenIds };
    this.store.receipt({ project: project.id, token: project.address, txHash: result.txHash, tokenIds, kind: 'free_mint' });
    this.store.save();
    return { status: 'confirmed', txHash: result.txHash, tokenIds };
  }

  async maybeMint(project, state) {
    if (!this.config.execution.armed || project.execution?.autoAllowed !== true) return null;
    if (!this.config.execution.allowedProjects.includes(project.id)) return null;
    const reservation = this.store.state.reservations[project.id];
    if (reservation && ['pending', 'unknown', 'broadcasted', 'confirmed'].includes(reservation.status)) return null;
    const today = new Date().toISOString().slice(0, 10);
    const used = Object.values(this.store.state.reservations).filter((x) => new Date(x.at).toISOString().slice(0, 10) === today).length;
    if (used >= this.config.execution.dailyFreeMintCap) return null;
    return this.mint(project.id, { execute: true, automatic: true });
  }
}
