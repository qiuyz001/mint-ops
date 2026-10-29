#!/usr/bin/env node
// 兼容原有一次性扫描入口；现在使用增量游标、真实区块时间和统一状态存储。
import { runOnce } from '../src/index.js';

const hours = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 0;
try {
  const result = await runOnce({ hours, includeKnown: false, includePipfun: false, includeGang: false });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
