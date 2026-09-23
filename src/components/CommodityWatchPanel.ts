import { Panel } from './Panel';
import { getCurrentTheme } from '@/utils/theme-manager';
import '@/styles/commodity-watch.css';

// TradingView's public Market Data widget owns quote delivery and attribution.
// https://www.tradingview.com/widget-docs/widgets/watchlists/market-quotes/demos/futures/
const SYMBOL_GROUPS = [
  { name: 'Energy', symbols: [
    { name: 'TVC:USOIL', displayName: 'WTI Crude Oil' },
    { name: 'CMCMARKETS:UKCRUDEOIL', displayName: 'Brent Crude Oil' },
    { name: 'CMCMARKETS:USNATGAS', displayName: 'Natural Gas' },
  ] },
  { name: 'Metals', symbols: [
    { name: 'CMCMARKETS:GOLD', displayName: 'Gold' },
    { name: 'CMCMARKETS:SILVER', displayName: 'Silver' },
    { name: 'CMCMARKETS:COPPER', displayName: 'Copper' },
    { name: 'CMCMARKETS:PLATINUM', displayName: 'Platinum' },
  ] },
  { name: 'Agriculture', symbols: [
    { name: 'BMFBOVESPA:CCM1!', displayName: 'Corn' },
    { name: 'BMFBOVESPA:SJC1!', displayName: 'Soybeans' },
    { name: 'BMFBOVESPA:ICF1!', displayName: 'Coffee' },
  ] },
];

export class CommodityWatchPanel extends Panel {
  private readonly stage = document.createElement('div');
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  constructor() {
    super({ id: 'commodity-watch', title: 'Commodities', className: 'panel-wide commodity-watch-panel', defaultRowSpan: 3 });
    this.stage.className = 'commodity-watch-stage';
    const footer = document.createElement('div');
    footer.className = 'commodity-watch-footer';
    const caption = document.createElement('span');
    caption.textContent = 'Futures & CFDs · Prices may be delayed';
    const link = document.createElement('a');
    link.href = 'https://www.tradingview.com/markets/futures/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Quotes by TradingView ↗';
    footer.append(caption, link);
    this.content.replaceChildren(this.stage, footer);
    window.addEventListener('theme-changed', () => {
      if (this.connected) this.renderWidget();
    }, { signal: this.signal });
    this.runWhenConnected(() => {
      this.connected = true;
      this.renderWidget();
    });
  }

  private renderWidget(): void {
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    const frame = document.createElement('iframe');
    frame.title = 'Commodity prices: energy, metals and agriculture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    const status = document.createElement('div');
    status.className = 'commodity-watch-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading commodity prices…';
    const delayed = () => { status.textContent = 'Prices are taking longer to load. Open TradingView below.'; };
    frame.addEventListener('load', () => {
      if (!this.stage.contains(frame)) return;
      if (this.loadTimer !== null) clearTimeout(this.loadTimer);
      this.loadTimer = null;
      status.remove();
    }, { once: true, signal: this.signal });
    frame.addEventListener('error', delayed, { once: true, signal: this.signal });
    const config = {
      title: 'Commodities', symbolsGroups: SYMBOL_GROUPS,
      colorTheme: getCurrentTheme(), locale: 'en', showSymbolLogo: true,
      isTransparent: false, width: '100%', height: '100%',
      utm_source: window.location.hostname, utm_medium: 'widget_new', utm_campaign: 'market-quotes',
    };
    frame.src = `https://www.tradingview-widget.com/embed-widget/market-quotes/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
    this.stage.replaceChildren(frame, status);
    this.loadTimer = setTimeout(delayed, 20_000);
  }

  override destroy(): void {
    this.connected = false;
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.stage.replaceChildren();
    super.destroy();
  }
}
