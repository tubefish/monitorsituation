import { Panel } from './Panel';

const PAIR_URL =
  'https://api.dexscreener.com/latest/dex/pairs/robinhood/0xcfa7bb34e23a7022c3de3e1618e1ff29cde8f16a76c341eca19d16f928968a3d';

const DEXSCREENER_URL =
  'https://dexscreener.com/robinhood/0xcfa7bb34e23a7022c3de3e1618e1ff29cde8f16a76c341eca19d16f928968a3d';

const TOKEN_CA = '0x1a911bb954dAA9CB38513423075bE74450351e18';

type DexPair = {
  priceUsd?: string;
  priceChange?: {
    h1?: number;
    h6?: number;
    h24?: number;
  };
  volume?: {
    h1?: number;
    h6?: number;
    h24?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  liquidity?: {
    usd?: number;
  };
  marketCap?: number;
  fdv?: number;
  dexId?: string;
};

type DexResponse = {
  pairs?: DexPair[];
};

export class MonitorMarketPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'monitor-market',
      title: '$MONITOR LIVE',
      className: 'panel-wide',
      closable: true,
      collapsible: true,
    });

    this.content.innerHTML = `
      <div class="monitor-market-panel">
        <div class="monitor-market-loading">
          Loading $MONITOR market data...
        </div>
      </div>
    `;

    this.runWhenConnected(() => {
      void this.fetchMarketData();

      this.refreshTimer = setInterval(() => {
        void this.fetchMarketData();
      }, 30_000);
    });
  }

  private async fetchMarketData(): Promise<void> {
    try {
      const response = await fetch(PAIR_URL, {
        signal: this.signal,
      });

      if (!response.ok) {
        throw new Error(`Dexscreener returned ${response.status}`);
      }

      const data = (await response.json()) as DexResponse;
      const pair = data.pairs?.[0];

      if (!pair) {
        throw new Error('No market pair returned');
      }

      this.renderMarketData(pair);
    } catch (error) {
      if (this.isAbortError(error)) return;

      console.error('$MONITOR market data failed:', error);

      this.content.innerHTML = `
        <div class="monitor-market-panel">
          <div class="monitor-market-loading">
            Market data temporarily unavailable.
          </div>
        </div>
      `;
    }
  }

  private renderMarketData(pair: DexPair): void {
    const price = Number(pair.priceUsd ?? 0);

    const change1h = pair.priceChange?.h1 ?? 0;
    const change6h = pair.priceChange?.h6 ?? 0;
    const change24h = pair.priceChange?.h24 ?? 0;

    const volume1h = pair.volume?.h1 ?? 0;
    const volume6h = pair.volume?.h6 ?? 0;
    const volume24h = pair.volume?.h24 ?? 0;

    const liquidity = pair.liquidity?.usd ?? 0;
    const marketCap = pair.marketCap ?? 0;
    const fdv = pair.fdv ?? 0;

    const buys = pair.txns?.h24?.buys ?? 0;
    const sells = pair.txns?.h24?.sells ?? 0;

    const totalTrades = buys + sells;
    const buyPercent = totalTrades > 0 ? (buys / totalTrades) * 100 : 50;
    const sellPercent = 100 - buyPercent;

    const positive24h = change24h >= 0;

    this.content.innerHTML = `
      <div class="monitor-market-panel">

        <div class="monitor-market-intro">

          <div class="monitor-market-title">
            $MONITOR, live
          </div>

          <div class="monitor-market-subtitle">
            Pulled directly from Dexscreener. Values refresh every 30 seconds.
          </div>
        </div>

        <div class="monitor-market-top-grid">

          <div class="monitor-market-card">
            <div class="monitor-market-label">PRICE</div>
            <div class="monitor-market-value">
              $${price.toFixed(8)}
            </div>
            <div class="monitor-market-meta">USD</div>
          </div>

          <div class="monitor-market-card">
            <div class="monitor-market-label">24H CHANGE</div>
            <div class="monitor-market-value ${positive24h ? 'positive' : 'negative'}">
              ${positive24h ? '+' : ''}${change24h.toFixed(2)}%
            </div>
          </div>

          <div class="monitor-market-card">
            <div class="monitor-market-label">24H VOLUME</div>
            <div class="monitor-market-value">
              $${this.formatNumber(volume24h)}
            </div>
          </div>

          <div class="monitor-market-card">
            <div class="monitor-market-label">LIQUIDITY</div>
            <div class="monitor-market-value">
              $${this.formatNumber(liquidity)}
            </div>
          </div>

        </div>

        <div class="monitor-market-bottom-grid">

          <div class="monitor-market-card">
            <div class="monitor-market-label">MOMENTUM</div>

            ${this.renderMomentumRow('1H', change1h)}
            ${this.renderMomentumRow('6H', change6h)}
            ${this.renderMomentumRow('24H', change24h)}
          </div>

          <div class="monitor-market-card">
            <div class="monitor-market-label">
              BUY / SELL PRESSURE (24H)
            </div>

            <div class="monitor-pressure-bar">
              <div
                class="monitor-pressure-buy"
                style="width:${buyPercent}%"
              ></div>

              <div
                class="monitor-pressure-sell"
                style="width:${sellPercent}%"
              ></div>
            </div>

            <div class="monitor-pressure-counts">
              <span>${buys.toLocaleString()} buys</span>
              <span>${sells.toLocaleString()} sells</span>
            </div>

            <div class="monitor-market-volume-row">
              <div>
                <div class="monitor-market-label">1H VOL</div>
                <div>$${this.formatNumber(volume1h)}</div>
              </div>

              <div>
                <div class="monitor-market-label">6H VOL</div>
                <div>$${this.formatNumber(volume6h)}</div>
              </div>
            </div>
          </div>

          <div class="monitor-market-card">
            <div class="monitor-market-label">VALUATION</div>

            <div class="monitor-valuation-row">
              <span>Market cap</span>
              <strong>$${this.formatNumber(marketCap)}</strong>
            </div>

            <div class="monitor-valuation-row">
              <span>FDV</span>
              <strong>$${this.formatNumber(fdv)}</strong>
            </div>

            <div class="monitor-valuation-row">
              <span>Venue</span>
              <strong>${pair.dexId?.toUpperCase() ?? 'DEX'}</strong>
            </div>

            <div class="monitor-valuation-row">
              <span>Token</span>
              <strong>${this.shortenAddress(TOKEN_CA)}</strong>
            </div>

            <div class="monitor-market-link-row">
              <a
                href="${DEXSCREENER_URL}"
                target="_blank"
                rel="noopener"
              >
                VIEW CHART ↗
              </a>
            </div>
          </div>

        </div>

      </div>
    `;
  }

  private renderMomentumRow(label: string, value: number): string {
    const positive = value >= 0;
    const width = Math.min(Math.abs(value), 100);

    return `
      <div class="monitor-momentum-row">

        <div class="monitor-momentum-header">
          <span>${label}</span>

          <span class="${positive ? 'positive' : 'negative'}">
            ${positive ? '+' : ''}${value.toFixed(2)}%
          </span>
        </div>

        <div class="monitor-momentum-track">
          <div
            class="monitor-momentum-fill ${positive ? 'positive-bg' : 'negative-bg'}"
            style="width:${width}%"
          ></div>
        </div>

      </div>
    `;
  }

  private formatNumber(value: number): string {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    }

    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }

    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }

    return value.toFixed(2);
  }

  private shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  public override destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    super.destroy();
  }
}