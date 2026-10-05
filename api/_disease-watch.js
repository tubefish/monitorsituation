import { XMLParser } from 'fast-xml-parser';
import { rssFetchHeadersForHost } from './_rss-fetch-headers.js';

// On-demand public data, served inside the existing bootstrap function. No
// credentials or upstream health RPC are needed on the MONITOR deployment.
export const WHO_DON_URL = 'https://www.who.int/api/emergencies/diseaseoutbreaknews?sf_provider=dynamicProvider372&sf_culture=en&%24orderby=PublicationDateAndTime%20desc&%24select=Title,ItemDefaultUrl,PublicationDateAndTime&%24top=60';
const RUSSIA_QUERY = '(Russia OR Irkutsk OR Siberia OR Shelekhov) (plague OR pneumonia) when:14d';
export const RUSSIA_NEWS_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(RUSSIA_QUERY)}&hl=en-US&gl=US&ceid=US:en`;
const PUBLISHERS = new Map([
  ['reuters.com', 'Reuters'], ['apnews.com', 'Associated Press'],
  ['bbc.com', 'BBC'], ['bbc.co.uk', 'BBC'], ['abcnews.com', 'ABC News'],
  ['abcnews.go.com', 'ABC News'], ['ft.com', 'Financial Times'],
  ['dw.com', 'DW'], ['euronews.com', 'Euronews'], ['cnn.com', 'CNN'],
  ['theguardian.com', 'The Guardian'],
]);
const CACHE_TTL = 240_000;
const DAY = 86_400_000;
const MAX_BYTES = 600_000;
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true });

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function validDate(value, now, days) {
  const date = Date.parse(value);
  return Number.isFinite(date) && date <= now + 300_000 && date >= now - days * DAY ? date : 0;
}
function publisher(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return PUBLISHERS.get(host) || '';
  } catch { return ''; }
}

export function parseRussiaReports(xml, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported feed declaration');
  const parsed = parser.parse(xml);
  if (!parsed?.rss || !Object.hasOwn(parsed.rss, 'channel')) throw new Error('Invalid news feed');
  const raw = parsed.rss.channel.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  return items.flatMap(item => {
    const source = publisher(item.source?.['@_url']);
    const rawTitle = text(item.title);
    const title = rawTitle.replace(/\s+-\s+[^–-]+$/, '').trim();
    const publishedAt = validDate(item.pubDate, now, 14);
    const url = text(item.link);
    if (!source || !publishedAt || !title || !/\b(russia|russian|irkutsk|siberia|siberian|shele[kh]+ov)\b/i.test(title)
      || !/\b(plague|pneumoni[ac])\b/i.test(title)) return [];
    try {
      const link = new URL(url);
      if (link.protocol !== 'https:' || link.hostname !== 'news.google.com' || !link.pathname.startsWith('/rss/articles/')) return [];
    } catch { return []; }
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: url, title: title.slice(0, 300), url, source, publishedAt }];
  }).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 16);
}

export function parseWhoReports(data, now = Date.now()) {
  if (!Array.isArray(data?.value)) throw new Error('Invalid WHO response');
  const seen = new Set();
  return data.value.flatMap(item => {
    const title = text(item.Title);
    const path = text(item.ItemDefaultUrl);
    const publishedAt = validDate(item.PublicationDateAndTime, now, 180);
    if (!title || !publishedAt || !/^\/\d{4}-DON\d+$/i.test(path) || seen.has(path)) return [];
    seen.add(path);
    return [{ id: path, title: title.slice(0, 300), url: `https://www.who.int/emergencies/disease-outbreak-news/item${path}`, source: 'WHO', publishedAt }];
  }).sort((a, b) => b.publishedAt - a.publishedAt);
}

async function boundedText(response) {
  if (!response.ok || !response.body) throw new Error('Source unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let result = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Source response too large');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export function createDiseaseWatchLoader(fetchImpl = (...args) => globalThis.fetch(...args), clock = Date.now) {
  let cache = null;
  let checkedAt = 0;
  let pending = null;
  async function source(url, parse, previous) {
    try {
      const response = await fetchImpl(url, {
        headers: { ...rssFetchHeadersForHost(new URL(url).hostname), Accept: 'application/json, application/rss+xml, application/xml' },
        signal: AbortSignal.timeout(20_000),
      });
      const reports = parse(await boundedText(response), clock());
      return { status: 'ok', fetchedAt: clock(), reports };
    } catch {
      return previous?.fetchedAt && clock() - previous.fetchedAt <= DAY
        ? { ...previous, status: 'stale' }
        : { status: 'unavailable', fetchedAt: 0, reports: [] };
    }
  }
  return async () => {
    if (cache && clock() - checkedAt < CACHE_TTL) return cache;
    if (pending) return pending;
    pending = Promise.all([
      source(RUSSIA_NEWS_URL, parseRussiaReports, cache?.russia),
      source(WHO_DON_URL, (body, now) => parseWhoReports(JSON.parse(body), now), cache?.global),
    ]).then(([russia, global]) => {
      cache = { russia, global };
      checkedAt = clock();
      return cache;
    }).finally(() => { pending = null; });
    return pending;
  };
}

export const loadDiseaseWatch = createDiseaseWatchLoader();
