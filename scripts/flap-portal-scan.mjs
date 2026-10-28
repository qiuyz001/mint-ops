#!/usr/bin/env node
/**
 * Flap Portal TokenCreated scan (BSC) + pipfun /v1 snapshot
 * Non-investment; read-only.
 */
import { ethers } from "ethers";
import fs from "fs";

const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TOPIC_CREATED =
  "0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603";
// TokenExtensionEnabled(address token, bytes32 extensionID, address extensionAddress, uint8 version)
const TOPIC_EXT =
  ethers.id("TokenExtensionEnabled(address,bytes32,address,uint8)");

const RPCS = [
  "https://1rpc.io/bnb",
  "https://bsc.rpc.blxrbdn.com",
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed.binance.org",
  "https://bsc.publicnode.com",
  "https://bsc-rpc.publicnode.com",
];

const STATUS = {
  0: "Invalid",
  1: "Tradable",
  2: "InDuel",
  3: "Killed",
  4: "DEX",
  5: "Staged",
};

const portalAbi = [
  "function getTokenV8Safe(address token) view returns (tuple(uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId))",
  "function getTokenV5(address token) view returns (tuple(uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID))",
  "event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)",
];

const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeProvider(url) {
  const req = new ethers.FetchRequest(url);
  req.timeout = 12000;
  return new ethers.JsonRpcProvider(req, 56, { staticNetwork: true });
}

async function withRpc(fn) {
  let last;
  for (const url of RPCS) {
    try {
      const provider = makeProvider(url);
      return await fn(provider, url);
    } catch (e) {
      last = e;
      console.error("RPC fail", url, e.shortMessage || e.message);
    }
  }
  throw last;
}

async function getLogsBatched(provider, fromBlock, toBlock, topic0, step = 50) {
  // Prefer rotating RPCs per chunk; fall back to given provider.
  // 2026-10-25: public RPCs often limit eth_getLogs to ≤50 blocks; add FetchRequest timeout.
  const out = [];
  let rpcIdx = 0;
  let curStep = Math.min(step, 50);
  for (let start = fromBlock; start <= toBlock; ) {
    const end = Math.min(start + curStep - 1, toBlock);
    let ok = false;
    let lastErr;
    for (let attempt = 0; attempt < RPCS.length + 5; attempt++) {
      const url = RPCS[(rpcIdx + attempt) % RPCS.length];
      try {
        const p = makeProvider(url);
        const logs = await Promise.race([
          p.getLogs({
            address: PORTAL,
            fromBlock: start,
            toBlock: end,
            topics: [topic0],
          }),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("HARD_TIMEOUT getLogs")), 10000)
          ),
        ]);
        out.push(...logs);
        rpcIdx = (rpcIdx + attempt) % RPCS.length;
        ok = true;
        if ((start - fromBlock) % 1000 < curStep || start === fromBlock) {
          process.stderr.write(
            `\rlogs ${start - fromBlock}/${toBlock - fromBlock + 1} (+${logs.length}) via ${url.split("//")[1].split("/")[0]}`
          );
          if (typeof process.stderr.flush === "function") process.stderr.flush();
        }
        break;
      } catch (e) {
        lastErr = e;
        const msg = e.shortMessage || e.message || String(e);
        if (/max|too many|limit|range|0 - 50|10000|exceeded/i.test(msg) && curStep > 20) {
          curStep = Math.max(20, Math.floor(curStep / 2));
          break; // retry same start with smaller step
        }
        await sleep(250 + 200 * attempt);
      }
    }
    if (!ok) {
      if (curStep > 20) {
        curStep = Math.max(20, Math.floor(curStep / 2));
        continue;
      }
      throw lastErr || new Error("getLogsBatched failed");
    }
    start = end + 1;
    // keep ≤50: many public RPCs (1rpc) hard-cap at 50
    if (curStep < step) curStep = Math.min(step, curStep + 10);
  }
  process.stderr.write("\n");
  return out;
}

