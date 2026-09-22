import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MarketHeatmapPanel } from '@/components/MarketHeatmapPanel';
import { initTestI18n } from './helpers/i18n.mts';

const panels: MarketHeatmapPanel[] = [];
beforeAll(async () => {
  // The real provider is verified in the preview browser; DOM tests stay offline.
  const testWindow = window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } };
  testWindow.happyDOM.settings.disableIframePageLoading = true;
  await initTestI18n();
});
afterEach(() => {
  panels.splice(0).forEach(panel => panel.destroy());
  document.body.replaceChildren();
  localStorage.removeItem('monitor-market-heatmap-tab');
  document.documentElement.dataset.theme = 'light';
});

async function mount(): Promise<MarketHeatmapPanel> {
  const panel = new MarketHeatmapPanel();
  panels.push(panel);
  document.body.append(panel.getElement());
  panel.notifyConnected();
  await vi.waitFor(() => expect(panel.getElement().querySelector('iframe')).not.toBeNull());
  return panel;
}

describe('market heatmap', () => {
  it('switches markets with the keyboard, uses the correct change periods, and remembers the choice', async () => {
    const panel = await mount();
    const el = panel.getElement();
    const stockFrame = el.querySelector('iframe')!;
    const stocks = el.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    expect(stockFrame.title).toBe('Stock market heatmap');
    expect(JSON.parse(decodeURIComponent(new URL(stockFrame.src).hash.slice(1)))).toMatchObject({ blockColor: 'change', grouping: 'no_group' });

    stocks.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const cryptoFrame = el.querySelector('iframe')!;
    expect(cryptoFrame).not.toBe(stockFrame);
    expect(stockFrame.isConnected).toBe(false);
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Crypto');
    expect(document.activeElement?.textContent).toBe('Crypto');
    expect(JSON.parse(decodeURIComponent(new URL(cryptoFrame.src).hash.slice(1)))).toMatchObject({ blockColor: '24h_close_change|5', dataSource: 'Crypto' });
    expect(localStorage.getItem('monitor-market-heatmap-tab')).toBe('crypto');
    panel.destroy();
    const reopened = await mount();
    expect(reopened.getElement().querySelector('iframe')?.title).toBe('Cryptocurrency market heatmap');
  });

  it('preserves the loaded frame during expansion and uses the active theme on theme changes', async () => {
    const panel = await mount();
    const frame = panel.getElement().querySelector('iframe');
    panel.setFullscreen(true);
    expect(panel.getElement().querySelector('iframe')).toBe(frame);
    panel.setFullscreen(false);
    expect(panel.getElement().querySelector('iframe')).toBe(frame);
    document.documentElement.dataset.theme = 'dark';
    window.dispatchEvent(new CustomEvent('theme-changed'));
    const themedFrame = panel.getElement().querySelector('iframe')!;
    expect(themedFrame).not.toBe(frame);
    expect(JSON.parse(decodeURIComponent(new URL(themedFrame.src).hash.slice(1))).colorTheme).toBe('dark');
  });

  it('ignores late load events from the previous market and removes the frame on destruction', async () => {
    const panel = await mount();
    const el = panel.getElement();
    const previous = el.querySelector('iframe')!;
    el.querySelector<HTMLButtonElement>('#market-heatmap-tab-crypto')!.click();
    previous.dispatchEvent(new Event('load'));
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    el.querySelector('iframe')!.dispatchEvent(new Event('load'));
    expect(el.querySelector('[role="status"]')).toBeNull();
    panel.destroy();
    expect(el.querySelector('iframe')).toBeNull();
    window.dispatchEvent(new CustomEvent('theme-changed'));
    expect(el.querySelector('iframe')).toBeNull();
  });
});
