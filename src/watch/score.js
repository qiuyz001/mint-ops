/**
 * 确定性打分（0-100）。纯函数，不调模型、不发网络请求。
 * 用来把"值得看的 3 个"从"上千个盘"里挑出来，替 AI 做第一轮筛选。
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function scoreToken(t, prev, cfg, now = Date.now() / 1000) {
  const reasons = [];
  let score = 0;

  // 1) 进度（铸满可能性）
  const p = t.progressPct ?? 0;
  if (p >= 95) { score += 30; reasons.push("接近打满"); }
  else if (p >= 75) { score += 24; reasons.push("75%+"); }
  else if (p >= 50) { score += 18; reasons.push("过半"); }
  else if (p >= 25) { score += 12; reasons.push("25%+"); }
  else if (p > 0) { score += 4; }

  // 2) 进度速度（每分钟百分点）
  let velocity = 0;
  if (prev && prev.progressPct !== null && t.progressPct !== null && prev.at) {
    const mins = Math.max(0.1, (now * 1000 - prev.at) / 60000);
    velocity = (t.progressPct - prev.progressPct) / mins;
    if (velocity >= (cfg.velocityPctPerMin ?? 3)) { score += 25; reasons.push(`速度快 ${velocity.toFixed(1)}%/min`); }
    else if (velocity >= 1) { score += 12; reasons.push(`速度 ${velocity.toFixed(1)}%/min`); }
  }

  // 3) 交易密度
  const trades = t.trades ?? 0;
  if (trades >= 500) { score += 15; reasons.push(`交易 ${trades}`); }
  else if (trades >= 100) { score += 9; reasons.push(`交易 ${trades}`); }
  else if (trades >= 30) score += 4;

  // 4) 新鲜度（新盘优先）
  if (t.createdAt) {
    const ageMin = (now - t.createdAt) / 60;
    if (ageMin <= 10) { score += 15; reasons.push("10 分钟内新盘"); }
    else if (ageMin <= 60) { score += 9; reasons.push(`${Math.round(ageMin)} 分钟新`); }
    else if (ageMin <= 180) score += 4;
  }

  // 5) 目标规模（raise 越大，越可能是"真盘"）
  const target = t.raiseTargetBnb ?? 0;
  if (target >= 20) { score += 6; reasons.push(`目标 ${target} BNB`); }
  else if (target >= 5) score += 3;

  // 6) 已打满（信息价值高，但不是买入信号）
  if (t.graduated) {
    score += 8;
    const fillMin = t.graduatedAt && t.createdAt ? (t.graduatedAt - t.createdAt) / 60 : null;
    reasons.push(fillMin !== null ? `已打满（${fillMin.toFixed(1)} 分钟）` : "已打满");
  }

  // 7) 持有人（如果有）
  if ((t.holders ?? 0) >= 1000) { score += 6; reasons.push(`holders ${t.holders}`); }

  return { score: clamp(Math.round(score), 0, 100), reasons, velocity };
}

/** 批量打分并排序 */
export function rank(tokens, prevTokens, cfg) {
  const now = Date.now() / 1000;
  return tokens
    .map((t) => {
      const prev = prevTokens[t.address];
      const { score, reasons, velocity } = scoreToken(t, prev, cfg, now);
      return { ...t, score, reasons, velocity };
    })
    .sort((a, b) => b.score - a.score);
}
