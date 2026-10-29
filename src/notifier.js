const cleanText = (value) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
  .slice(0, 240);

export class Notifier {
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }

  async event(type, payload, { substantial = false, reason = '' } = {}) {
    const row = this.store.record(type, payload, substantial, reason);
    if (substantial && this.config.silentConsole !== true) {
      const name = cleanText(payload.name || payload.symbol || payload.project || type);
      const address = cleanText(payload.token || payload.address || '');
      console.log(`[变化] ${name} ${address} · ${cleanText(reason)}`);
      if (this.config.webhookUrl) await this.post(this.config.webhookUrl, row);
    }
    return row;
  }

  async anomaly(kind, payload) {
    const row = this.store.queueAi(kind, payload);
    if (this.config.silentConsole !== true) console.log(`[AI异常队列] ${cleanText(kind)} · ${cleanText(row.summary)}`);
    return row;
  }

  async post(url, row) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`webhook HTTP ${response.status}`);
    } catch (error) {
      this.store.queueAi('notification_failed', { summary: '通知 webhook 失败', evidence: { error: error.message, eventType: row.type } });
    }
  }
}
