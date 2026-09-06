// boundary-ignore: AppContext is an aggregate type that lives in app/ by design
import type { AppContext } from '@/app/app-context';
import type { DomainAdapter, SignalEvidence } from '../types';

/**
 * $MONITOR Economic Warfare
 *
 * Uses data already available in the browser:
 *
 * 1. Significant market / commodity moves
 * 2. Trade, sanctions, tariff and economic-pressure news
 *
 * The correlation engine then groups related signals by entity:
 * oil, gas, gold, trade, tariff, sanctions, semiconductor, etc.
 */

const WEIGHTS: Record<string, number> = {
  market_move: 0.30,
  sanctions_news: 0.40,
  commodity_spike: 0.30,
};

/**
 * Broader than the upstream list, but still focused on genuine
 * economic-pressure / economic-security stories.
 */
const ECONOMIC_WARFARE_KEYWORDS =
  /\b(sanction|sanctions|tariff|tariffs|embargo|trade\s+war|trade\s+restriction|trade\s+restrictions|export\s+ban|export\s+control|export\s+controls|import\s+ban|blacklist|blacklisted|freeze\s+assets|frozen\s+assets|asset\s+freeze|seize|seized|restriction|restrictions|economic\s+pressure|economic\s+warfare|financial\s+weapon|financial\s+warfare|currency\s+manipulation|capital\s+controls|swift|de-?dollar|de-?dollarization|petrodollar|price\s+cap|oil\s+price|crude\s+oil|natural\s+gas|energy\s+security|energy\s+crisis|commodity|commodities|shortage|shortages|stockpile|stockpiling|strategic\s+reserve|strategic\s+reserves|supply\s+chain|supply\s+chains|rare\s+earth|rare\s+earths|chip\s+ban|chip\s+export|semiconductor|semiconductors|opec|quota|quotas|subsidy|subsidies|dumping|countervailing|retaliation|retaliatory|trade\s+retaliation|economic\s+retaliation)\b/i;

/**
 * Market instruments that should be treated as strategic commodity /
 * cross-asset signals.
 */
const COMMODITY_ENTITY_MAP: Record<string, string> = {
  'CL=F': 'oil',
  'BZ=F': 'oil',
  'NG=F': 'gas',
  'GC=F': 'gold',
  'SI=F': 'silver',
  'HG=F': 'copper',
  'ZW=F': 'wheat',
  'KC=F': 'commodity',
  'SB=F': 'commodity',
  'CT=F': 'commodity',
  'CC=F': 'commodity',
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'crypto',
};

/**
 * We use a slightly lower threshold than upstream.
 *
 * The original project required 1.5%.
 * 1.0% works better for a live monitoring dashboard while still
 * filtering ordinary tiny market noise.
 */
const SIGNIFICANT_CHANGE_PCT = 1.0;

/**
 * These correspond closely to the entity keys the existing
 * correlation engine understands.
 *
 * Order matters: compound phrases are checked before single words.
 */
const ENTITY_PATTERNS: Array<{
  key: string;
  pattern: RegExp;
}> = [
  {
    key: 'supply chain',
    pattern: /\bsupply\s+chain\b/i,
  },
  {
    key: 'rare earth',
    pattern: /\brare\s+earths?\b/i,
  },
  {
    key: 'trade war',
    pattern: /\btrade\s+war\b/i,
  },
  {
    key: 'oil price',
    pattern: /\boil\s+price\b/i,
  },
  {
    key: 'gas price',
    pattern: /\bgas\s+price\b/i,
  },
  {
    key: 'sanctions',
    pattern: /\bsanctions?\b/i,
  },
  {
    key: 'tariff',
    pattern: /\btariffs?\b/i,
  },
  {
    key: 'embargo',
    pattern: /\bembargo(?:es)?\b/i,
  },
  {
    key: 'semiconductor',
    pattern: /\bsemiconductors?\b|\bchip\s+(?:ban|export|restriction)/i,
  },
  {
    key: 'oil',
    pattern: /\boil\b|\bcrude\b|\bpetroleum\b|\bopec\b/i,
  },
  {
    key: 'gas',
    pattern: /\bnatural\s+gas\b|\bgas\b|\blng\b/i,
  },
  {
    key: 'gold',
    pattern: /\bgold\b/i,
  },
  {
    key: 'silver',
    pattern: /\bsilver\b/i,
  },
  {
    key: 'copper',
    pattern: /\bcopper\b/i,
  },
  {
    key: 'wheat',
    pattern: /\bwheat\b|\bgrain\b/i,
  },
  {
    key: 'bitcoin',
    pattern: /\bbitcoin\b|\bbtc\b/i,
  },
  {
    key: 'crypto',
    pattern: /\bcrypto\b|\bethereum\b|\beth\b/i,
  },
  {
    key: 'currency',
    pattern:
      /\bcurrency\b|\bforeign\s+exchange\b|\bforex\b|\bcapital\s+controls?\b/i,
  },
  {
    key: 'dollar',
    pattern: /\bdollar\b|\busd\b|\bde-?dollar/i,
  },
  {
    key: 'yuan',
    pattern: /\byuan\b|\brenminbi\b|\bcny\b/i,
  },
  {
    key: 'euro',
    pattern: /\beuro\b|\beur\b/i,
  },
  {
    key: 'energy',
    pattern:
      /\benergy\b|\benergy\s+security\b|\benergy\s+crisis\b/i,
  },
  {
    key: 'trade',
    pattern:
      /\btrade\b|\bexport\b|\bexports\b|\bimport\b|\bimports\b/i,
  },
  {
    key: 'commodity',
    pattern:
      /\bcommodity\b|\bcommodities\b|\bstrategic\s+reserve/i,
  },
];

