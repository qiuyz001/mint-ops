import { loadConfig } from './config.js';
import { Store } from './store.js';
import { RpcManager } from './rpc.js';
import { Notifier } from './notifier.js';
import { Rules } from './rules.js';
import { FlapWatcher } from './watchers/flap.js';
import { KnownCaWatcher } from './watchers/known-ca.js';
import { LaunchpadWatcher } from './watchers/launchpads.js';
import { formatGangReport, GANG_FOLLOW_RULES, shanghaiNow } from './watchers/gang.js';
import { BawExecutor } from './execution/baw.js';

export function createRuntime(overrides = {}) {
  const config = loadConfig(overrides);
  const store = new Store(config.dataDir);
  const rpc = new RpcManager(config);
  const notifier = new Notifier(store, config);
  const rules = new Rules({ config, store, notifier });
  const knownWatcher = new KnownCaWatcher({ config, rpc, store, rules });
  const execution = new BawExecutor({ config, store, rpc, knownWatcher, notifier });
  knownWatcher.execution = execution;
  const flap = new FlapWatcher({ config, rpc, store, rules });
  const launchpads = new LaunchpadWatcher({ config, rpc, store, rules });
  return { config, store, rpc, notifier, rules, knownWatcher, execution, flap, launchpads };
}

export async function runOnce({ hours = 0, includeKnown = true, includePipfun = true, includeGang = true } = {}) {
  const runtime = createRuntime({ mode: 'once' });
  runtime.config.execution.armed = false;
  const flap = await runtime.flap.once(hours);
  const known = includeKnown ? await runtime.knownWatcher.once() : [];
  let pipfun = null;
  if (includePipfun) {
    try { pipfun = await runtime.launchpads.refreshPipfun(); }
    catch (error) { await runtime.rules.anomalyOnce('pipfun:once', 'pipfun_snapshot_failed', { summary: 'pipfun 快照失败', evidence: { error: error.message } }); }
  }
  let gang = null;
  if (includeGang) {
    try { gang = await runtime.launchpads.once(hours); }
    catch (error) { await runtime.rules.anomalyOnce('gang:once', 'gang_scan_failed', { summary: 'Gang 曲线扫描失败', evidence: { error: error.message } }); gang = { error: error.message, substantial: [], armed: false, autoTrade: false }; }
  }
  runtime.store.save();
  return { mode: 'once', armed: false, flap, knownProjects: known.length, pipfun, gang, rpc: runtime.rpc.metrics, state: runtime.store.summary() };
}

export async function runGangScan({ hours = 0 } = {}) {
  const runtime = createRuntime({ mode: 'gang-scan' });
  runtime.config.execution.armed = false;
  runtime.config.silentConsole = true;
  const gang = await runtime.launchpads.once(hours);
  runtime.store.save();
  const at = shanghaiNow();
  const report = formatGangReport({ at, ...gang });
  return {
    at,
    timezone: 'Asia/Shanghai',
    armed: runtime.config.execution.armed,
    autoTrade: false,
    mode: 'read-only',
    followRules: GANG_FOLLOW_RULES,
    report,
    ...gang,
    rpc: runtime.rpc.metrics,
    state: runtime.store.summary(),
  };
}

export async function runService({ dryRun = true } = {}) {
  const runtime = createRuntime({ mode: dryRun ? 'dry-run' : 'armed-service' });
  if (dryRun) runtime.config.execution.armed = false;
  await runtime.flap.start();
  await runtime.knownWatcher.start();
  await runtime.launchpads.start();
  console.log(`[运行] mode=${runtime.config.mode} · 只读/模拟=${dryRun} · projects=${runtime.config.projects.length}`);
  const heartbeat = setInterval(() => {
    console.log(`[心跳] tokens=${Object.keys(runtime.store.state.tokens).length} · rpc=${runtime.rpc.metrics.calls} · failures=${runtime.rpc.metrics.failures}`);
  }, 60_000);
  const close = async () => {
    clearInterval(heartbeat);
    await runtime.flap.close();
    runtime.knownWatcher.close();
    runtime.launchpads.close();
    runtime.store.save();
  };
  process.once('SIGINT', async () => { await close(); process.exit(0); });
  process.once('SIGTERM', async () => { await close(); process.exit(0); });
  return runtime;
}
