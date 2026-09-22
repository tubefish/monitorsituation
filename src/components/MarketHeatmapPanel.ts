import { Panel } from './Panel';
import { getCurrentTheme } from '@/utils/theme-manager';
import '@/styles/market-heatmap.css';

type Market = 'stocks' | 'crypto';
const PREFERENCE_KEY = 'monitor-market-heatmap-tab';
const WIDGETS = {
  stocks: {
    path: 'stock-heatmap',
    title: 'Stock market heatmap',
    link: 'https://www.tradingview.com/heatmap/stock/',
    caption: 'S&P 500 · 1D change · Data may be delayed',
    config: { dataSource: 'SPX500', blockSize: 'market_cap_basic', blockColor: 'change', grouping: 'no_group', exchanges: [] },
  },
  crypto: {
    path: 'crypto-coins-heatmap',
    title: 'Cryptocurrency market heatmap',
    link: 'https://www.tradingview.com/heatmap/crypto/',
    caption: 'Crypto · 24h change · Size = market cap',
    config: { dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: '24h_close_change|5' },
  },
} as const;

/** Provider-hosted heatmaps keep exchange data and logos inside the widget.
 * No credentials, scraper, or additional polling is needed in the dashboard.
 * Configuration follows TradingView's stock/crypto heatmap widget generators.
 */
export class MarketHeatmapPanel extends Panel {
  private market: Market = 'stocks';
  private readonly stage = document.createElement('div');
  private readonly caption = document.createElement('span');
  private readonly sourceLink = document.createElement('a');
  private readonly tabs = new Map<Market, HTMLButtonElement>();
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  constructor() {
    super({ id: 'market-heatmap', title: 'Market Heatmap', className: 'panel-wide market-heatmap-panel', defaultRowSpan: 3 });
    try {
      if (localStorage.getItem(PREFERENCE_KEY) === 'crypto') this.market = 'crypto';
    } catch { /* Use stocks when storage is unavailable. */ }

    const toolbar = document.createElement('div');
    toolbar.className = 'market-heatmap-toolbar';
    const tablist = document.createElement('div');
    tablist.className = 'market-heatmap-tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Heatmap market');
    for (const market of ['stocks', 'crypto'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `market-heatmap-tab-${market}`;
      button.textContent = market === 'stocks' ? 'Stocks' : 'Crypto';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'market-heatmap-view');
      button.addEventListener('click', () => this.selectMarket(market), { signal: this.signal });
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'stocks' : event.key === 'End' ? 'crypto' : market === 'stocks' ? 'crypto' : 'stocks';
        this.selectMarket(next);
        this.tabs.get(next)?.focus();
      }, { signal: this.signal });
      this.tabs.set(market, button);
      tablist.append(button);
    }
    const legend = document.createElement('span');
    legend.className = 'market-heatmap-key';
    const up = document.createElement('span');
    up.className = 'market-heatmap-up';
    up.textContent = '↗ Up';
    const down = document.createElement('span');
    down.className = 'market-heatmap-down';
    down.textContent = '↘ Down';
    legend.append(up, down);
    toolbar.append(tablist, legend);

    this.stage.id = 'market-heatmap-view';
    this.stage.className = 'market-heatmap-stage';
    this.stage.setAttribute('role', 'tabpanel');
    const footer = document.createElement('div');
    footer.className = 'market-heatmap-footer';
    this.sourceLink.target = '_blank';
    this.sourceLink.rel = 'noopener noreferrer';
    this.sourceLink.textContent = 'Heatmap by TradingView ↗';
    footer.append(this.caption, this.sourceLink);
    this.content.replaceChildren(toolbar, this.stage, footer);
    this.updateTabs();

    window.addEventListener('theme-changed', () => {
      if (this.connected) this.renderWidget();
    }, { signal: this.signal });
    this.runWhenConnected(() => {
      this.connected = true;
      this.renderWidget();
    });
  }

  private selectMarket(market: Market): void {
    if (market === this.market) return;
    this.market = market;
    try { localStorage.setItem(PREFERENCE_KEY, market); } catch { /* Optional preference. */ }
    this.updateTabs();
    if (this.connected) this.renderWidget();
  }

  private updateTabs(): void {
    for (const [market, button] of this.tabs) {
      button.setAttribute('aria-selected', String(market === this.market));
      button.tabIndex = market === this.market ? 0 : -1;
    }
    this.stage.setAttribute('aria-labelledby', `market-heatmap-tab-${this.market}`);
    this.caption.textContent = WIDGETS[this.market].caption;
    this.sourceLink.href = WIDGETS[this.market].link;
  }

  private clearLoadTimer(): void {
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = null;
  }

  private renderWidget(): void {
    this.clearLoadTimer();
    const widget = WIDGETS[this.market];
    const frame = document.createElement('iframe');
    frame.title = widget.title;
    frame.className = 'market-heatmap-frame';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    // These are the iframe endpoints produced by the official embed scripts.
    // Only the two fixed provider paths and validated local options are used.
    const config = {
      ...widget.config,
      locale: 'en', colorTheme: getCurrentTheme(), symbolUrl: '',
      hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true,
      hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%',
      utm_source: window.location.hostname, utm_medium: 'widget_new', utm_campaign: widget.path,
    };
    const status = document.createElement('div');
    status.className = 'market-heatmap-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading market heatmap…';
    const unavailable = () => {
      status.textContent = 'Heatmap is taking longer to load. Open it on TradingView below.';
      status.classList.add('market-heatmap-status-delayed');
    };
    frame.addEventListener('load', () => {
      if (!this.stage.contains(frame)) return;
      this.clearLoadTimer();
      status.remove();
    }, { once: true, signal: this.signal });
    frame.addEventListener('error', unavailable, { once: true, signal: this.signal });
    frame.src = `https://www.tradingview-widget.com/embed-widget/${widget.path}/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
    this.stage.replaceChildren(frame, status);
    this.loadTimer = setTimeout(unavailable, 20_000);
  }

  public override destroy(): void {
    this.connected = false;
    this.clearLoadTimer();
    this.stage.replaceChildren();
    super.destroy();
  }
}
