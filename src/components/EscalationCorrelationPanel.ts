import { CorrelationPanel } from './CorrelationPanel';
import { t } from '@/services/i18n';
import type { ConvergenceCard } from '@/services/correlation-engine';
import { h } from '@/utils/dom-utils';
import { readableTextColor } from '@/utils/contrast';

const SCORE_COLORS = {
  critical: '#ff4444',
  high: '#ff8800',
  medium: '#ffcc00',
  low: '#6f6f6f',
};

const TREND_ICONS: Record<
  string,
  {
    symbol: string;
    color: string;
    label: string;
  }
> = {
  escalating: {
    symbol: '↑',
    color: '#ff4444',
    label: 'Escalating',
  },
  stable: {
    symbol: '→',
    color: '#888888',
    label: 'Stable',
  },
  'de-escalating': {
    symbol: '↓',
    color: '#44aa44',
    label: 'De-escalating',
  },
};

export class EscalationCorrelationPanel extends CorrelationPanel {
  private expandedCards = new Set<string>();

  constructor() {
    super(
      'escalation-correlation',
      'Escalation Monitor',
      'escalation',
      t('components.escalationCorrelation.infoTooltip'),
    );
  }

  /**
   * Small intelligence-feed label above the cards.
   */
  protected override renderSupplement(): HTMLElement {
    return h(
      'div',
      {
        style: `
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:7px 11px;
          border-bottom:1px solid var(--border);
          background:rgba(127,127,127,0.035);
          font-size:calc(8px * var(--wm-panel-effective-scale, 1));
          letter-spacing:0.09em;
          text-transform:uppercase;
          color:var(--text-dim);
        `,
      },

      h(
        'span',
        {},
        'Live convergence feed',
      ),

      h(
        'span',
        {
          style: `
            opacity:0.65;
            white-space:nowrap;
          `,
        },
        'Scroll for signals ↓',
      ),
    );
  }

  /**
   * Custom $MONITOR / Palantir-inspired escalation card.
   *
   * The shared correlation engine still supplies all of the data.
   * We're only changing how the card is presented.
   */
  protected override buildCard(
    card: ConvergenceCard,
  ): HTMLElement {
    const scoreColor =
      card.score >= 70
        ? SCORE_COLORS.critical
        : card.score >= 50
          ? SCORE_COLORS.high
          : card.score >= 30
            ? SCORE_COLORS.medium
            : SCORE_COLORS.low;

    const trend =
      TREND_ICONS[card.trend] ??
      TREND_ICONS.stable!;

    const expanded =
      this.expandedCards.has(card.id);

    const {
      country,
      eventType,
    } = this.parseCardTitle(card.title);

    const cardEl = h(
      'div',
      {
        className:
          'monitor-escalation-card',
        style: `
          margin:8px 9px;
          border:1px solid var(--border);
          border-left:3px solid ${scoreColor};
          border-radius:4px;
          background:rgba(127,127,127,0.025);
          overflow:hidden;
          transition:
            background 120ms ease,
            border-color 120ms ease;
        `,
      },
    );

    /**
     * ---------------------------------------------------------
     * CARD HEADER
     * ---------------------------------------------------------
     */
    const header = h(
      'div',
      {
        style: `
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto;
          align-items:center;
          gap:9px;
          padding:10px 10px 8px;
          cursor:pointer;
          user-select:none;
        `,
      },

      /**
       * Score
       */
      h(
        'span',
        {
          style: `
            display:flex;
            align-items:center;
            justify-content:center;
            min-width:32px;
            height:24px;
            padding:0 7px;
            border-radius:12px;
            background:${scoreColor};
            color:${readableTextColor(scoreColor)};
            font-size:calc(10px * var(--wm-panel-effective-scale, 1));
            font-weight:700;
            line-height:1;
          `,
        },
        String(card.score),
      ),

      /**
       * Country / event type
       */
      h(
        'div',
        {
          style: `
            min-width:0;
            display:flex;
            flex-direction:column;
            gap:2px;
          `,
        },

        h(
          'div',
          {
            style: `
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
              font-size:calc(12px * var(--wm-panel-effective-scale, 1));
              font-weight:600;
              line-height:1.2;
              color:var(--text);
            `,
          },
          country,
        ),

        h(
          'div',
          {
            style: `
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
              font-size:calc(8px * var(--wm-panel-effective-scale, 1));
              letter-spacing:0.07em;
              text-transform:uppercase;
              color:var(--text-dim);
            `,
          },
          eventType,
        ),
      ),

      /**
       * Signal count + trend
       */
      h(
        'div',
        {
          style: `
            display:flex;
            align-items:center;
            gap:7px;
            white-space:nowrap;
          `,
        },

        h(
          'span',
          {
            style: `
              font-size:calc(8px * var(--wm-panel-effective-scale, 1));
              color:var(--text-dim);
            `,
          },
          `${card.signals.length} ${
            card.signals.length === 1
              ? 'signal'
              : 'signals'
          }`,
        ),

        h(
          'span',
          {
            title: trend.label,
            style: `
              color:${trend.color};
              font-size:calc(13px * var(--wm-panel-effective-scale, 1));
              font-weight:700;
            `,
          },
          trend.symbol,
        ),
      ),
    );

    /**
     * ---------------------------------------------------------
     * SIGNAL PREVIEW
     * ---------------------------------------------------------
     *
     * Always show a couple of signals so the card is immediately useful.
     * Clicking the card reveals the rest.
     */
    const signalLimit =
      expanded
        ? Math.min(
            card.signals.length,
            8,
          )
        : Math.min(
            card.signals.length,
            2,
          );

    const signalRows =
      card.signals
        .slice(0, signalLimit)
        .map((signal, index) =>
          this.buildSignalRow(
            signal.type,
            signal.label,
            index,
          ),
        );

    const signalsContainer = h(
      'div',
      {
        style: `
          margin:0 10px;
          border-top:1px solid var(--border);
        `,
      },
      ...signalRows,
    );

    /**
     * ---------------------------------------------------------
     * MORE / LESS ROW
     * ---------------------------------------------------------
     */
    let expandRow:
      | HTMLElement
      | null = null;

    if (card.signals.length > 2) {
      const hiddenCount =
        card.signals.length - 2;

      expandRow = h(
        'div',
        {
          style: `
            display:flex;
            justify-content:flex-end;
            padding:5px 10px 7px;
            font-size:calc(8px * var(--wm-panel-effective-scale, 1));
            color:var(--text-dim);
            cursor:pointer;
          `,
        },
        expanded
          ? 'Show less ↑'
          : `+${hiddenCount} more ↓`,
      );
    }

    /**
     * ---------------------------------------------------------
     * ASSESSMENT
     * ---------------------------------------------------------
     */
    let assessment:
      | HTMLElement
      | null = null;

    if (
      expanded &&
      card.assessment
    ) {
      assessment = h(
        'div',
        {
          style: `
            margin:2px 10px 9px;
            padding:8px 9px;
            border-left:2px solid ${scoreColor};
            background:rgba(127,127,127,0.05);
            font-size:calc(9px * var(--wm-panel-effective-scale, 1));
            line-height:1.45;
            color:var(--text);
          `,
        },
        card.assessment,
      );
    }

    /**
     * ---------------------------------------------------------
     * VIEW ON MAP
     * ---------------------------------------------------------
     */
    let mapRow:
      | HTMLElement
      | null = null;

    if (
      expanded &&
      card.location
    ) {
      const mapButton = h(
        'button',
        {
          style: `
            padding:4px 8px;
            border:1px solid var(--border);
            border-radius:3px;
            background:transparent;
            color:var(--text);
            cursor:pointer;
            font-family:inherit;
            font-size:calc(8px * var(--wm-panel-effective-scale, 1));
            letter-spacing:0.04em;
            text-transform:uppercase;
          `,
        },
        'View on map →',
      );

      mapButton.addEventListener(
        'click',
        event => {
          event.stopPropagation();

          this.navigateToMap(
            card.location!.lat,
            card.location!.lon,
          );
        },
      );

      mapRow = h(
        'div',
        {
          style: `
            display:flex;
            justify-content:flex-end;
            padding:0 10px 9px;
          `,
        },
        mapButton,
      );
    }

    /**
     * ---------------------------------------------------------
     * CLICK BEHAVIOR
     * ---------------------------------------------------------
     */
    const toggleCard = () => {
      if (
        this.expandedCards.has(
          card.id,
        )
      ) {
        this.expandedCards.delete(
          card.id,
        );
      } else {
        this.expandedCards.add(
          card.id,
        );
      }

      this.requestRender();
    };

    header.addEventListener(
      'click',
      toggleCard,
    );

    expandRow?.addEventListener(
      'click',
      toggleCard,
    );

    cardEl.appendChild(header);
    cardEl.appendChild(
      signalsContainer,
    );

    if (expandRow) {
      cardEl.appendChild(
        expandRow,
      );
    }

    if (assessment) {
      cardEl.appendChild(
        assessment,
      );
    }

    if (mapRow) {
      cardEl.appendChild(
        mapRow,
      );
    }

    return cardEl;
  }

