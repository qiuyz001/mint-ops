#!/usr/bin/env node
import { createRuntime } from '../src/index.js';
import {
  GANG_OLD, GANG_V2, GANG_V3, GANG_OLD_TOPIC, GANG_V2_TOPIC,
  GANG_V3_TOPIC, GANG_FAIR_TOPIC, GANG_FACTORY_BLOCK,
} from '../src/watchers/launchpads.js';

const hours = Number(process.argv[2] || 0);
const logStep = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
if (!Number.isFinite(hours) || hours < 0 || (logStep !== undefined && (!Number.isInteger(logStep) || logStep < 1))) {
  throw new Error('用法：node scripts/gang-scan.mjs [hours>=0] [logStep>=1 整数]');
}

const runtime = createRuntime({ mode: 'gang-scan' });
runtime.config.execution.armed = false;
if (logStep !== undefined) runtime.config.rpc.logStep = logStep;
const result = await runtime.launchpads.once(hours);
const report = {
  success: true,
  complete: result.progress.errors.length === 0,
  generatedAt: new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium', hour12: false,
  }).format(new Date()),
  timeZone: 'Asia/Shanghai',
  readOnly: true,
  armed: runtime.config.execution.armed,
  hours,
  logStep: runtime.config.rpc.logStep,
  factories: [
    { id: 'old', address: GANG_OLD, topic: GANG_OLD_TOPIC },
    { id: 'v2', address: GANG_V2, topic: GANG_V2_TOPIC },
    { id: 'v3', address: GANG_V3, topic: GANG_V3_TOPIC, deploymentBlock: GANG_FACTORY_BLOCK },
    { id: 'fair', address: GANG_V3, topic: GANG_FAIR_TOPIC, deploymentBlock: GANG_FACTORY_BLOCK },
  ],
  ...result,
  rpc: runtime.rpc.metrics,
};
console.log(JSON.stringify(report, null, 2));