function decodeCreated(iface, log) {
  const parsed = iface.parseLog({ topics: log.topics, data: log.data });
  return {
    ts: Number(parsed.args.ts),
    creator: parsed.args.creator,
    nonce: parsed.args.nonce.toString(),
    token: parsed.args.token,
    name: parsed.args.name,
    symbol: parsed.args.symbol,
    meta: parsed.args.meta,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
}

async function getState(contract, token) {
  try {
    const s = await contract.getTokenV8Safe(token);
    return {
      method: "getTokenV8Safe",
      status: Number(s.status),
      statusName: STATUS[Number(s.status)] || `unknown(${s.status})`,
      reserve: s.reserve.toString(),
      circulatingSupply: s.circulatingSupply.toString(),
      price: s.price.toString(),
      tokenVersion: Number(s.tokenVersion),
      dexSupplyThresh: s.dexSupplyThresh.toString(),
      quoteTokenAddress: s.quoteTokenAddress,
      extensionID: s.extensionID,
      buyTaxRate: Number(s.buyTaxRate),
      sellTaxRate: Number(s.sellTaxRate),
      pool: s.pool,
      progress: s.progress.toString(),
      progressPct: Number(s.progress) / 1e16, // 1e18 = 100% → /1e16 = percent
      lpFeeProfile: Number(s.lpFeeProfile),
      dexId: Number(s.dexId),
    };
  } catch (e1) {
    try {
      const s = await contract.getTokenV5(token);
      return {
        method: "getTokenV5",
        status: Number(s.status),
        statusName: STATUS[Number(s.status)] || `unknown(${s.status})`,
        reserve: s.reserve.toString(),
        circulatingSupply: s.circulatingSupply.toString(),
        price: s.price.toString(),
        tokenVersion: Number(s.tokenVersion),
        dexSupplyThresh: s.dexSupplyThresh.toString(),
        quoteTokenAddress: s.quoteTokenAddress,
        extensionID: s.extensionID,
        progress: null,
        progressPct: null,
        note: "no V8 progress; reserve-only",
      };
    } catch (e2) {
      return {
        method: "error",
        error: (e2.shortMessage || e2.message || String(e2)).slice(0, 200),
      };
    }
  }
}

function classifyAgent(extensionID, extFromTx) {
  const id = (extensionID || ZERO32).toLowerCase();
  const zero = ZERO32.toLowerCase();
  if (extFromTx) {
    return {
      label: "有 TokenExtensionEnabled（扩展已开；是否 ID Agent Curve 未映射确认）",
      agentCurve: "未确认 Agent Curve",
      extensionID: extFromTx.extensionID,
      extensionAddress: extFromTx.extensionAddress,
    };
  }
  if (id && id !== zero) {
    return {
      label: "extensionID 非零（有扩展；是否 ID Agent Curve 未映射确认）",
      agentCurve: "未确认 Agent Curve",
      extensionID: id,
    };
  }
  return {
    label: "无扩展 / extensionID=0（更像普通 Flap 盘）",
    agentCurve: "不像 Agent Curve（无 extension）",
    extensionID: id,
  };
}

async function fetchPipfun() {
  const base = "https://pipfun.xyz";
  const [health, stats, coins] = await Promise.all([
    fetch(`${base}/v1/health`).then((r) => r.json()),
    fetch(`${base}/v1/stats`).then((r) => r.json()),
    fetch(`${base}/v1/coins?sort=new&limit=100`).then((r) => r.json()),
  ]);
  const items = coins.items || coins || [];
  const nonLegacy = items.filter((c) => !c.legacy);
  const near = nonLegacy
    .filter((c) => !c.graduated && (c.progress ?? 0) >= 0.7)
    .map((c) => ({
      name: c.name,
      symbol: c.symbol,
      address: c.address,
      progressPct: ((c.progress ?? 0) * 100).toFixed(2),
      graduated: !!c.graduated,
    }));
  return {
    health,
    stats,
    nonLegacyCount: nonLegacy.length,
    nearGrad: near,
    nonLegacy: nonLegacy.map((c) => ({
      name: c.name,
      symbol: c.symbol,
      address: c.address,
      progressPct: ((c.progress ?? 0) * 100).toFixed(2),
      graduated: !!c.graduated,
      legacy: !!c.legacy,
      mcapUsd: c.mcapUsd,
    })),
  };
}

function shanghai(tsSec) {
  return new Date(tsSec * 1000).toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  }) + " Asia/Shanghai";
}

