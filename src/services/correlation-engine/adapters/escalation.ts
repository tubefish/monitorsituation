// boundary-ignore: AppContext is an aggregate type that lives in app/ by design
import type { AppContext } from '@/app/app-context';
import type { DomainAdapter, SignalEvidence } from '../types';

import {
  matchCountryNamesInText,
  getCountryAtCoordinates,
  nameToCountryCode,
  getCountryNameByCode,
  iso3ToIso2Code,
} from '@/services/country-geometry';

// $MONITOR escalation scoring.
//
// We keep three signal families:
// 1. conflict / protest activity
// 2. internet disruption
// 3. escalation-related news
//
// The weights still sum to 1.0.
const WEIGHTS: Record<string, number> = {
  conflict_event: 0.40,
  escalation_outage: 0.20,
  news_severity: 0.40,
};

/**
 * Convert a country name / ISO code / coordinates into a standard ISO2 code.
 */
function normalizeToCode(
  country: string | undefined,
  lat?: number,
  lon?: number,
): string | undefined {
  const trimmed = country?.trim();

  if (trimmed) {
    const fromName = nameToCountryCode(trimmed);

    if (fromName) {
      return fromName;
    }

    if (trimmed.length === 3) {
      const fromIso3 = iso3ToIso2Code(trimmed);

      if (fromIso3) {
        return fromIso3;
      }
    }

    if (trimmed.length === 2) {
      return trimmed.toUpperCase();
    }
  }

  if (
    lat != null &&
    lon != null &&
    !(lat === 0 && lon === 0)
  ) {
    const geo = getCountryAtCoordinates(lat, lon);

    if (geo?.code) {
      return geo.code;
    }
  }

  return undefined;
}

/**
 * Terms that indicate a story is meaningfully related to escalation,
 * conflict, military activity, instability or severe disruption.
 *
 * This is intentionally broader than the upstream project's original list,
 * but still requires clearly escalation-related language.
 */
const ESCALATION_KEYWORDS =
  /\b(military|armed|airstrike|air\s+strike|missile|missile\s+strike|bombing|bombardment|shelling|drone\s+strike|drone\s+attack|attack|offensive|invasion|incursion|clash|clashes|fighting|gunfire|war|warfare|ceasefire|coup|coup\s+attempt|martial\s+law|mobilization|mobilisation|deployment|deployed|troop|troops|soldier|soldiers|rebel|rebels|insurgent|insurgency|militia|terrorist|terrorism|hostage|siege|blockade|retaliation|retaliatory|escalation|escalating|escalated|annexation|occupation|evacuation|evacuate|refugee|refugees|humanitarian\s+crisis|nuclear|chemical\s+weapon|biological\s+weapon|border\s+conflict|border\s+clash|state\s+of\s+emergency)\b/i;
/**
 * Build one text string from a news cluster.
 *
 * The original implementation only checked primaryTitle.
 * We also inspect the titles/snippets/location names of articles inside
 * the same cluster, which greatly improves country detection.
 */
function buildClusterSearchText(
  cluster: AppContext['latestClusters'][number],
): string {
  const parts: string[] = [
    cluster.primaryTitle,
  ];

  for (const item of cluster.allItems ?? []) {
    if (item.title) {
      parts.push(item.title);
    }

    if (item.snippet) {
      parts.push(item.snippet);
    }

    if (item.locationName) {
      parts.push(item.locationName);
    }
  }

  return parts.join(' ');
}

/**
 * Try several ways to determine which country a news cluster belongs to.
 */
function getClusterCountry(
  cluster: AppContext['latestClusters'][number],
): string | undefined {
  const searchText = buildClusterSearchText(cluster);

  const matchedCountries =
    matchCountryNamesInText(searchText);

  const firstMatchedCountry =
    matchedCountries[0];

  const fromMatchedName =
    normalizeToCode(
      firstMatchedCountry,
      cluster.lat,
      cluster.lon,
    );

  if (fromMatchedName) {
    return fromMatchedName;
  }

  /**
   * If the text doesn't contain a recognizable country,
   * try the cluster's own coordinates.
   */
  const fromClusterCoords =
    normalizeToCode(
      undefined,
      cluster.lat,
      cluster.lon,
    );

  if (fromClusterCoords) {
    return fromClusterCoords;
  }

  /**
   * Finally try coordinates/location metadata from the individual
   * articles inside the cluster.
   */
  for (const item of cluster.allItems ?? []) {
    const fromItem =
      normalizeToCode(
        item.locationName,
        item.lat,
        item.lon,
      );

    if (fromItem) {
      return fromItem;
    }
  }

  return undefined;
}

