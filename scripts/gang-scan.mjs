#!/usr/bin/env node
// Gang 曲线进度只读扫描。不买入、不卖出，也不把 execution.armed 打开。
import { runGangScan } from '../src/index.js';

const hours = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 0;
try {
  const result = await runGangScan({ hours });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[失败] ${error.message}`);
  process.exitCode = 1;
}