  /**
   * Individual intelligence-feed line.
   */
  private buildSignalRow(
    type: string,
    label: string,
    index: number,
  ): HTMLElement {
    const cleanType =
      this.formatSignalType(type);

    return h(
      'div',
      {
        style: `
          display:grid;
          grid-template-columns:5px minmax(0,1fr);
          gap:8px;
          align-items:start;
          padding:7px 1px;
          ${
            index > 0
              ? 'border-top:1px solid rgba(127,127,127,0.10);'
              : ''
          }
        `,
      },

      /**
       * Tiny Palantir-style signal indicator
       */
      h(
        'span',
        {
          style: `
            width:4px;
            height:4px;
            margin-top:5px;
            border-radius:50%;
            background:var(--text-dim);
            opacity:0.55;
          `,
        },
      ),

      h(
        'div',
        {
          style: `
            min-width:0;
          `,
        },

        h(
          'div',
          {
            style: `
              margin-bottom:2px;
              font-size:calc(7px * var(--wm-panel-effective-scale, 1));
              letter-spacing:0.07em;
              text-transform:uppercase;
              color:var(--text-dim);
            `,
          },
          cleanType,
        ),

        h(
          'div',
          {
            style: `
              font-size:calc(9px * var(--wm-panel-effective-scale, 1));
              line-height:1.35;
              color:var(--text);
              overflow-wrap:anywhere;
            `,
          },
          label,
        ),
      ),
    );
  }

  /**
   * Turns:
   *
   * news escalation — Ukraine
   *
   * into:
   *
   * Ukraine
   * NEWS ESCALATION
   */
  private parseCardTitle(
    title: string,
  ): {
    country: string;
    eventType: string;
  } {
    const parts =
      title
        .split('—')
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) {
      return {
        country:
          parts[
            parts.length - 1
          ]!,
        eventType:
          parts
            .slice(
              0,
              parts.length - 1,
            )
            .join(' — '),
      };
    }

    return {
      country: title,
      eventType:
        'Escalation convergence',
    };
  }

  private formatSignalType(
    type: string,
  ): string {
    switch (type) {
      case 'news_severity':
        return 'News signal';

      case 'conflict_event':
        return 'Conflict activity';

      case 'escalation_outage':
        return 'Communications disruption';

      default:
        return type
          .replace(/_/g, ' ');
    }
  }
}