import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDashboardLayoutEditor } from '@/app/dashboard-layout-editor';
import { organizeMapLayerControls } from '@/components/map-layer-drawer';
import { cleanDashboardUrl } from '@/utils/dashboard-url';
import { loadPanelSpans, savePanelSpan, invalidatePanelStorageCacheForKeys, PANEL_SPANS_KEY, PANEL_COL_SPANS_KEY } from '@/utils/panel-storage';
import { initTestI18n } from './helpers/i18n.mts';

const cleanup: Array<() => void> = [];
beforeAll(initTestI18n);
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  document.body.replaceChildren();
  localStorage.clear();
  invalidatePanelStorageCacheForKeys([PANEL_SPANS_KEY, PANEL_COL_SPANS_KEY]);
});

describe('organized dashboard', () => {
  it('restores panel order, dimensions, and stored preferences after a reset', () => {
    document.body.innerHTML = '<div class="header"><button id="customizeLayoutBtn">Customize</button></div><main class="main-content"><div id="panelsGrid"><section class="panel span-4" data-panel="news"></section><section class="panel span-2" data-panel="markets"></section></div><div id="mapBottomGrid"></div></main>';
    savePanelSpan('news', 4);
    const persistOrder = vi.fn(() => true);
    cleanup.push(installDashboardLayoutEditor({ defaultOrder: ['markets', 'news'], defaultRows: { news: { rowSpan: 2 } }, persistOrder, refreshPanels: vi.fn() }));
    document.getElementById('customizeLayoutBtn')!.click();
    expect(document.documentElement.classList.contains('monitor-layout-editing')).toBe(true);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.monitor-layout-toolbar button')];
    buttons.find(button => button.textContent === 'Reset layout')!.click();
    expect(document.querySelector('#panelsGrid > :first-child')?.getAttribute('data-panel')).toBe('markets');
    expect(loadPanelSpans().news).toBeUndefined();
    buttons.find(button => button.textContent === 'Undo changes')!.click();
    expect(document.querySelector('#panelsGrid > :first-child')?.getAttribute('data-panel')).toBe('news');
    expect(document.querySelector('[data-panel="news"]')?.classList.contains('span-4')).toBe(true);
    expect(loadPanelSpans().news).toBe(4);
    buttons.find(button => button.textContent === 'Done')!.click();
    expect(document.documentElement.classList.contains('monitor-layout-editing')).toBe(false);
    expect(persistOrder).toHaveBeenCalled();
  });

  it('groups existing map controls without replacing their listeners and supports Escape', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="layer-toggle-row" data-layer="conflicts"><button class="layer-toggle active">Conflicts</button></div><div class="layer-toggle-row" data-layer="weather"><button class="layer-toggle">Weather</button></div>';
    document.body.append(root);
    const weather = root.querySelectorAll<HTMLButtonElement>('button')[1]!;
    weather.addEventListener('click', () => weather.classList.toggle('active'));
    cleanup.push(organizeMapLayerControls(root));
    expect(root.querySelectorAll('.monitor-layer-group').length).toBe(2);
    expect(root.querySelector('.monitor-layer-count')?.textContent).toBe('1 active');
    weather.click();
    await vi.waitFor(() => expect(root.querySelector('.monitor-layer-count')?.textContent).toBe('2 active'));
    expect(weather.getAttribute('aria-pressed')).toBe('true');
    const details = root.querySelector('details')!;
    details.open = true;
    weather.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('summary'));
  });

  it('keeps normal links clean while preserving useful deep links and campaign parameters', () => {
    const current = 'https://www.monitorsituation.xyz/?lat=8&lon=0&zoom=1&layers=conflicts&utm_source=x#main';
    expect(cleanDashboardUrl(current, 'https://www.monitorsituation.xyz/?lat=20&lon=30&zoom=4&layers=weather')).toBe('https://www.monitorsituation.xyz/?utm_source=x#main');
    const country = new URL(cleanDashboardUrl(current, 'https://www.monitorsituation.xyz/?country=IR&expanded=1'));
    expect(country.searchParams.get('country')).toBe('IR');
    expect(country.searchParams.get('expanded')).toBe('1');
    expect(country.searchParams.get('utm_source')).toBe('x');
    const closed = new URL(cleanDashboardUrl(country.toString(), 'https://www.monitorsituation.xyz/?view=global'));
    expect(closed.searchParams.has('country')).toBe(false);
  });
});
