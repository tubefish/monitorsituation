import { getCurrentTheme } from '@/utils/theme-manager';
import '@/styles/market-explorer.css';

const QUICK_MARKETS = [
  { label: 'Stocks', symbol: 'NASDAQ:AAPL' },
  { label: 'Crypto', symbol: 'COINBASE:BTCUSD' },
  { label: 'Gold', symbol: 'OANDA:XAUUSD' },
  { label: 'Oil', symbol: 'TVC:USOIL' },
  { label: 'Forex', symbol: 'FX:EURUSD' },
] as const;

/** TradingView owns symbol search and quotes; no keys or app polling required.
 * Its script and iframe are created only after the user opens Markets. */
export class MarketExplorer {
  private readonly element = document.createElement('section');
  private readonly chart = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly heading = document.createElement('h1');
  private readonly listeners = new AbortController();
  private observer: MutationObserver | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private symbol = 'NASDAQ:AAPL';
  private theme = getCurrentTheme();
  private mounted = false;

  constructor(onBack: () => void) {
    this.element.id = 'marketsView';
    this.element.className = 'market-explorer';
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'marketsTitle');
    const header = document.createElement('div');
    header.className = 'market-explorer-header';
    const intro = document.createElement('div');
    this.heading.id = 'marketsTitle';
    this.heading.textContent = 'Markets';
    this.heading.tabIndex = -1;
    const description = document.createElement('p');
    description.textContent = 'Stocks, crypto, commodities & more.';
    intro.append(this.heading, description);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'market-explorer-back';
    back.textContent = '← Back';
    back.setAttribute('aria-label', 'Back to dashboard');
    back.addEventListener('click', onBack, { signal: this.listeners.signal });
    header.append(intro, back);

    const shortcuts = document.createElement('div');
    shortcuts.className = 'market-explorer-shortcuts';
    shortcuts.setAttribute('role', 'group');
    shortcuts.setAttribute('aria-label', 'Explore markets');
    for (const { label, symbol } of QUICK_MARKETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.symbol = symbol;
        this.renderChart();
      }, { signal: this.listeners.signal });
      shortcuts.append(button);
    }

    const hint = document.createElement('p');
    hint.className = 'market-explorer-hint';
    hint.textContent = 'Tap the symbol or ⌕ in the chart to search by name or ticker.';
    this.chart.className = 'market-explorer-chart tradingview-widget-container';
    this.status.className = 'market-explorer-status';
    this.status.setAttribute('role', 'status');
    const stage = document.createElement('div');
    stage.className = 'market-explorer-stage';
    stage.append(this.chart, this.status);

    const footer = document.createElement('div');
    footer.className = 'market-explorer-footer';
    const note = document.createElement('span');
    note.textContent = 'Some exchange data is delayed.';
    const source = document.createElement('a');
    source.href = 'https://www.tradingview.com/';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Charts by TradingView ↗';
    footer.append(note, source);
    this.element.append(header, shortcuts, hint, stage, footer);
    document.getElementById('main')?.after(this.element);
    window.addEventListener('theme-changed', () => {
      if (!this.element.hidden) this.renderChart();
    }, { signal: this.listeners.signal });
  }

  open(): void {
    const main = document.getElementById('main');
    if (main) main.hidden = true;
    this.element.hidden = false;
    if (!this.mounted || this.theme !== getCurrentTheme()) this.renderChart();
    this.heading.focus({ preventScroll: true });
  }

  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    const main = document.getElementById('main');
    if (main) main.hidden = false;
    window.dispatchEvent(new Event('resize'));
  }

  destroy(): void {
    this.close();
    this.listeners.abort();
    this.clearPending();
    this.element.remove();
  }

  private clearPending(): void {
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.observer?.disconnect();
    this.observer = null;
  }

  private renderChart(): void {
    this.clearPending();
    this.theme = getCurrentTheme();
    this.mounted = true;
    this.status.hidden = false;
    this.status.textContent = 'Loading market search and chart…';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    // Public widget options, not the separately licensed Charting Library API.
    script.textContent = JSON.stringify({
      autosize: true, symbol: this.symbol, interval: 'D', timezone: 'Etc/UTC',
      theme: this.theme, style: '1', locale: 'en', allow_symbol_change: true,
      hide_top_toolbar: false, hide_side_toolbar: true, hide_legend: false,
      save_image: false, calendar: false, details: false, hotlist: false,
      withdateranges: true, support_host: 'https://www.tradingview.com',
    });
    const unavailable = () => {
      if (!this.chart.contains(script)) return;
      this.status.hidden = false;
      const message = document.createElement('span');
      message.textContent = 'Markets could not connect. Try again or open TradingView below.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => this.renderChart(), { once: true, signal: this.listeners.signal });
      this.status.replaceChildren(message, retry);
    };
    script.addEventListener('error', unavailable, { once: true, signal: this.listeners.signal });
    this.observer = new MutationObserver(() => {
      const frame = this.chart.querySelector('iframe');
      if (!frame) return;
      frame.title = 'Search stocks, crypto, commodities and forex';
      this.observer?.disconnect();
      frame.addEventListener('load', () => {
        if (!this.chart.contains(frame)) return;
        this.clearPending();
        this.status.hidden = true;
      }, { once: true, signal: this.listeners.signal });
    });
    this.observer.observe(this.chart, { childList: true, subtree: true });
    this.chart.replaceChildren(widget, script);
    this.loadTimer = setTimeout(unavailable, 20_000);
  }
}
