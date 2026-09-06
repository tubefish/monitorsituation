import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';

interface FearGreedEntry {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update?: string;
}

interface FearGreedResponse {
  name?: string;
  data?: FearGreedEntry[];
  metadata?: {
    error?: string | null;
  };
}

function scoreColor(score: number): string {
  if (score <= 24) return '#c0392b';
  if (score <= 44) return '#e67e22';
  if (score <= 55) return '#f1c40f';
  if (score <= 74) return '#2ecc71';
  return '#27ae60';
}

function getMarketState(score: number): string {
  if (score <= 24) return 'EXTREME FEAR';
  if (score <= 44) return 'FEAR';
  if (score <= 55) return 'NEUTRAL';
  if (score <= 74) return 'GREED';
  return 'EXTREME GREED';
}

function formatDate(timestamp: string): string {
  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function renderGauge(score: number): string {
  const cx = 100;
  const cy = 100;
  const outerRadius = 88;
  const innerRadius = 60;

  function coord(deg: number, radius: number): string {
    const angle = (deg * Math.PI) / 180;

    return `${(
      cx +
      radius * Math.cos(angle)
    ).toFixed(2)},${(
      cy -
      radius * Math.sin(angle)
    ).toFixed(2)}`;
  }

  const zones = [
    { start: 180, end: 144, color: '#c0392b' },
    { start: 144, end: 108, color: '#e67e22' },
    { start: 108, end: 72, color: '#f1c40f' },
    { start: 72, end: 36, color: '#2ecc71' },
    { start: 36, end: 0, color: '#27ae60' },
  ];

  const segments = zones
    .map(
      (zone) => `
        <path
          d="
            M${coord(zone.start, outerRadius)}
            A${outerRadius},${outerRadius} 0 0,0 ${coord(zone.end, outerRadius)}
            L${coord(zone.end, innerRadius)}
            A${innerRadius},${innerRadius} 0 0,1 ${coord(zone.start, innerRadius)}
            Z
          "
          fill="${zone.color}"
          opacity="0.88"
        />
      `,
    )
    .join('');

  const needleAngle = ((180 - score * 1.8) * Math.PI) / 180;
  const needleX = (cx + 75 * Math.cos(needleAngle)).toFixed(1);
  const needleY = (cy - 75 * Math.sin(needleAngle)).toFixed(1);
  const color = '#111111';

  return `
    <svg
      viewBox="0 0 200 110"
      width="220"
      height="121"
      style="display:block;max-width:100%;margin:0 auto"
      aria-hidden="true"
    >
      ${segments}

    <g transform="translate(0,-10)">  
      <line
        x1="${cx}"
        y1="${cy}"
        x2="${needleX}"
        y2="${needleY}"
        stroke="${color}"
        stroke-width="3"
        stroke-linecap="round"
      />

      <circle cx="${cx}" cy="${cy}" r="7" fill="${color}" />
      <circle cx="${cx}" cy="${cy}" r="3" fill="var(--panel-bg, #fff)" />
    </g>  
    </svg>
  `;
}

export class FearGreedPanel extends Panel {
  private data: FearGreedEntry[] = [];

  constructor() {
    super({
      id: 'fear-greed',
      title: t('panels.fearGreed'),
      showCount: false,
      infoTooltip:
        'Crypto Fear & Greed Index. Measures broad crypto market sentiment from extreme fear to extreme greed.',
      defaultRowSpan: 2,
    });
  }

  public async fetchData(): Promise<boolean> {
    this.showLoading();

    try {
      const response = await fetch(
        'https://api.alternative.me/fng/?limit=7&format=json',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Fear & Greed request failed: ${response.status}`);
      }

      const result = (await response.json()) as FearGreedResponse;

      if (!result.data || result.data.length === 0) {
        throw new Error('Fear & Greed data unavailable');
      }

      this.data = result.data;
      this.renderPanel();

      return true;
    } catch (error) {
      console.error('[FearGreedPanel] Failed to load data:', error);

      this.showError(
        'Fear & Greed data temporarily unavailable',
        () => void this.fetchData(),
      );

      return false;
    }
  }

  private renderPanel(): void {
    const current = this.data[0];

    if (!current) {
      this.showError(
        'Fear & Greed data unavailable',
        () => void this.fetchData(),
      );

      return;
    }

    const score = Number(current.value);
    const previous = this.data[1]
      ? Number(this.data[1].value)
      : null;

    const change =
      previous !== null && Number.isFinite(previous)
        ? score - previous
        : null;

    const color = scoreColor(score);
    const state = getMarketState(score);

    const changeText =
      change === null
        ? 'Previous unavailable'
        : `${change >= 0 ? '+' : ''}${change.toFixed(0)} vs yesterday`;

    const changeColor =
      change === null
        ? 'var(--text-dim)'
        : change > 0
          ? '#2ecc71'
          : change < 0
            ? '#e74c3c'
            : 'var(--text-dim)';

    const history = this.data
      .slice(0, 7)
      .reverse()
      .map((entry) => {
        const value = Number(entry.value);
        const barColor = scoreColor(value);

        return `
          <div style="
            flex:1;
            min-width:0;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:4px;
          ">
            <div style="
              font-size:calc(10px * var(--wm-panel-effective-scale, 1));
              font-weight:600;
              color:${barColor};
            ">
              ${value}
            </div>

            <div style="
              width:100%;
              height:48px;
              display:flex;
              align-items:flex-end;
              justify-content:center;
              background:rgba(127,127,127,0.07);
              border-radius:3px;
              overflow:hidden;
            ">
              <div style="
                width:100%;
                height:${Math.max(4, Math.min(100, value))}%;
                background:${barColor};
                opacity:0.8;
              "></div>
            </div>

            <div style="
              font-size:calc(8px * var(--wm-panel-effective-scale, 1));
              color:var(--text-dim);
              white-space:nowrap;
            ">
              ${escapeHtml(formatDate(entry.timestamp))}
            </div>
          </div>
        `;
      })
      .join('');

    const html = `
      <div style="
        padding:12px 14px 14px;
        display:flex;
        flex-direction:column;
        gap:10px;
      ">

        <div style="
          text-align:center;
          font-size:calc(10px * var(--wm-panel-effective-scale, 1));
          letter-spacing:0.12em;
          color:var(--text-dim);
        ">
          CRYPTO MARKET SENTIMENT
        </div>

        <div style="text-align:center">
          ${renderGauge(score)}

          <div style="
            margin-top:-8px;
            font-size:calc(34px * var(--wm-panel-effective-scale, 1));
            line-height:1;
            font-weight:700;
            color:${color};
          ">
            ${score}
          </div>

          <div style="
            margin-top:5px;
            font-size:calc(11px * var(--wm-panel-effective-scale, 1));
            font-weight:700;
            letter-spacing:0.08em;
            color:${color};
          ">
            ${escapeHtml(state)}
          </div>

          <div style="
            margin-top:4px;
            font-size:calc(9px * var(--wm-panel-effective-scale, 1));
            color:${changeColor};
          ">
            ${escapeHtml(changeText)}
          </div>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:7px 9px;
          border:1px solid var(--border);
          border-radius:4px;
          background:rgba(127,127,127,0.04);
        ">
          <div>
            <div style="
              font-size:calc(8px * var(--wm-panel-effective-scale, 1));
              color:var(--text-dim);
              text-transform:uppercase;
              letter-spacing:0.08em;
            ">
              Current Classification
            </div>

            <div style="
              margin-top:2px;
              font-size:calc(11px * var(--wm-panel-effective-scale, 1));
              font-weight:600;
              color:${color};
            ">
              ${escapeHtml(current.value_classification)}
            </div>
          </div>

          <div style="text-align:right">
            <div style="
              font-size:calc(8px * var(--wm-panel-effective-scale, 1));
              color:var(--text-dim);
              text-transform:uppercase;
              letter-spacing:0.08em;
            ">
              Yesterday
            </div>

            <div style="
              margin-top:2px;
              font-size:calc(11px * var(--wm-panel-effective-scale, 1));
              font-weight:600;
              color:var(--text);
            ">
              ${previous ?? '—'}
            </div>
          </div>
        </div>

        <div>
          <div style="
            margin-bottom:6px;
            font-size:calc(9px * var(--wm-panel-effective-scale, 1));
            color:var(--text-dim);
            text-transform:uppercase;
            letter-spacing:0.08em;
          ">
            7 Day Sentiment
          </div>

          <div style="
            display:flex;
            gap:4px;
            align-items:flex-end;
          ">
            ${history}
          </div>
        </div>

        <div style="
          text-align:center;
          font-size:calc(8px * var(--wm-panel-effective-scale, 1));
          color:var(--text-dim);
        ">
          Source: Alternative.me Crypto Fear & Greed Index
        </div>

      </div>
    `;

    this.setSafeContent(
      unsafeRawHtml(
        html,
        'FearGreedPanel crypto sentiment rendering',
      ),
    );
  }
}