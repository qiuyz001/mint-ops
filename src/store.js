import fs from 'node:fs';
import path from 'node:path';

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'state.json');
    this.eventsFile = path.join(dataDir, 'events.jsonl');
    this.aiFile = path.join(dataDir, 'ai-queue.jsonl');
    this.receiptFile = path.join(dataDir, 'receipts.jsonl');
    this.state = readJson(this.file, { cursors: {}, tokens: {}, projects: {}, seen: {}, reservations: {} });
    for (const key of ['cursors', 'tokens', 'projects', 'seen', 'reservations']) this.state[key] ||= {};
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  hasEvent(id) { return Boolean(this.state.seen[id]); }
  markEvent(id, at = Date.now()) {
    this.state.seen[id] = at;
    const entries = Object.entries(this.state.seen).sort((a, b) => b[1] - a[1]).slice(0, 10000);
    this.state.seen = Object.fromEntries(entries);
  }

  token(address) { return this.state.tokens[String(address).toLowerCase()]; }
  setToken(address, value) { this.state.tokens[String(address).toLowerCase()] = value; }
  project(id) { return this.state.projects[id]; }
  setProject(id, value) { this.state.projects[id] = value; }

  record(type, payload, substantial = false, reason = '') {
    const row = { ts: new Date().toISOString(), type, substantial, reason, ...payload };
    fs.appendFileSync(this.eventsFile, JSON.stringify(row) + '\n');
    return row;
  }

  queueAi(kind, payload) {
    const row = {
      ts: new Date().toISOString(),
      kind,
      status: 'pending',
      summary: payload.summary || kind,
      evidence: payload.evidence || payload,
      confidence: payload.confidence ?? null,
      suggestedAction: payload.suggestedAction || 'review',
      suggestedRulePatch: payload.suggestedRulePatch || null,
    };
    fs.appendFileSync(this.aiFile, JSON.stringify(row) + '\n');
    return row;
  }

  receipt(row) {
    fs.appendFileSync(this.receiptFile, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n');
  }

  summary() {
    return {
      cursors: this.state.cursors,
      trackedTokens: Object.keys(this.state.tokens).length,
      trackedProjects: Object.keys(this.state.projects).length,
      seenEvents: Object.keys(this.state.seen).length,
      reservations: this.state.reservations,
    };
  }
}
