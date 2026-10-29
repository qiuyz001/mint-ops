import { buildStrategyCard } from './strategy.js';
import { gangFollowClue } from './watchers/gang.js';

const ZERO32 = `0x${'0'.repeat(64)}`;
const hasExtension = (id) => id && id.toLowerCase() !== ZERO32;

export class Rules {
  constructor({ config, store, notifier }) {
    this.config = config;
    this.store = store;
    this.notifier = notifier;
  }

  async anomalyOnce(key, kind, payload, ttlMs = 6 * 3600_000) {
    const id = `anomaly:${key}`;
    const previous = this.store.state.seen[id] || 0;
    if (Date.now() - previous < ttlMs) return;
    this.store.markEvent(id);
    await this.notifier.anomaly(kind, payload);
  }

  async flap(current, { isNew = false, eventId = null } = {}) {
    const previous = this.store.token(current.token);
    const now = Date.now();
    const fresh = current.blockTime && now / 1000 - current.blockTime <= this.config.strategy.maxNewTokenAgeSec;
    const changes = [];
    if (previous) {
      for (const key of ['status', 'extensionID', 'pool', 'mintOpen', 'paused']) {
        if (current[key] !== undefined && previous[key] !== undefined && current[key] !== previous[key]) changes.push(`${key}: ${previous[key]} → ${current[key]}`);
      }
    }
    const oldProgress = previous?.progressPct ?? 0;
    const newProgress = current.progressPct ?? 0;
    const crossed = this.config.thresholds.filter((x) => oldProgress < x && newProgress >= x);
    if (crossed.length) changes.push(`进度跨过 ${crossed.join('/')}%，当前 ${newProgress.toFixed(2)}%`);
    if (isNew && fresh && hasExtension(current.extensionID)) changes.push('新盘带 extension，需核对 Agent Curve 映射');
    const substantial = changes.length > 0;
    const next = { ...previous, ...current, nextCheckAt: this.nextCheck(current, now), updatedAt: now };
    this.store.setToken(current.token, next);
    const card = isNew ? buildStrategyCard(current, this.config) : null;
    if (card) await this.notifier.event('strategy_card', card, { reason: card.reasons.join('；') });
    await this.notifier.event('flap_state', {
      token: current.token,
      name: current.name || current.symbol,
      status: current.statusName,
      progressPct: current.progressPct,
      extensionID: current.extensionID,
      eventId,
      isHistorical: !fresh,
    }, { substantial, reason: changes.join('；') || '常规状态记录' });
    return { substantial, changes, strategyCard: card };
  }

  async launchpad(current, { eventId = null } = {}) {
    const previous = this.store.token(current.token);
    const fresh = current.blockTime && Date.now() / 1000 - current.blockTime <= this.config.strategy.maxNewTokenAgeSec;
    this.store.setToken(current.token, { ...previous, ...current, updatedAt: Date.now() });
    const card = buildStrategyCard(current, this.config);
    await this.notifier.event('strategy_card', card, { reason: card.reasons.join('；') });
    await this.notifier.event('launchpad_token', {
      token: current.token,
      name: current.name || current.symbol,
      platform: current.platform,
      creator: current.creator,
      quote: current.quote,
      eventId,
      isHistorical: !fresh,
    }, { substantial: fresh && card.eligible, reason: fresh && card.eligible ? '新鲜新盘通过本地模拟条件，未下单' : '只建档或条件不满足' });
    return card;
  }

