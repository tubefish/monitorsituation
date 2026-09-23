/** Apply the requested market layout once; later personal edits stay intact. */
export function migrateMonitorMarketLayout(storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  const marker = 'monitor-commodities-compact-token-v1';
  try {
    if (storage.getItem(marker) === 'done') return;
    const raw: unknown = JSON.parse(storage.getItem('panel-order') || 'null');
    if (Array.isArray(raw) && raw.every(id => typeof id === 'string')) {
      const order = raw.filter(id => id !== 'monitor-market');
      if (!order.includes('commodity-watch')) {
        const heatmap = order.indexOf('market-heatmap');
        order.splice(heatmap < 0 ? 0 : heatmap + 1, 0, 'commodity-watch');
      }
      if (raw.includes('monitor-market')) order.push('monitor-market');
      storage.setItem('panel-order', JSON.stringify(order));
    }
    for (const [key, value] of [['worldmonitor-panel-spans', 2], ['worldmonitor-panel-col-spans', 1]] as const) {
      const saved: unknown = JSON.parse(storage.getItem(key) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        storage.setItem(key, JSON.stringify({ ...saved, 'monitor-market': value }));
      }
    }
    storage.setItem(marker, 'done');
  } catch { /* Defaults still work when browser storage is unavailable. */ }
}