/**
 * Find the main economic entity discussed in a headline.
 *
 * Returning a recognized entity key is important because the existing
 * correlation engine clusters Economic Warfare signals by these words.
 */
function detectEntityKey(
  text: string,
): string | undefined {
  for (const entry of ENTITY_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.key;
    }
  }

  return undefined;
}

/**
 * Try to infer an entity key from a market instrument.
 */
function getMarketEntity(
  market: {
    symbol: string;
    display?: string;
  },
): string | undefined {
  const mapped =
    COMMODITY_ENTITY_MAP[market.symbol];

  if (mapped) {
    return mapped;
  }

  const searchable =
    `${market.display ?? ''} ${market.symbol}`;

  return detectEntityKey(searchable);
}

/**
 * Calculate market-move severity.
 *
 * 1% is meaningful but modest.
 * 3–5% becomes increasingly significant.
 * Very large moves cap at 100.
 */
function marketMoveSeverity(
  absoluteChange: number,
): number {
  return Math.min(
    100,
    Math.max(
      30,
      absoluteChange * 14,
    ),
  );
}

/**
 * Convert the existing threat classification into a correlation severity.
 */
function newsSeverity(
  level?: string,
): number {
  switch (level) {
    case 'critical':
      return 95;

    case 'high':
      return 78;

    case 'medium':
      return 60;

    default:
      return 48;
  }
}

