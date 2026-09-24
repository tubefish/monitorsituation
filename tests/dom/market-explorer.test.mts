import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketExplorer } from '@/components/MarketExplorer';

let explorer: MarketExplorer;
beforeEach(() => {
  const testWindow = window as unknown as { happyDOM: { settings: { disableJavaScriptFileLoading: boolean; disableIframePageLoading: boolean; handleDisabledFileLoadingAsSuccess: boolean } } };
  testWindow.happyDOM.settings.disableJavaScriptFileLoading = true;
  testWindow.happyDOM.settings.disableIframePageLoading = true;
  testWindow.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  document.body.innerHTML = '<main id="main"><button>Dashboard content</button></main>';
  document.documentElement.dataset.theme = 'light';
  explorer = new MarketExplorer(() => explorer.close());
});
afterEach(() => { explorer.destroy(); vi.useRealTimers(); document.body.replaceChildren(); });

describe('Markets destination', () => {
  it('loads only when opened and preserves the chart when returning from the dashboard', () => {
    expect(document.querySelector('script')).toBeNull();
    explorer.open();
    const script = document.querySelector('script')!;
    expect(JSON.parse(script.textContent!)).toMatchObject({ allow_symbol_change: true, hide_top_toolbar: false, autosize: true });
    expect(document.getElementById('main')!.hidden).toBe(true);
    expect(document.activeElement?.textContent).toBe('Markets');
    explorer.close();
    expect(document.getElementById('main')!.hidden).toBe(false);
    explorer.open();
    expect(document.querySelector('script')).toBe(script);
  });

  it('switches to crypto and commodities while keeping a single widget', () => {
    explorer.open();
    for (const [label, symbol] of [['Crypto', 'COINBASE:BTCUSD'], ['Gold', 'OANDA:XAUUSD'], ['Oil', 'TVC:USOIL']]) {
      [...document.querySelectorAll('button')].find(button => button.textContent === label)!.click();
      expect(document.querySelectorAll('script')).toHaveLength(1);
      expect(JSON.parse(document.querySelector('script')!.textContent!).symbol).toBe(symbol);
    }
  });

  it('provides retry on a failed provider load and cleans up on destroy', () => {
    explorer.open();
    const script = document.querySelector('script')!;
    script.dispatchEvent(new Event('error'));
    const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry')!;
    expect(retry).toBeDefined();
    retry.click();
    expect(document.querySelector('script')).not.toBe(script);
    explorer.destroy();
    expect(document.getElementById('marketsView')).toBeNull();
    expect(document.getElementById('main')!.hidden).toBe(false);
  });
});
