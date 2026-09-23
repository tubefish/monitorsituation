import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { migrateMonitorMarketLayout } from '@/config/monitor-layout-migration';
import { Panel } from '@/components/Panel';
import { clearPanelSpans, clearPanelColSpans, loadPanelSpans, loadPanelColSpans } from '@/utils/panel-storage';
import { initTestI18n } from './helpers/i18n.mts';

beforeAll(initTestI18n);
afterEach(() => { clearPanelSpans(); clearPanelColSpans(); localStorage.clear(); document.body.replaceChildren(); });

describe('market layout update', () => {
  it('adds commodities and lowers the token card once, preserving other customizations', () => {
    localStorage.setItem('panel-order', JSON.stringify(['escalation-correlation', 'market-heatmap', 'monitor-market', 'intel']));
    localStorage.setItem('worldmonitor-panel-spans', JSON.stringify({ 'escalation-correlation': 4, 'monitor-market': 3 }));
    migrateMonitorMarketLayout(localStorage);
    expect(JSON.parse(localStorage.getItem('panel-order')!)).toEqual(['escalation-correlation', 'market-heatmap', 'commodity-watch', 'intel', 'monitor-market']);
    expect(JSON.parse(localStorage.getItem('worldmonitor-panel-spans')!)).toEqual({ 'escalation-correlation': 4, 'monitor-market': 2 });
    localStorage.setItem('panel-order', '["monitor-market","intel"]');
    migrateMonitorMarketLayout(localStorage);
    expect(localStorage.getItem('panel-order')).toBe('["monitor-market","intel"]');
  });

  it('resizes height and width with the mouse, persists them, and restores the declared default height', () => {
    const panel = new Panel({ id: 'size-probe', title: 'Size probe', className: 'panel-wide', defaultRowSpan: 3 });
    const el = panel.getElement();
    document.body.append(el);
    el.querySelector('.panel-resize-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(el.classList.contains('span-4')).toBe(true);
    expect(loadPanelSpans()['size-probe']).toBe(4);
    el.querySelector('.panel-col-resize-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(loadPanelColSpans()['size-probe']).toBe(1);
    panel.resetHeight();
    expect(el.classList.contains('span-3')).toBe(true);
    expect(el.querySelector('.panel-resize-handle')?.getAttribute('aria-valuenow')).toBe('3');
    panel.destroy();
  });
});
