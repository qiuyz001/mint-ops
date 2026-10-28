#!/usr/bin/env node
import { createRuntime, runOnce, runService } from '../src/index.js';

const [command = 'observe', ...args] = process.argv.slice(2);
const json = (value) => console.log(JSON.stringify(value, null, 2));

try {
  if (command === 'once' || command === 'scan') {
    const hours = Number(args.find((x) => /^\d+(\.\d+)?$/.test(x)) || 0);
    json(await runOnce({ hours }));
  } else if (command === 'observe' || command === 'dry-run') {
    await runService({ dryRun: true });
  } else if (command === 'serve') {
    await runService({ dryRun: !args.includes('--armed') });
  } else if (command === 'status') {
    const runtime = createRuntime();
    json(runtime.store.summary());
  } else if (command === 'mint') {
    const projectId = args[0];
    if (!projectId) throw new Error('用法：node scripts/mint-ops.mjs mint <projectId> [--execute]');
    const runtime = createRuntime();
    const result = await runtime.execution.mint(projectId, { execute: args.includes('--execute') });
    json(result);
  } else {
    console.log('用法：observe | dry-run | once [hours] | status | serve [--armed] | mint <projectId> [--execute]');
  }
} catch (error) {
  console.error(`[失败] ${error.message}`);
  process.exitCode = 1;
}