  async gang(current, { isNew = false, eventId = null, windowSec = 0 } = {}) {
    const previous = this.store.token(current.token);
    const now = Date.now();
    const ageSec = current.blockTime ? Math.max(0, now / 1000 - current.blockTime) : null;
    const allowedAge = Math.max(this.config.strategy.maxNewTokenAgeSec, windowSec || 0);
    const inWindow = ageSec != null && ageSec <= allowedAge;
    const changes = [];
    if (isNew && !previous && inWindow) changes.push('新盘');
    const done = Boolean(current.graduated);
    const newProgress = typeof current.progressPct === 'number' && Number.isFinite(current.progressPct) ? current.progressPct : null;
    const oldProgress = typeof previous?.progressPct === 'number' ? previous.progressPct : null;
    if (newProgress != null && (oldProgress != null || (isNew && !previous && inWindow))) {
      const base = oldProgress ?? 0;
      const crossed = this.config.thresholds.filter((threshold) => base < threshold && newProgress >= threshold);
      if (crossed.length) changes.push(`进度跨过 ${crossed.join('/')}%，当前 ${newProgress.toFixed(2)}%`);
    }
    if (done && previous?.graduated !== true && (previous || current.justGraduated || (isNew && inWindow))) {
      changes.push(current.kind === 'fair' ? '打新启动' : '毕业');
    }
    if (current.bondExists === true && previous?.bondExists !== true && (current.bondJustPosted || (isNew && inWindow) || previous?.bondExists === false)) {
      changes.push('新押金');
    }
    const substantial = changes.length > 0;
    const status = done ? 4 : 1;
    const stored = { ...previous, ...current, status, graduated: done, progressPct: newProgress ?? previous?.progressPct ?? null, updatedAt: now };
    delete stored.justGraduated;
    delete stored.bondJustPosted;
    stored.nextCheckAt = this.nextCheck(stored, now);
    this.store.setToken(current.token, stored);
    const isNewMarket = changes.includes('新盘');
    const clue = gangFollowClue({ ...stored, isNew: isNewMarket });
    if (isNewMarket) {
      const card = buildStrategyCard({ ...stored, seenAt: current.seenAt || now }, this.config);
      await this.notifier.event('strategy_card', card, { reason: card.reasons.join('；') });
    }
    const row = {
      token: stored.token,
      name: stored.name || stored.symbol || null,
      symbol: stored.symbol || null,
      kind: stored.kind || null,
      factory: stored.factory || null,
      quote: stored.quote || null,
      progressPct: stored.progressPct,
      graduated: done,
      bond: stored.bondExists ?? null,
      bondAmountQuote: stored.bondAmountQuote ?? null,
      raisedQuote: stored.raisedQuote ?? null,
      fdvQuote: stored.fdvQuote ?? null,
      source: stored.source || null,
      clue: clue.clue,
      worthFollow: clue.worthFollow,
      reasons: changes,
      eventId,
    };
    await this.notifier.event('gang_state', row, { substantial, reason: changes.join('；') || '常规状态记录' });
    return { substantial, changes, row };
  }

  async known(project, current) {
    const previous = this.store.project(project.id);
    const changes = [];
    if (previous?.values) {
      for (const key of project.watchKeys || []) {
        const before = previous.values[key];
        const after = current.values[key];
        if (before !== undefined && after !== undefined && String(before) !== String(after)) changes.push(`${key}: ${before} → ${after}`);
      }
      const oldProgress = previous.progressPct ?? 0;
      const newProgress = current.progressPct ?? 0;
      for (const threshold of this.config.thresholds) {
        if (oldProgress < threshold && newProgress >= threshold) changes.push(`供应/进度跨过 ${threshold}%（${newProgress.toFixed(2)}%）`);
      }
    }
    if (current.errors.length) {
      await this.anomalyOnce(`known:${project.id}:${current.errors.map((x) => x.key).join(',')}`, 'known_ca_read_failed', {
        summary: `${project.name} 部分链上读取失败`,
        evidence: { project: project.id, address: project.address, errors: current.errors },
        suggestedAction: '核对 ABI、选择器和 RPC；无法闭合前保持只读',
      });
    }
    const next = { ...current, nextCheckAt: this.nextKnownCheck(current, Date.now()) };
    this.store.setProject(project.id, next);
    await this.notifier.event('known_ca_state', {
      project: project.id,
      name: project.name,
      token: project.address,
      progressPct: current.progressPct,
      values: current.values,
      errorCount: current.errors.length,
    }, { substantial: changes.length > 0, reason: changes.join('；') || '基线或无实质变化' });
    return { substantial: changes.length > 0, changes };
  }

  nextCheck(token, now) {
    const interval = token.status === 4 || token.status === 3 ? 86400 : (token.progressPct ?? 0) >= 70 ? this.config.intervals.hotSec : (token.progressPct ?? 0) >= 40 ? this.config.intervals.watchSec : this.config.intervals.coldSec;
    return now + interval * 1000;
  }

  nextKnownCheck(project, now) {
    const interval = (project.progressPct ?? 0) >= 90 ? this.config.intervals.hotSec : (project.progressPct ?? 0) >= 70 ? this.config.intervals.watchSec : this.config.intervals.coldSec;
    return now + interval * 1000;
  }
}