export const economicAdapter: DomainAdapter = {
  domain: 'economic',
  label: 'Economic Warfare',

  /**
   * The upstream correlation engine understands entity clustering.
   *
   * Examples:
   * oil
   * sanctions
   * tariff
   * semiconductor
   * trade
   */
  clusterMode: 'entity',

  spatialRadius: 0,

  /**
   * Economic signals can unfold over a little longer than breaking
   * military events, so use the previous 36 hours.
   */
  timeWindow: 36,

  /**
   * Slightly easier to trigger than the upstream value of 20.
   *
   * The engine still requires at least two related signals before
   * creating a card, so this does not mean every headline becomes
   * an Economic Warfare event.
   */
  threshold: 18,

  weights: WEIGHTS,

  collectSignals(
    ctx: AppContext,
  ): SignalEvidence[] {
    const signals: SignalEvidence[] = [];

    const now = Date.now();

    const windowMs =
      36 * 60 * 60 * 1000;

    /**
     * ---------------------------------------------------------
     * 1. MARKET / COMMODITY MOVES
     * ---------------------------------------------------------
     */
    const markets =
      ctx.latestMarkets ?? [];

    for (const market of markets) {
      if (
        market.change == null ||
        market.price == null
      ) {
        continue;
      }

      const absoluteChange =
        Math.abs(market.change);

      if (
        absoluteChange <
        SIGNIFICANT_CHANGE_PCT
      ) {
        continue;
      }

      const entity =
        getMarketEntity(market);

      /**
       * Entity clustering drops signals it can't associate with one
       * of its recognized economic topics.
       *
       * So don't add generic market movements that cannot contribute
       * to a meaningful correlation.
       */
      if (!entity) {
        continue;
      }

      const isCommodity =
        Object.prototype.hasOwnProperty.call(
          COMMODITY_ENTITY_MAP,
          market.symbol,
        );

      const type =
        isCommodity
          ? 'commodity_spike'
          : 'market_move';

      const severity =
        marketMoveSeverity(
          absoluteChange,
        );

      const displayName =
        market.display ??
        market.symbol;

      const direction =
        market.change > 0
          ? '+'
          : '';

      /**
       * Put the entity at the beginning of the label.
       *
       * The correlation engine analyzes the label text to determine
       * which signals belong together.
       */
      const label =
        `${entity}: ${displayName} ${direction}${market.change.toFixed(1)}%`;

      signals.push({
        type,
        source: 'markets',
        severity,
        timestamp: now,
        label,
        rawData: market,
      });
    }

    /**
     * ---------------------------------------------------------
     * 2. ECONOMIC-WARFARE NEWS
     * ---------------------------------------------------------
     */
    const clusters =
      ctx.latestClusters ?? [];

    for (const cluster of clusters) {
      const timestamp =
        cluster.lastUpdated.getTime();

      const age =
        now - timestamp;

      if (age > windowMs) {
        continue;
      }

      const title =
        cluster.primaryTitle ?? '';

      if (
        !ECONOMIC_WARFARE_KEYWORDS.test(
          title,
        )
      ) {
        continue;
      }

      const entity =
        detectEntityKey(title);

      if (!entity) {
        continue;
      }

      let severity =
        newsSeverity(
          cluster.threat?.level,
        );

      /**
       * Multiple independent publishers covering the same story
       * makes it a stronger signal.
       */
      const publishers =
        cluster.uniquePublisherCount ?? 0;

      if (publishers >= 4) {
        severity =
          Math.min(
            100,
            severity + 10,
          );
      } else if (
        publishers >= 2
      ) {
        severity =
          Math.min(
            100,
            severity + 5,
          );
      }

      signals.push({
        type: 'sanctions_news',
        source: 'analysis-core',
        severity,
        timestamp,
        label:
          `${entity}: ${title}`,
        rawData: cluster,
      });
    }

    return signals;
  },

  generateTitle(
    cluster: SignalEvidence[],
    context?: {
      entityKey?: string;
      country?: string;
    },
  ): string {
    const types =
      new Set(
        cluster.map(
          signal => signal.type,
        ),
      );

    const entity =
      displayEntity(
        context?.entityKey,
      );

    /**
     * Commodity / market movement + economic-pressure news
     */
    if (
      types.has('commodity_spike')
    ) {
      const spikes =
        cluster.filter(
          signal =>
            signal.type ===
            'commodity_spike',
        );

      const names =
        spikes
          .map(signal => {
            const raw =
              signal.rawData as {
                display?: string;
                symbol?: string;
              };

            return (
              raw?.display ??
              raw?.symbol ??
              signal.label
            );
          })
          .slice(0, 2);

      if (
        types.has(
          'sanctions_news',
        )
      ) {
        return entity
          ? `${entity} pressure + ${names.join('/')}`
          : `${names.join('/')} move + economic pressure`;
      }

      return entity
        ? `${entity} market disruption`
        : `${names.join('/')} market disruption`;
    }

    /**
     * Economic-pressure news + broader market movement
     */
    if (
      types.has('sanctions_news')
    ) {
      if (
        types.has('market_move')
      ) {
        return entity
          ? `${entity} pressure + market disruption`
          : 'Economic pressure + market disruption';
      }

      return entity
        ? `${entity} economic pressure`
        : 'Economic pressure detected';
    }

    /**
     * Multiple market signals correlated to the same entity.
     */
    if (
      types.has('market_move')
    ) {
      return entity
        ? `${entity} market disruption`
        : 'Market disruption detected';
    }

    return entity
      ? `Economic convergence: ${entity}`
      : 'Economic convergence detected';
  },
};

/**
 * Friendly capitalization for entity keys generated by the engine.
 */
function displayEntity(
  key?: string,
): string {
  if (!key) {
    return '';
  }

  const specialNames:
    Record<string, string> = {
      'supply chain': 'Supply Chain',
      'rare earth': 'Rare Earth',
      'trade war': 'Trade War',
      'oil price': 'Oil',
      'gas price': 'Gas',
      oil: 'Oil',
      gas: 'Gas',
      opec: 'OPEC',
      bitcoin: 'Bitcoin',
      crypto: 'Crypto',
      semiconductor: 'Semiconductor',
      sanctions: 'Sanctions',
      tariff: 'Tariff',
      embargo: 'Embargo',
      trade: 'Trade',
      commodity: 'Commodity',
      currency: 'Currency',
      energy: 'Energy',
      wheat: 'Wheat',
      gold: 'Gold',
      silver: 'Silver',
      copper: 'Copper',
      dollar: 'Dollar',
      yuan: 'Yuan',
      euro: 'Euro',
    };

  return (
    specialNames[key] ??
    key.charAt(0).toUpperCase() +
      key.slice(1)
  );
}