export const escalationAdapter: DomainAdapter = {
  domain: 'escalation',
  label: 'Escalation Monitor',

  /**
   * All signals are grouped by country.
   */
  clusterMode: 'country',

  spatialRadius: 0,

  /**
   * Look at the previous 48 hours.
   */
  timeWindow: 48,

  /**
   * Slightly lower than the upstream default so meaningful local
   * correlations are not discarded too aggressively.
   */
  threshold: 18,

  weights: WEIGHTS,

  collectSignals(ctx: AppContext): SignalEvidence[] {
    const signals: SignalEvidence[] = [];

    const now = Date.now();

    const windowMs =
      48 * 60 * 60 * 1000;

    const cache =
      ctx.intelligenceCache;

    /**
     * ---------------------------------------------------------
     * 1. Conflict / protest activity
     * ---------------------------------------------------------
     */
    const protests =
      cache.protests?.events ?? [];

    for (const event of protests) {
      const timestamp =
        event.time?.getTime?.() ?? now;

      const age =
        now - timestamp;

      if (age > windowMs) {
        continue;
      }

      const normalizedCountry =
        normalizeToCode(
          event.country,
          event.lat,
          event.lon,
        );

      if (!normalizedCountry) {
        continue;
      }

      const severityMap:
        Record<string, number> = {
          high: 90,
          medium: 65,
          low: 40,
        };

      const severity =
        severityMap[event.severity] ?? 45;

      signals.push({
        type: 'conflict_event',
        source: 'signal-aggregator',
        severity,
        lat: event.lat,
        lon: event.lon,
        country: normalizedCountry,
        timestamp,
        label:
          `${event.eventType}: ${event.title}`,
        rawData: event,
      });
    }

    /**
     * ---------------------------------------------------------
     * 2. Internet disruptions
     * ---------------------------------------------------------
     *
     * The original code discarded outage signals unless that
     * country ALSO already had a conflict event.
     *
     * We're removing that restriction.
     *
     * A major communications outage can itself be a meaningful
     * escalation signal when paired with news or other outages.
     */
    const outages =
      cache.outages ?? [];

    for (const outage of outages) {
      const timestamp =
        outage.pubDate?.getTime?.() ?? now;

      const age =
        now - timestamp;

      if (age > windowMs) {
        continue;
      }

      /**
       * Ignore the 0,0 placeholder coordinates used by some feeds.
       */
      if (
        outage.lat != null &&
        outage.lon != null &&
        outage.lat === 0 &&
        outage.lon === 0
      ) {
        continue;
      }

      const normalizedCountry =
        normalizeToCode(
          outage.country,
          outage.lat,
          outage.lon,
        );

      if (!normalizedCountry) {
        continue;
      }

      const severityMap:
        Record<string, number> = {
          total: 95,
          major: 75,
          partial: 45,
        };

      const severity =
        severityMap[outage.severity] ?? 40;

      signals.push({
        type: 'escalation_outage',
        source: 'signal-aggregator',
        severity,
        lat: outage.lat,
        lon: outage.lon,
        country: normalizedCountry,
        timestamp,
        label:
          `${outage.severity} outage: ${outage.title}`,
        rawData: outage,
      });
    }

    /**
     * ---------------------------------------------------------
     * 3. Escalation-related news clusters
     * ---------------------------------------------------------
     */
    const clusters =
      ctx.latestClusters ?? [];

    for (const cluster of clusters) {
      /**
       * Ignore items with no useful threat classification.
       *
       * Medium, high and critical are accepted.
       */
      if (
        !cluster.threat ||
        cluster.threat.level === 'info' ||
        cluster.threat.level === 'low'
      ) {
        continue;
      }

      const timestamp =
        cluster.lastUpdated.getTime();

      const age =
        now - timestamp;

      if (age > windowMs) {
        continue;
      }

      const searchText =
        buildClusterSearchText(cluster);

      /**
       * Still require escalation-related language.
       *
       * This prevents ordinary political/economic articles from being
       * treated as military escalation merely because they mention
       * a country.
       */
      if (
        !ESCALATION_KEYWORDS.test(searchText)
      ) {
        continue;
      }

      const normalizedCountry =
        getClusterCountry(cluster);

      if (!normalizedCountry) {
        continue;
      }

      let severity = 50;

      if (
        cluster.threat.level === 'critical'
      ) {
        severity = 95;
      } else if (
        cluster.threat.level === 'high'
      ) {
        severity = 75;
      } else if (
        cluster.threat.level === 'medium'
      ) {
        severity = 55;
      }

      /**
       * Give heavily corroborated stories a modest bump.
       *
       * uniquePublisherCount is safer than raw article count because
       * multiple editions from the same publisher shouldn't be treated
       * as independent confirmation.
       */
      const corroboration =
        cluster.uniquePublisherCount ?? 0;

      if (corroboration >= 4) {
        severity = Math.min(
          100,
          severity + 10,
        );
      } else if (corroboration >= 2) {
        severity = Math.min(
          100,
          severity + 5,
        );
      }

      signals.push({
        type: 'news_severity',
        source: 'analysis-core',
        severity,
        lat: cluster.lat,
        lon: cluster.lon,
        country: normalizedCountry,
        timestamp,
        label:
          cluster.primaryTitle,
        rawData: cluster,
      });
    }

    /**
     * The correlation engine itself handles grouping signals
     * by country and requires at least two signals in a cluster.
     *
     * So unlike the old implementation, we return all legitimate
     * signals here and let the engine determine convergence.
     */
    return signals;
  },

  generateTitle(
    cluster: SignalEvidence[],
  ): string {
    const types =
      new Set(
        cluster.map(signal => signal.type),
      );

    const countries = [
      ...new Set(
        cluster
          .map(signal => signal.country)
          .filter(Boolean),
      ),
    ];

    const code =
      countries[0];

    const countryLabel =
      code
        ? getCountryNameByCode(code) ?? code
        : 'Unknown';

    const parts: string[] = [];

    if (types.has('conflict_event')) {
      parts.push('conflict activity');
    }

    if (types.has('escalation_outage')) {
      parts.push('comms disruption');
    }

    if (types.has('news_severity')) {
      parts.push('news escalation');
    }

    return parts.length > 0
      ? `${parts.join(' + ')} — ${countryLabel}`
      : `Escalation signals — ${countryLabel}`;
  },
};