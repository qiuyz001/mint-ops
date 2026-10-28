#!/usr/bin/env node
// JAGENT 旧 CA 只读探针；只盯换约/开池，不提供 mint 执行。
import { createRuntime } from '../src/index.js';

const runtime = createRuntime();
runtime.config.projects = runtime.config.projects.filter((project) => project.id === 'jagent');
if (!runtime.config.projects.length) throw new Error('config/projects.json 中没有 jagent');
const result = await runtime.knownWatcher.once();
console.log(JSON.stringify(result, null, 2));
