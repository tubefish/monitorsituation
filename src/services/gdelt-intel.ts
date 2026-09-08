import type { Hotspot, NewsItem } from '@/types';
import { createLazyClient, getRpcBaseUrl } from '@/services/rpc-client';
import { t } from '@/services/i18n';
import type {
  GdeltArticle as ProtoGdeltArticle,
  SearchGdeltDocumentsResponse,
  GdeltTimelinePoint,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { createCircuitBreaker, rssProxyUrl } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';
import { IntelligenceServiceClient } from '@/services/generated-rpc-clients';
import {
  BRIEF_ONLY_RSS_FETCH_POLICY,
  fetchFeed,
} from '@/services/rss';
import { effectivePubDateMs } from '@/services/feed-date';
import { isDesktopRuntime } from '@/services/runtime';

export interface GdeltArticle {
  title: string;
  url: string;
  source: string;
  date: string;
  image?: string;
  language?: string;
  tone?: number;
}

export interface IntelTopic {
  id: string;
  name: string;
  query: string;
  icon: string;
  description: string;
}

export interface TopicIntelligence {
  topic: IntelTopic;
  articles: GdeltArticle[];
  fetchedAt: Date;
}

export interface TopicTimeline {
  tone: GdeltTimelinePoint[];
  vol: GdeltTimelinePoint[];
  fetchedAt: string;
}

export const INTEL_TOPICS: IntelTopic[] = [
  {
    id: 'military',
    name: 'Military Activity',
    query:
      '("military exercise" OR "troop deployment" OR airstrike OR "naval exercise" OR missile OR drone)',
    icon: '⚔️',
    description: 'Military exercises, deployments, and operations',
  },
  {
    id: 'cyber',
    name: 'Cyber Threats',
    query:
      '(cyberattack OR ransomware OR hacking OR "data breach" OR "cyber attack" OR APT)',
    icon: '🔓',
    description: 'Cyber attacks, ransomware, and digital threats',
  },
  {
    id: 'nuclear',
    name: 'Nuclear',
    query:
      '(nuclear OR uranium OR IAEA OR "nuclear weapon" OR plutonium)',
    icon: '☢️',
    description: 'Nuclear programs, IAEA inspections, proliferation',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    query:
      '(espionage OR spy OR "intelligence agency" OR covert OR surveillance)',
    icon: '🕵️',
    description: 'Espionage, intelligence operations, surveillance',
  },
  {
    id: 'maritime',
    name: 'Maritime Security',
    query:
      '("naval blockade" OR piracy OR "strait of hormuz" OR "south china sea" OR warship OR "maritime security")',
    icon: '🚢',
    description: 'Naval operations, maritime chokepoints, sea lanes',
  },
];

export const POSITIVE_GDELT_TOPICS: IntelTopic[] = [
  {
    id: 'science-breakthroughs',
    name: 'Science Breakthroughs',
    query:
      '(breakthrough OR discovery OR "new treatment" OR "clinical trial success") sourcelang:eng',
    icon: '',
    description: 'Scientific discoveries and medical advances',
  },
  {
    id: 'climate-progress',
    name: 'Climate Progress',
    query:
      '(renewable energy record OR "solar installation" OR "wind farm" OR "emissions decline" OR "green hydrogen") sourcelang:eng',
    icon: '',
    description: 'Renewable energy milestones and climate wins',
  },
  {
    id: 'conservation-wins',
    name: 'Conservation Wins',
    query:
      '(species recovery OR "population rebound" OR "conservation success" OR "habitat restored" OR "marine sanctuary") sourcelang:eng',
    icon: '',
    description: 'Wildlife recovery and habitat restoration',
  },
  {
    id: 'humanitarian-progress',
    name: 'Humanitarian Progress',
    query:
      '(poverty decline OR "literacy rate" OR "vaccination campaign" OR "peace agreement" OR "humanitarian aid") sourcelang:eng',
    icon: '',
    description: 'Poverty reduction, education, and peace',
  },
  {
    id: 'innovation',
    name: 'Innovation',
    query:
      '("clean technology" OR "AI healthcare" OR "3D printing" OR "electric vehicle" OR "fusion energy") sourcelang:eng',
    icon: '',
    description: 'Technology for good and clean innovation',
  },
];

export function getIntelTopics(): IntelTopic[] {
  return INTEL_TOPICS.map(topic => ({
    ...topic,
    name: t(`intel.topics.${topic.id}.name`),
    description: t(`intel.topics.${topic.id}.description`),
  }));
}

// ---------------------------------------------------------
// EXISTING WORLDMONITOR RPC CLIENT
// ---------------------------------------------------------
//
// Live Intelligence ARTICLES now come from Google News RSS.
//
// The existing RPC client remains for:
// - GDELT tone / volume timeline
// - the unused Happy-variant positive feed
//

const getClient = createLazyClient(
  () =>
    new IntelligenceServiceClient(getRpcBaseUrl(), {
      fetch: (...args) => globalThis.fetch(...args),
    }),
);

const positiveGdeltBreaker =
  createCircuitBreaker<SearchGdeltDocumentsResponse>({
    name: 'GDELT Positive',
    cacheTtlMs: 10 * 60 * 1000,
    persistCache: true,
  });

const emptyGdeltFallback: SearchGdeltDocumentsResponse = {
  articles: [],
  query: '',
  error: '',
};

const TIMELINE_CACHE_TTL =
  30 * 60 * 1000;

const POSITIVE_CACHE_TTL =
  10 * 60 * 1000;

const timelineCache =
  new Map<
    string,
    {
      data: TopicTimeline;
      timestamp: number;
    }
  >();

const positiveArticleCache =
  new Map<
    string,
    {
      articles: GdeltArticle[];
      timestamp: number;
    }
  >();

// ---------------------------------------------------------
// GDELT TIMELINE
// ---------------------------------------------------------
//
// We KEEP this.
//
// Your Network panel showed these timeline requests returning 200.
// They provide the Tone / Volume summary above the articles.
//

export async function fetchTopicTimeline(
  topicId: string,
): Promise<TopicTimeline | null> {
  const cached =
    timelineCache.get(topicId);

  if (
    cached &&
    Date.now() - cached.timestamp <
      TIMELINE_CACHE_TTL
  ) {
    return cached.data;
  }

  try {
    const resp =
      await getClient().getGdeltTopicTimeline({
        topic: topicId,
      });

    if (
      resp.error ||
      (
        resp.tone.length === 0 &&
        resp.vol.length === 0
      )
    ) {
      return null;
    }

    const data: TopicTimeline = {
      tone: resp.tone,
      vol: resp.vol,
      fetchedAt: resp.fetchedAt,
    };

    timelineCache.set(topicId, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------
// GOOGLE NEWS RSS
// ---------------------------------------------------------

function googleNewsFeedUrl(
  query: string,
): string {
  const feedUrl =
    new URL(
      'https://news.google.com/rss/search',
    );

  feedUrl.searchParams.set(
    'q',
    query,
  );

  feedUrl.searchParams.set(
    'hl',
    'en-US',
  );

  feedUrl.searchParams.set(
    'gl',
    'US',
  );

  feedUrl.searchParams.set(
    'ceid',
    'US:en',
  );

  // This is the same pattern already used by the
  // repo's country-coverage service.
  if (isDesktopRuntime()) {
    return `/api/rss-proxy?${
      new URLSearchParams({
        url: feedUrl.toString(),
      }).toString()
    }`;
  }

  return rssProxyUrl(
    feedUrl.toString(),
  );
}

/**
 * Convert our old "24h / 48h / 72h" style value
 * into Google News' "when:" syntax.
 */
function timespanToGoogleWhen(
  timespan: string,
): string {
  const match =
    timespan
      .trim()
      .match(
        /^(\d+)(h|d|w)$/i,
      );

  if (!match) {
    return '2d';
  }

  const amount =
    Number(match[1]);

  const unit =
    match[2]!.toLowerCase();

  if (unit === 'w') {
    return `${Math.max(
      1,
      amount,
    )}w`;
  }

  if (unit === 'd') {
    return `${Math.max(
      1,
      amount,
    )}d`;
  }

  // Google News RSS behaves more consistently with
  // day windows than very short hour windows.
  return `${Math.max(
    1,
    Math.ceil(
      amount / 24,
    ),
  )}d`;
}

/**
 * Remove old GDELT-specific query syntax before sending
 * the search to Google News.
 */
function buildGoogleNewsQuery(
  query: string,
  timespan: string,
): string {
  const cleaned =
    query
      .replace(
        /\bsourcelang:eng\b/gi,
        '',
      )
      .replace(
        /\bwhen:\S+/gi,
        '',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();

  return `${cleaned} when:${timespanToGoogleWhen(
    timespan,
  )}`;
}

/**
 * Google News RSS titles normally look like:
 *
 * Headline text - Reuters
 *
 * Split that into the headline and publisher.
 */
function splitGoogleNewsPublisher(
  title: string,
): {
  title: string;
  source: string;
} {
  const separator =
    title.lastIndexOf(' - ');

  if (separator === -1) {
    return {
      title:
        title.trim(),
      source:
        'Google News',
    };
  }

  const cleanTitle =
    title
      .slice(
        0,
        separator,
      )
      .trim();

  const source =
    title
      .slice(
        separator + 3,
      )
      .trim();

  return {
    title:
      cleanTitle ||
      title.trim(),

    source:
      source ||
      'Google News',
  };
}

/**
 * GdeltIntelPanel already understands this compact date format,
 * so convert RSS Date objects into it.
 */
function toCompactDate(
  date: Date,
): string {
  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  const year =
    date.getUTCFullYear();

  const month =
    String(
      date.getUTCMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  const day =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      '0',
    );

  const hour =
    String(
      date.getUTCHours(),
    ).padStart(
      2,
      '0',
    );

  const minute =
    String(
      date.getUTCMinutes(),
    ).padStart(
      2,
      '0',
    );

  const second =
    String(
      date.getUTCSeconds(),
    ).padStart(
      2,
      '0',
    );

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function rssItemToArticle(
  item: NewsItem,
): GdeltArticle {
  const normalized =
    splitGoogleNewsPublisher(
      item.title,
    );

  return {
    title:
      normalized.title,

    url:
      item.link,

    source:
      normalized.source,

    date:
      toCompactDate(
        item.pubDate,
      ),

    image:
      item.imageUrl,

    language:
      item.lang || 'en',
  };
}

// ---------------------------------------------------------
// LIVE INTELLIGENCE ARTICLE FETCH
// ---------------------------------------------------------

/**
 * Compatibility note:
 *
 * We KEEP the function name fetchGdeltArticles because other
 * files already import it.
 *
 * It no longer calls GDELT's document API.
 *
 * It now uses:
 *
 * Google News RSS
 *       ↓
 * WorldMonitor /api/rss-proxy
 *       ↓
 * fetchFeed()
 *       ↓
 * existing persistent RSS cache
 */
export async function fetchGdeltArticles(
  query: string,
  maxrecords = 10,
  timespan = '24h',
  signal?: AbortSignal,
): Promise<GdeltArticle[]> {
  const googleQuery =
    buildGoogleNewsQuery(
      query,
      timespan,
    );

  const items =
    await fetchFeed(
      {
        name:
          `$MONITOR Intelligence: ${googleQuery}`,

        url:
          googleNewsFeedUrl(
            googleQuery,
          ),
      },
      {
        policy:
          BRIEF_ONLY_RSS_FETCH_POLICY,
        signal,
        cacheTtlMs: 5 * 60 * 1000,
        throwOnError: true,
      },
    );

  /**
   * fetchFeed currently parses a maximum of five articles
   * from one RSS feed.
   *
   * That's actually a good size for this 2-row panel.
   */
  const limit =
    Math.max(
      1,
      Math.min(
        maxrecords,
        items.length,
      ),
    );

  return [
    ...items,
  ]
    .sort(
      (a, b) =>
        effectivePubDateMs(b) -
        effectivePubDateMs(a),
    )
    .slice(
      0,
      limit,
    )
    .map(
      rssItemToArticle,
    );
}

// ---------------------------------------------------------
// HOTSPOT CONTEXT
// ---------------------------------------------------------

export async function fetchHotspotContext(
  hotspot: Hotspot,
): Promise<GdeltArticle[]> {
  const query =
    hotspot.keywords
      .slice(
        0,
        5,
      )
      .join(
        ' OR ',
      );

  return fetchGdeltArticles(
    query,
    8,
    '48h',
  );
}

// ---------------------------------------------------------
// EXISTING BOOTSTRAP SUPPORT
// ---------------------------------------------------------

let _bootstrapConsumed =
  false;

const _bootstrapData =
  new Map<
    string,
    TopicIntelligence
  >();

function _consumeBootstrap(): void {
  if (_bootstrapConsumed) {
    return;
  }

  _bootstrapConsumed =
    true;

  const raw =
    getHydratedData(
      'gdeltIntel',
    ) as
      | {
          topics?: Array<{
            id: string;
            articles:
              GdeltArticle[];
            fetchedAt?: string;
          }>;
        }
      | undefined;

  if (!raw?.topics) {
    return;
  }

  const now =
    new Date();

  for (
    const entry of raw.topics
  ) {
    const topic =
      INTEL_TOPICS.find(
        candidate =>
          candidate.id ===
          entry.id,
      );

    if (
      !topic ||
      !entry.articles?.length
    ) {
      continue;
    }

    _bootstrapData.set(
      entry.id,
      {
        topic,
        articles:
          entry.articles,
        fetchedAt:
          now,
      },
    );
  }
}

// ---------------------------------------------------------
// TOPIC INTELLIGENCE
// ---------------------------------------------------------

export async function fetchTopicIntelligence(
  topic: IntelTopic,
  signal?: AbortSignal,
): Promise<TopicIntelligence> {
  _consumeBootstrap();

  const bootstrapped =
    _bootstrapData.get(
      topic.id,
    );

  if (bootstrapped) {
    _bootstrapData.delete(
      topic.id,
    );

    return bootstrapped;
  }

  const articles =
    await fetchGdeltArticles(
      topic.query,
      10,
      '24h',
      signal,
    );

  return {
    topic,
    articles,
    fetchedAt:
      new Date(),
  };
}

export async function fetchAllTopicIntelligence():
Promise<TopicIntelligence[]> {
  const results =
    await Promise.allSettled(
      INTEL_TOPICS.map(
        topic =>
          fetchTopicIntelligence(
            topic,
          ),
      ),
    );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<TopicIntelligence> =>
        result.status ===
        'fulfilled',
    )
    .map(
      result =>
        result.value,
    );
}

// ---------------------------------------------------------
// DATE / DOMAIN HELPERS
// ---------------------------------------------------------

export function formatArticleDate(
  dateStr: string,
): string {
  if (!dateStr) {
    return '';
  }

  try {
    const year =
      dateStr.slice(
        0,
        4,
      );

    const month =
      dateStr.slice(
        4,
        6,
      );

    const day =
      dateStr.slice(
        6,
        8,
      );

    const hour =
      dateStr.slice(
        9,
        11,
      );

    const min =
      dateStr.slice(
        11,
        13,
      );

    const sec =
      dateStr.slice(
        13,
        15,
      );

    const date =
      new Date(
        `${year}-${month}-${day}T${hour}:${min}:${sec}Z`,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return '';
    }

    const diff =
      Date.now() -
      date.getTime();

    if (diff < 0) {
      return 'just now';
    }

    if (
      diff <
      60 * 60 * 1000
    ) {
      return `${Math.floor(
        diff / 60000,
      )}m ago`;
    }

    if (
      diff <
      24 * 60 * 60 * 1000
    ) {
      return `${Math.floor(
        diff / 3600000,
      )}h ago`;
    }

    return `${Math.floor(
      diff / 86400000,
    )}d ago`;
  } catch {
    return '';
  }
}

export function extractDomain(
  url: string,
): string {
  try {
    return new URL(
      url,
    )
      .hostname
      .replace(
        'www.',
        '',
      );
  } catch {
    return '';
  }
}

// ---------------------------------------------------------
// HAPPY VARIANT POSITIVE GDELT
// ---------------------------------------------------------
//
// This is unrelated to your $MONITOR Live Intelligence panel,
// so I'm leaving its original RPC behavior intact.
//

function toGdeltArticle(
  article: ProtoGdeltArticle,
): GdeltArticle {
  return {
    title:
      article.title,

    url:
      article.url,

    source:
      article.source,

    date:
      article.date,

    image:
      article.image ||
      undefined,

    language:
      article.language ||
      undefined,

    tone:
      article.tone ||
      undefined,
  };
}

export async function fetchPositiveGdeltArticles(
  query: string,
  toneFilter = 'tone>5',
  sort = 'ToneDesc',
  maxrecords = 15,
  timespan = '72h',
): Promise<GdeltArticle[]> {
  const cacheKey =
    `positive:${query}:${toneFilter}:${sort}:${maxrecords}:${timespan}`;

  const cached =
    positiveArticleCache.get(
      cacheKey,
    );

  if (
    cached &&
    Date.now() -
      cached.timestamp <
      POSITIVE_CACHE_TTL
  ) {
    return cached.articles;
  }

  const resp =
    await positiveGdeltBreaker.execute(
      async () => {
        return getClient()
          .searchGdeltDocuments({
            query,
            maxRecords:
              maxrecords,
            timespan,
            toneFilter,
            sort,
          });
      },
      emptyGdeltFallback,
    );

  if (resp.error) {
    console.warn(
      `[GDELT-Intel] Positive RPC error: ${resp.error}`,
    );

    return (
      cached?.articles ||
      []
    );
  }

  const articles:
    GdeltArticle[] =
    (
      resp.articles ||
      []
    ).map(
      toGdeltArticle,
    );

  positiveArticleCache.set(
    cacheKey,
    {
      articles,
      timestamp:
        Date.now(),
    },
  );

  return articles;
}

export async function fetchPositiveTopicIntelligence(
  topic: IntelTopic,
): Promise<TopicIntelligence> {
  const articles =
    await fetchPositiveGdeltArticles(
      topic.query,
    );

  return {
    topic,
    articles,
    fetchedAt:
      new Date(),
  };
}

export async function fetchAllPositiveTopicIntelligence():
Promise<TopicIntelligence[]> {
  const results =
    await Promise.allSettled(
      POSITIVE_GDELT_TOPICS.map(
        topic =>
          fetchPositiveTopicIntelligence(
            topic,
          ),
      ),
    );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<TopicIntelligence> =>
        result.status ===
        'fulfilled',
    )
    .map(
      result =>
        result.value,
    );
}