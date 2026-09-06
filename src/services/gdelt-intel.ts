import type { Hotspot } from '@/types';
import { createLazyClient, getRpcBaseUrl } from '@/services/rpc-client';
import { t } from '@/services/i18n';
import type {
  GdeltArticle as ProtoGdeltArticle,
  SearchGdeltDocumentsResponse,
  GdeltTimelinePoint,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';
import { IntelligenceServiceClient } from '@/services/generated-rpc-clients';

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

/**
 * $MONITOR Live Intelligence topics.
 *
 * Sanctions intentionally removed so the desktop tab bar fits cleanly.
 */
export const INTEL_TOPICS: IntelTopic[] = [
  {
    id: 'military',
    name: 'Military Activity',
    query:
      '(military exercise OR troop deployment OR airstrike OR "naval exercise") sourcelang:eng',
    icon: '⚔️',
    description: 'Military exercises, deployments, and operations',
  },
  {
    id: 'cyber',
    name: 'Cyber Threats',
    query:
      '(cyberattack OR ransomware OR hacking OR "data breach" OR APT) sourcelang:eng',
    icon: '🔓',
    description: 'Cyber attacks, ransomware, and digital threats',
  },
  {
    id: 'nuclear',
    name: 'Nuclear',
    query:
      '(nuclear OR uranium enrichment OR IAEA OR "nuclear weapon" OR plutonium) sourcelang:eng',
    icon: '☢️',
    description: 'Nuclear programs, IAEA inspections, proliferation',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    query:
      '(espionage OR spy OR "intelligence agency" OR covert OR surveillance) sourcelang:eng',
    icon: '🕵️',
    description: 'Espionage, intelligence operations, surveillance',
  },
  {
    id: 'maritime',
    name: 'Maritime Security',
    query:
      '(naval blockade OR piracy OR "strait of hormuz" OR "south china sea" OR warship) sourcelang:eng',
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

// ---- Existing World Monitor RPC client ----
//
// We still keep this because the timeline and positive-GDELT functions below
// use the original backend when it is available.

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

// Normal Live Intelligence article results stay fresh for 15 minutes.
// If GDELT is temporarily unavailable, we can serve a successful result
// for up to one hour.
const CACHE_TTL = 15 * 60 * 1000;
const STALE_MAX = 60 * 60 * 1000;

const articleCache = new Map<
  string,
  {
    articles: GdeltArticle[];
    timestamp: number;
  }
>();

const timelineCache = new Map<
  string,
  {
    data: TopicTimeline;
    timestamp: number;
  }
>();

export async function fetchTopicTimeline(
  topicId: string,
): Promise<TopicTimeline | null> {
  const cached = timelineCache.get(topicId);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const resp = await getClient().getGdeltTopicTimeline({
      topic: topicId,
    });

    if (
      resp.error ||
      (resp.tone.length === 0 && resp.vol.length === 0)
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

/**
 * Map the original World Monitor protobuf GDELT response into the
 * GdeltArticle format used by the frontend.
 *
 * Still used by the positive-news functions at the bottom of this file.
 */
function toGdeltArticle(
  article: ProtoGdeltArticle,
): GdeltArticle {
  return {
    title: article.title,
    url: article.url,
    source: article.source,
    date: article.date,
    image: article.image || undefined,
    language: article.language || undefined,
    tone: article.tone || undefined,
  };
}

/**
 * Convert a normal date into the compact GDELT format expected by
 * formatArticleDate().
 */
function normalizeGdeltDate(value: string): string {
  if (!value) {
    return '';
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

/**
 * Build the correct request URL.
 *
 * LOCAL DEVELOPMENT:
 * Vite already proxies /api/gdelt to api.gdeltproject.org.
 *
 * PRODUCTION:
 * Use the /api/gdelt-proxy endpoint we created so browsers never need
 * to contact GDELT directly.
 */
function buildGdeltRequestUrl(
  params: URLSearchParams,
): string {
  const isLocal =
    typeof window !== 'undefined' &&
    (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );

  if (isLocal) {
    return `/api/gdelt/api/v2/doc/doc?${params.toString()}`;
  }

  return `/api/gdelt-proxy?${params.toString()}`;
}

/**
 * Small delay helper used only when GDELT returns HTTP 429.
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * Main $MONITOR Live Intelligence article fetch.
 *
 * This no longer depends on World Monitor's seeded intelligence backend.
 * It requests live GDELT articles through a proxy.
 */
export async function fetchGdeltArticles(
  query: string,
  maxrecords = 10,
  timespan = '24h',
): Promise<GdeltArticle[]> {
  const cacheKey =
    `${query}:${maxrecords}:${timespan}`;

  const cached = articleCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp < CACHE_TTL
  ) {
    return cached.articles;
  }

  try {
    const params = new URLSearchParams({
      query,
      mode: 'ArtList',
      maxrecords: String(maxrecords),
      format: 'json',
      timespan,
      sort: 'HybridRel',
    });

    const url = buildGdeltRequestUrl(params);

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    /**
     * GDELT occasionally rate-limits requests.
     *
     * Wait five seconds and retry once.
     * We deliberately do NOT loop repeatedly because that can make
     * rate limiting worse.
     */
    if (response.status === 429) {
      console.warn(
        '[GDELT-Intel] Rate limited by GDELT. Retrying once in 5 seconds...',
      );

      await wait(5000);

      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    }

    if (!response.ok) {
      throw new Error(
        `GDELT request failed: ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      articles?: Array<{
        title?: string;
        url?: string;
        domain?: string;
        seendate?: string;
        socialimage?: string;
        language?: string;
        tone?: number | string;
      }>;
    };

    const articles: GdeltArticle[] =
      (data.articles ?? [])
        .filter(article => {
          return Boolean(article.title && article.url);
        })
        .map(article => {
          let tone: number | undefined;

          if (
            article.tone !== undefined &&
            article.tone !== ''
          ) {
            const parsedTone = Number(article.tone);

            if (Number.isFinite(parsedTone)) {
              tone = parsedTone;
            }
          }

          return {
            title: article.title ?? '',
            url: article.url ?? '',
            source: article.domain ?? '',
            date: normalizeGdeltDate(
              article.seendate ?? '',
            ),
            image:
              article.socialimage || undefined,
            language:
              article.language || undefined,
            tone,
          };
        });

    articleCache.set(cacheKey, {
      articles,
      timestamp: Date.now(),
    });

    return articles;
  } catch (error) {
    console.error(
      '[GDELT-Intel] GDELT article request failed:',
      error,
    );

    /**
     * If we previously loaded this topic successfully and that cached
     * result is less than one hour old, show it instead of leaving the
     * panel blank.
     */
    if (
      cached &&
      Date.now() - cached.timestamp < STALE_MAX
    ) {
      console.warn(
        '[GDELT-Intel] Serving stale cached articles after request failure.',
      );

      return cached.articles;
    }

    return [];
  }
}

export async function fetchHotspotContext(
  hotspot: Hotspot,
): Promise<GdeltArticle[]> {
  const query = hotspot.keywords
    .slice(0, 5)
    .join(' OR ');

  return fetchGdeltArticles(
    query,
    8,
    '48h',
  );
}

// ---- Existing bootstrapped intelligence data ----

let _bootstrapConsumed = false;

const _bootstrapData =
  new Map<string, TopicIntelligence>();

function _consumeBootstrap(): void {
  if (_bootstrapConsumed) {
    return;
  }

  _bootstrapConsumed = true;

  const raw = getHydratedData('gdeltIntel') as
    | {
        topics?: Array<{
          id: string;
          articles: GdeltArticle[];
          fetchedAt?: string;
        }>;
      }
    | undefined;

  if (!raw?.topics) {
    return;
  }

  const now = new Date();

  for (const entry of raw.topics) {
    const topic = INTEL_TOPICS.find(
      item => item.id === entry.id,
    );

    if (
      !topic ||
      !entry.articles?.length
    ) {
      continue;
    }

    _bootstrapData.set(entry.id, {
      topic,
      articles: entry.articles,
      fetchedAt: now,
    });
  }
}

export async function fetchTopicIntelligence(
  topic: IntelTopic,
): Promise<TopicIntelligence> {
  _consumeBootstrap();

  const bootstrapped =
    _bootstrapData.get(topic.id);

  if (bootstrapped) {
    _bootstrapData.delete(topic.id);

    return bootstrapped;
  }

  const articles = await fetchGdeltArticles(
    topic.query,
    10,
    '24h',
  );

  return {
    topic,
    articles,
    fetchedAt: new Date(),
  };
}

export async function fetchAllTopicIntelligence():
Promise<TopicIntelligence[]> {
  const results = await Promise.allSettled(
    INTEL_TOPICS.map(topic =>
      fetchTopicIntelligence(topic),
    ),
  );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<TopicIntelligence> =>
        result.status === 'fulfilled',
    )
    .map(result => result.value);
}

export function formatArticleDate(
  dateStr: string,
): string {
  if (!dateStr) {
    return '';
  }

  try {
    // GDELT compact format: "20260111T093000Z"
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(9, 11);
    const min = dateStr.slice(11, 13);
    const sec = dateStr.slice(13, 15);

    const date = new Date(
      `${year}-${month}-${day}T${hour}:${min}:${sec}Z`,
    );

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const now = Date.now();
    const diff = now - date.getTime();

    if (diff < 0) {
      return 'just now';
    }

    if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / 60000)}m ago`;
    }

    if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / 3600000)}h ago`;
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
    return new URL(url)
      .hostname
      .replace('www.', '');
  } catch {
    return '';
  }
}

// ---- Positive GDELT queries (Happy variant) ----
//
// These are intentionally left on the original World Monitor RPC path.
// They are unrelated to the $MONITOR Live Intelligence panel and keeping
// them intact avoids breaking other variants of the upstream project.

export async function fetchPositiveGdeltArticles(
  query: string,
  toneFilter = 'tone>5',
  sort = 'ToneDesc',
  maxrecords = 15,
  timespan = '72h',
): Promise<GdeltArticle[]> {
  const cacheKey =
    `positive:${query}:${toneFilter}:${sort}:${maxrecords}:${timespan}`;

  const cached = articleCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp < CACHE_TTL
  ) {
    return cached.articles;
  }

  const resp =
    await positiveGdeltBreaker.execute(
      async () => {
        return getClient().searchGdeltDocuments({
          query,
          maxRecords: maxrecords,
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

    return cached?.articles || [];
  }

  const articles: GdeltArticle[] =
    (resp.articles || []).map(toGdeltArticle);

  articleCache.set(cacheKey, {
    articles,
    timestamp: Date.now(),
  });

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
    fetchedAt: new Date(),
  };
}

export async function fetchAllPositiveTopicIntelligence():
Promise<TopicIntelligence[]> {
  const results = await Promise.allSettled(
    POSITIVE_GDELT_TOPICS.map(topic =>
      fetchPositiveTopicIntelligence(topic),
    ),
  );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<TopicIntelligence> =>
        result.status === 'fulfilled',
    )
    .map(result => result.value);
}