async function main() {
  const hours = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 3; // argv hours; default 3; blocksPerHour calibrated 2026-10-25
  const iface = new ethers.Interface(portalAbi);

  const blocksPerHour = 8000; // ~0.45s/block
  const span = Math.floor(hours * blocksPerHour);
  let tip, fromBlock, toBlock;
  const metaPath = "/tmp/flap-logs/meta.json";
  if (fs.existsSync(metaPath) && fs.existsSync("/tmp/flap-logs/created.json")) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    tip = meta.tip;
    fromBlock = meta.fromBlock;
    toBlock = meta.toBlock;
    console.error(`META tip=${tip} from=${fromBlock} span=${toBlock - fromBlock} (~${hours}h @ ${blocksPerHour}/h)`);
  } else {
    tip = await withRpc(async (p) => p.getBlockNumber());
    fromBlock = tip - span;
    toBlock = tip;
    console.error(`tip=${tip} from=${fromBlock} span=${span} (~${hours}h @ ${blocksPerHour}/h)`);
  }

  let createdLogs;
  const preload = "/tmp/flap-logs/created.json";
  if (fs.existsSync(preload)) {
    createdLogs = JSON.parse(fs.readFileSync(preload, "utf8")).map((l) => ({
      ...l,
      blockNumber: typeof l.blockNumber === "string" ? parseInt(l.blockNumber, 16) : l.blockNumber,
      transactionHash: l.transactionHash || l.transactionHash,
      topics: l.topics,
      data: l.data,
      address: l.address,
    }));
    console.error("PRELOAD TokenCreated logs:", createdLogs.length, "from", preload);
  } else {
    createdLogs = await withRpc(async (provider, url) => {
      console.error("using", url);
      return getLogsBatched(provider, fromBlock, toBlock, TOPIC_CREATED, 50);
    });
    console.error("TokenCreated logs:", createdLogs.length);
  }

  const tokens = [];
  const seen = new Set();
  for (const log of createdLogs) {
    try {
      const d = decodeCreated(iface, log);
      const key = d.token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(d);
    } catch (e) {
      console.error("decode fail", log.transactionHash, e.message);
    }
  }
  tokens.sort((a, b) => b.blockNumber - a.blockNumber);

  // Enrich with getTokenV8Safe in parallel (skip per-tx receipt; extensionID from V8 is enough)
  const enriched = new Array(tokens.length);
  {
    const CONC = 24;
    let done = 0;
    let cursor = 0;
    async function enrichOne(t, idx) {
      let state = null;
      let lastErr;
      for (let a = 0; a < RPCS.length; a++) {
        try {
          const provider = makeProvider(RPCS[(idx + a) % RPCS.length]);
          const contract = new ethers.Contract(PORTAL, portalAbi, provider);
          state = await Promise.race([
            getState(contract, t.token),
            new Promise((_, rej) => setTimeout(() => rej(new Error("state timeout")), 12000)),
          ]);
          if (state && state.method !== "error") break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!state) {
        state = { method: "error", error: String(lastErr?.message || lastErr || "fail").slice(0, 200) };
      }
      const agent = classifyAgent(state.extensionID, null);
      let progressPct = state.progressPct;
      let progressSource = state.method === "getTokenV8Safe" ? "V8.progress" : null;
      if (progressPct == null && state.reserve) {
        const reserveEth = Number(ethers.formatEther(state.reserve));
        progressPct = (reserveEth / 5) * 100;
        progressSource = "heuristic reserve/5BNB";
      }
      enriched[idx] = {
        ...t,
        createdAtShanghai: shanghai(t.ts),
        state,
        agent,
        progressPct: progressPct != null ? Number(progressPct.toFixed?.(2) ?? progressPct) : null,
        progressSource,
        reserveBNB:
          state.reserve != null
            ? Number(ethers.formatEther(state.reserve)).toFixed(4)
            : null,
      };
      done++;
      if (done % 25 === 0 || done === tokens.length) {
        process.stderr.write(`\rstate ${done}/${tokens.length}`);
      }
    }
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= tokens.length) return;
        await enrichOne(tokens[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, tokens.length) }, () => worker()));
    process.stderr.write("\n");
  }

  const tradable = enriched.filter((x) => x.state.status === 1);
  const dexed = enriched.filter((x) => x.state.status === 4);
  const nearGrad = tradable
    .filter((x) => (x.progressPct ?? 0) >= 70)
    .sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0));
  const midGrad = tradable
    .filter((x) => (x.progressPct ?? 0) >= 40 && (x.progressPct ?? 0) < 70)
    .sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0));

  const withExt = enriched.filter(
    (x) =>
      x.agent.agentCurve === "未确认 Agent Curve" ||
      (x.state.extensionID && x.state.extensionID.toLowerCase() !== ZERO32.toLowerCase())
  );

  let pipfun;
  try {
    pipfun = await fetchPipfun();
  } catch (e) {
    pipfun = { error: e.message };
  }

  const nowSh = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

  const md = [];
  md.push(`# Flap Portal + pipfun 快盘扫描`);
  md.push(``);
  md.push(`- 扫描时间：**${nowSh} Asia/Shanghai**`);
  md.push(`- 声明：非投资建议；未参与；只读链上/公开 API`);
  md.push(`- Flap 数据源：Portal \`${PORTAL}\` · topic0 TokenCreated \`${TOPIC_CREATED}\``);
  md.push(`- 窗口：block **${fromBlock} → ${toBlock}**（tip=${tip}，约 **${hours}h**，按 ~${blocksPerHour} block/h）`);
  md.push(`- 文档：[Index TokenCreated](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/index-token-created-events) · [Inspect A Token](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/inspect-a-token)`);
  md.push(``);
  md.push(`## 摘要`);
  md.push(``);
  md.push(`| 项 | 值 |`);
  md.push(`|----|----|`);
  md.push(`| TokenCreated（去重） | **${enriched.length}** |`);
  md.push(`| Tradable（曲线中） | **${tradable.length}** |`);
  md.push(`| 已 DEX/毕业 | **${dexed.length}** |`);
  md.push(`| 接近毕业（Tradable ∧ progress≥70%） | **${nearGrad.length}** |`);
  md.push(`| 有扩展 / 未确认 Agent Curve | **${withExt.length}**（ID Agent Curve 映射未硬编码，一律标未确认） |`);
  md.push(`| pipfun 非 legacy | **${pipfun.nonLegacyCount ?? "err"}**；接近毕业≥70%：**${pipfun.nearGrad?.length ?? "?"}** |`);
  md.push(``);

  md.push(`## 接近毕业（Flap · Tradable · ≥70%）`);
  md.push(``);
  if (!nearGrad.length) {
    md.push(`（本窗口无）`);
  } else {
    md.push(`| 名/符 | CA | 进度% | reserve BNB | 创建 | Agent 标 | 创建时间(上海) |`);
    md.push(`|-------|----|------|-------------|------|----------|--------------|`);
    for (const x of nearGrad) {
      md.push(
        `| ${x.name} / ${x.symbol} | \`${x.token}\` | **${x.progressPct?.toFixed?.(1) ?? x.progressPct}** (${x.progressSource}) | ${x.reserveBNB} | ${x.state.statusName} | ${x.agent.agentCurve} | ${x.createdAtShanghai} |`
      );
    }
  }
  md.push(``);

  md.push(`## 中段进度（40–70%，可选关注）`);
  md.push(``);
  if (!midGrad.length) md.push(`（本窗口无）`);
  else {
    md.push(`| 名/符 | CA | 进度% | reserve | Agent 标 |`);
    md.push(`|-------|----|------|---------|----------|`);
    for (const x of midGrad.slice(0, 20)) {
      md.push(
        `| ${x.name} / ${x.symbol} | \`${x.token}\` | ${x.progressPct?.toFixed?.(1)} | ${x.reserveBNB} | ${x.agent.agentCurve} |`
      );
    }
  }
  md.push(``);

  md.push(`## 有扩展标记（未确认是否 ID Agent Curve）`);
  md.push(``);
  if (!withExt.length) md.push(`（本窗口无 extension）`);
  else {
    md.push(`| 名/符 | CA | 状态 | 进度% | extensionID |`);
    md.push(`|-------|----|------|------|-------------|`);
    for (const x of withExt.slice(0, 40)) {
      md.push(
        `| ${x.name} / ${x.symbol} | \`${x.token}\` | ${x.state.statusName} | ${x.progressPct?.toFixed?.(1) ?? "—"} | \`${(x.state.extensionID || x.agent.extensionID || "").slice(0, 18)}…\` |`
      );
    }
  }
  md.push(``);

  md.push(`## 本窗口全部新开（按块高倒序）`);
  md.push(``);
  md.push(`| # | 名/符 | CA | 状态 | 进度% | reserveBNB | Agent | 创建(上海) | tx |`);
  md.push(`|---|-------|----|------|------|------------|-------|-----------|-----|`);
  enriched.forEach((x, idx) => {
    md.push(
      `| ${idx + 1} | ${esc(x.name)} / ${esc(x.symbol)} | \`${x.token}\` | ${x.state.statusName || "?"} | ${x.progressPct != null ? Number(x.progressPct).toFixed(1) : "—"} | ${x.reserveBNB ?? "—"} | ${x.agent.agentCurve} | ${x.createdAtShanghai} | \`${x.txHash.slice(0, 10)}…\` |`
    );
  });
  md.push(``);

  md.push(`## pipfun`);
  md.push(``);
  if (pipfun.error) {
    md.push(`错误：${pipfun.error}`);
  } else {
    md.push(`- health: ok=${pipfun.health?.ok} prelaunch=${pipfun.health?.prelaunch} indexedBlock=${pipfun.health?.indexedBlock}`);
    md.push(
      `- stats: coins=${pipfun.stats?.coins} graduated=${pipfun.stats?.graduated} vol24h≈$${Number(pipfun.stats?.volumeUsd24h || 0).toFixed(2)} traders=${pipfun.stats?.traders}`
    );
    md.push(`- 非 legacy 列表：`);
    md.push(``);
    md.push(`| 名/符 | CA | progress% | graduated |`);
    md.push(`|-------|----|-----------|-----------|`);
    for (const c of pipfun.nonLegacy || []) {
      md.push(
        `| ${c.name} / ${c.symbol} | \`${c.address}\` | ${c.progressPct} | ${c.graduated} |`
      );
    }
    if (!pipfun.nearGrad?.length) md.push(`\n接近毕业（≥70%）：无`);
    else {
      md.push(`\n接近毕业：`);
      for (const c of pipfun.nearGrad) {
        md.push(`- ${c.name}/${c.symbol} \`${c.address}\` ${c.progressPct}%`);
      }
    }
  }
  md.push(``);

  md.push(`## 风险 / 缺口`);
  md.push(``);
  md.push(`1. **全量 Flap ≠ ID Agent Curve**：本扫覆盖 Portal 全部 TokenCreated；ID Agent Curve 需 extension 映射或官方名单，当前缺硬编码 ID → 一律标「未确认 Agent Curve」。`);
  md.push(`2. **进度**：优先 \`getTokenV8Safe.progress\`（1e18=100%）；无 V8 时才用 reserve/5BNB 启发式（仅备注）。`);
  md.push(`3. **RPC 分批**：小窗口 eth_getLogs，极端拥堵时可能漏块（本轮 step≈500）。`);
  md.push(`4. **非投资建议**；不买入、不自动交易。`);
  md.push(``);

  md.push(`## 原始 JSON（精简）`);
  md.push(``);
  md.push("```json");
  md.push(
    JSON.stringify(
      {
        scannedAtShanghai: nowSh,
        fromBlock,
        toBlock,
        tip,
        hours,
        createdCount: enriched.length,
        nearGrad: nearGrad.map(slim),
        midGrad: midGrad.map(slim),
        withExt: withExt.map(slim),
        all: enriched.map(slim),
        pipfun,
      },
      null,
      2
    )
  );
  md.push("```");

  function slim(x) {
    return {
      name: x.name,
      symbol: x.symbol,
      token: x.token,
      status: x.state.statusName,
      progressPct: x.progressPct,
      progressSource: x.progressSource,
      reserveBNB: x.reserveBNB,
      agentCurve: x.agent.agentCurve,
      extensionID: x.state.extensionID || x.agent.extensionID,
      createdAtShanghai: x.createdAtShanghai,
      txHash: x.txHash,
      blockNumber: x.blockNumber,
    };
  }
  function esc(s) {
    return String(s || "").replace(/\|/g, "/").replace(/\n/g, " ");
  }

  const day = nowSh.slice(0, 10); // YYYY-MM-DD Asia/Shanghai
  const outPath = `/workspace/nft-check/FLAP-PORTAL-SCAN-${day}.md`;
  fs.writeFileSync(outPath, md.join("\n"));
  console.log("WROTE", outPath);
  console.log(
    JSON.stringify(
      {
        created: enriched.length,
        tradable: tradable.length,
        nearGrad: nearGrad.map((x) => ({
          name: x.name,
          symbol: x.symbol,
          token: x.token,
          progressPct: x.progressPct,
          reserveBNB: x.reserveBNB,
          agent: x.agent.agentCurve,
        })),
        pipfunOneLiner: pipfun.error
          ? `pipfun error: ${pipfun.error}`
          : `pipfun: non-legacy=${pipfun.nonLegacyCount}, nearGrad≥70%=${pipfun.nearGrad.length}, stats.coins=${pipfun.stats?.coins} graduated=${pipfun.stats?.graduated}`,
        withExtCount: withExt.length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
