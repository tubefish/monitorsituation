/** Editorial selection for MONITOR's main brief; intelligence panels keep their own ranking. */
export const BRIEF_TOPICS = ['Geopolitics', 'USA', 'AI & Tech', 'Markets', 'Crypto', 'Sports', 'Culture'] as const;
export type BriefTopic = typeof BRIEF_TOPICS[number];
export const BRIEF_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export interface BriefCandidate {
  title: string;
  source: string;
  link: string;
  pubDate?: Date | string | number;
  publishedAt?: number;
  pubDateMissing?: boolean;
  isOpinion?: boolean;
}

// Topic-specific feeds prevent a general wire's first five local stories from
// consuming the whole brief. The order also balances the bounded RSS fallback.
export const MONITOR_BRIEF_FEEDS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Reuters US', url: 'https://news.google.com/rss/search?q=site%3Areuters.com%20(Congress%20OR%20Trump%20OR%20%22White%20House%22%20OR%20%22Supreme%20Court%22)%20when%3A1d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { name: 'BBC Culture', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { name: 'Reuters World', url: 'https://news.google.com/rss/search?q=site%3Areuters.com%20(war%20OR%20diplomacy%20OR%20sanctions%20OR%20election)%20when%3A1d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'AP News', url: 'https://news.google.com/rss/search?q=site%3Aapnews.com%20(war%20OR%20Congress%20OR%20economy%20OR%20election)%20when%3A1d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss' },
  { name: 'CNN World', url: 'https://news.google.com/rss/search?q=site%3Acnn.com%20world%20news%20when%3A1d&hl=en-US&gl=US&ceid=US:en' },
];

const FILLER = /\b(horoscope|lottery numbers|coupon|promo code|best deals|shopping deals|price prediction|what to wear|how to watch|live stream|buy now|stock to buy|stocks to buy|millionaire-maker)\b/i;
const LOCAL_CRIME = /\b(teacher|schoolboy|schoolgirl|baboon|neighbor|neighbour|boyfriend|girlfriend|mother of|father of|amusement park)\b.*\b(kill|murder|attack|injur|arrest|feces|faeces)|\b(eviction|child murder|theme park injuries)\b/i;

export function briefTopic(item: Pick<BriefCandidate, 'title' | 'source'>): BriefTopic | null {
  const title = item.title;
  if (FILLER.test(title) || LOCAL_CRIME.test(title)) return null;
  if (/\b(bitcoin|ethereum|crypto|blockchain|stablecoins?|tokeniz\w+|coinbase|binance|solana|defi|digital assets?)\b/i.test(title) || item.source === 'CoinDesk') return 'Crypto';
  if (/\b(artificial intelligence|super intelligence|superintelligence|AI|OpenAI|Anthropic|ChatGPT|Nvidia|semiconductor|chips?|cyberattack|cybersecurity|data breach|robotics?|SpaceX|NASA|Google|Microsoft|Meta|Apple)\b/i.test(title)) return 'AI & Tech';
  if (item.source === 'BBC Sport' || /\b(NFL|NBA|MLB|NHL|FIFA|Olympics|World Cup|Super Bowl|Champions League)\b/i.test(title)) return 'Sports';
  if (item.source === 'BBC Culture' || /\b(Oscars?|Grammys?|Emmys?|box office|Hollywood)\b/i.test(title)) return 'Culture';
  if (/\b(interest rates?|Federal Reserve|inflation|GDP|recession|central bank|stock markets?|Wall Street|S&P|Nasdaq|Dow Jones|bonds?|yields?|oil prices?|gold prices?|tariffs?|trade deal|IPO|earnings|OPEC|merger)\b/i.test(title)) return 'Markets';
  if (/\b(war|ceasefire|peace talks|missiles?|nuclear|NATO|sanctions?|invasion|airstrikes?|troops|military|diplomacy|diplomatic|summit|United Nations|UN|Gaza|Ukraine|Iran|Israel|Taiwan|Beijing|Putin|Zelensk\w+|coup|earthquake|tsunami|pandemic|epidemic|Ebola)\b/i.test(title)) return 'Geopolitics';
  if (/\b(Trump|Biden|White House|Congress|Senate|Supreme Court|Pentagon|Democrats?|Republicans?|shutdown|US election|U\.S\. election|American voters)\b/i.test(title) || item.source === 'Reuters US') return 'USA';
  if (item.source === 'The Verge') return 'AI & Tech';
  if (/\b(president|prime minister|elections?|parliament|protests?|refugees?|humanitarian|border|international|global|governments?|foreign minister)\b/i.test(title)) return 'Geopolitics';
  return null;
}

export function briefPublishedAt(item: BriefCandidate): number {
  if (item.pubDateMissing) return NaN;
  const value = item.publishedAt ?? item.pubDate;
  return value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value ?? '');
}

function linkIdentity(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

/** Bounded, fresh, balanced selection, applied before the server cap and again to cached client data. */
export function selectMonitorBrief<T extends BriefCandidate>(items: readonly T[], now = Date.now(), limit = 20): T[] {
  const ranked = items.flatMap(item => {
    const time = briefPublishedAt(item);
    const topic = briefTopic(item);
    const link = linkIdentity(item.link);
    if (!topic || !link || !Number.isFinite(time) || time > now + 5 * 60_000 || now - time > BRIEF_MAX_AGE_MS) return [];
    // Wire feeds can mix reporting and op-eds. Preserve the server's explicit
    // stamp, and recognize publisher-labelled opinion URLs in RSS fallbacks.
    if (item.isOpinion || /\/(opinion|commentary|editorials?)(\/|$)/i.test(new URL(link).pathname)
      || /^(opinion|editorial|commentary)\s*[:|–-]/i.test(item.title)) return [];
    const ageHours = Math.max(0, now - time) / 3_600_000;
    const secondary = topic === 'Sports' || topic === 'Culture';
    // Threat labels never increase editorial rank. Recency dominates within
    // the main topics; sports and culture remain a small supporting section.
    return [{ item, topic, link, score: (secondary ? 0 : 48) - ageHours, time }];
  }).sort((a, b) => b.score - a.score || b.time - a.time || a.item.title.localeCompare(b.item.title));

  const links = new Set<string>();
  const titles = new Set<string>();
  const unique = ranked.filter(row => {
    const title = row.item.title.toLowerCase().replace(/\s+[-–|]\s+[^-–|]+$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!title || links.has(row.link) || titles.has(title)) return false;
    links.add(row.link);
    titles.add(title);
    return true;
  });
  const chosen = new Set<typeof unique[number]>();
  const sources = new Map<string, number>();
  const topics = new Map<BriefTopic, number>();
  const take = (row: typeof unique[number]) => {
    if (chosen.size >= limit || chosen.has(row) || (sources.get(row.item.source) ?? 0) >= 4) return;
    const topicCap = row.topic === 'Sports' || row.topic === 'Culture' ? 1 : 5;
    if ((topics.get(row.topic) ?? 0) >= topicCap) return;
    chosen.add(row);
    sources.set(row.item.source, (sources.get(row.item.source) ?? 0) + 1);
    topics.set(row.topic, (topics.get(row.topic) ?? 0) + 1);
  };
  // Reserve room for each available topic before filling with the newest news.
  for (const topic of BRIEF_TOPICS) {
    const first = unique.find(row => row.topic === topic);
    if (first) take(first);
  }
  unique.forEach(take);
  return unique.filter(row => chosen.has(row)).map(row => row.item);
}
