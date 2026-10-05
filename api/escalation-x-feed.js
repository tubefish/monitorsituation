// @ts-check

import { jsonResponse } from './_json-response.js';

export const config = { runtime: 'edge' };

const X_API_BASE = 'https://api.x.com/2';
const X_REQUEST_TIMEOUT_MS = 12_000;
const SUCCESS_HEADERS = {
  'Cache-Control': 'public, max-age=0',
  'CDN-Cache-Control': 'public, s-maxage=60, stale-if-error=86400',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-if-error=86400',
};
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export const ESCALATION_X_ACCOUNTS = Object.freeze({
  monitoringmeme: 'Monitoring the Situation',
  sentdefender: 'OSINTdefender',
  osint613: 'Open Source Intel',
  osinttechnical: 'OSINTtechnical',
  ww3_monitor: 'WW3 Monitor',
  polymarket: 'Polymarket',
  rapidresponse47: 'Rapid Response 47',
  zerohedge: 'ZeroHedge',
  watcherguru: 'Watcher.Guru',
  anniejacobsen: 'Annie Jacobsen',
});

function cleanHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeMetric(value) {
  const metric = Number(value);
  return Number.isFinite(metric) && metric >= 0 ? Math.floor(metric) : 0;
}

async function fetchXJson(path, bearerToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), X_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${X_API_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
        'User-Agent': 'MonitorSituation-EscalationFeed/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = Object.assign(
        new Error(`X API request failed with status ${response.status}`),
        { status: response.status },
      );
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, NO_STORE_HEADERS);
  }

  const requestUrl = new URL(req.url);
  const handle = (requestUrl.searchParams.get('account') || '').trim().toLowerCase();
  const monitoring = requestUrl.searchParams.get('mode') === 'monitoring';
  const label = ESCALATION_X_ACCOUNTS[handle];
  if (!monitoring && !label) {
    return jsonResponse({ error: 'Unknown account' }, 400, NO_STORE_HEADERS);
  }

  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'X feed is not configured' }, 503, NO_STORE_HEADERS);
  }

  try {
    if (monitoring) return await monitoringSearch(requestUrl, bearerToken);
    const userParams = new URLSearchParams({
      'user.fields': 'name,username,profile_image_url,verified,verified_type',
    });
    const userPayload = await fetchXJson(
      `/users/by/username/${encodeURIComponent(handle)}?${userParams}`,
      bearerToken,
    );
    const user = userPayload?.data;
    if (!user?.id) {
      return jsonResponse({ error: 'X account was not found' }, 404, NO_STORE_HEADERS);
    }

    const postParams = new URLSearchParams({
      max_results: '10',
      exclude: 'replies,retweets',
      'tweet.fields': 'created_at,attachments,public_metrics,note_tweet',
    });
    const postPayload = await fetchXJson(`/users/${encodeURIComponent(user.id)}/tweets?${postParams}`, bearerToken);
    const posts = Array.isArray(postPayload?.data)
      ? postPayload.data.map((post) => ({
          id: String(post.id || ''),
          text: String(post.note_tweet?.text || post.text || '').trim(),
          createdAt: String(post.created_at || ''),
          url: post.id ? `https://x.com/${handle}/status/${encodeURIComponent(post.id)}` : '',
          hasMedia: Array.isArray(post.attachments?.media_keys) && post.attachments.media_keys.length > 0,
          metrics: {
            likes: normalizeMetric(post.public_metrics?.like_count),
            replies: normalizeMetric(post.public_metrics?.reply_count),
            reposts: normalizeMetric(post.public_metrics?.retweet_count),
          },
        })).filter((post) => post.id && post.text && post.createdAt)
      : [];

    return jsonResponse({
      account: {
        id: String(user.id),
        label,
        name: String(user.name || label),
        handle,
        profileUrl: `https://x.com/${handle}`,
        profileImageUrl: cleanHttpsUrl(user.profile_image_url),
        verified: Boolean(user.verified),
      },
      posts,
      fetchedAt: new Date().toISOString(),
    }, 200, SUCCESS_HEADERS);
  } catch (error) {
    const status = Number(error?.status);
    if (status === 401 || status === 403) {
      return jsonResponse({ error: monitoring ? 'X search access is unavailable for this API key' : 'X authentication failed' }, 502, NO_STORE_HEADERS);
    }
    if (status === 429) {
      return jsonResponse({ error: 'X rate limit reached; please try again shortly' }, 503, {
        ...NO_STORE_HEADERS,
        'Retry-After': '60',
      });
    }
    const timedOut = error?.name === 'AbortError';
    return jsonResponse({ error: timedOut ? 'X request timed out' : 'X feed is temporarily unavailable' }, timedOut ? 504 : 502, NO_STORE_HEADERS);
  }
}

// Fixed search, not a general-purpose paid X proxy. Each page is CDN-cached.
async function monitoringSearch(requestUrl, bearerToken) {
  const cursor = requestUrl.searchParams.get('cursor') || '';
  if (cursor.length > 2048 || (cursor && !/^[A-Za-z0-9_=-]+$/.test(cursor))) {
    return jsonResponse({ error: 'Invalid search cursor' }, 400, NO_STORE_HEADERS);
  }
  const params = new URLSearchParams({
    query: 'monitoring -is:retweet',
    max_results: '100',
    sort_order: 'recency',
    expansions: 'author_id',
    'tweet.fields': 'created_at,author_id,attachments,public_metrics,note_tweet',
    'user.fields': 'name,username,profile_image_url,verified',
  });
  if (cursor) params.set('next_token', cursor);
  const payload = await fetchXJson(`/tweets/search/recent?${params}`, bearerToken);
  if (payload.errors?.length && !Array.isArray(payload.data)) {
    return jsonResponse({ error: 'X search is temporarily unavailable' }, 502, NO_STORE_HEADERS);
  }
  const users = new Map((payload.includes?.users || []).map(user => [user.id, user]));
  const seen = new Set();
  const posts = [];
  for (const post of Array.isArray(payload.data) ? payload.data : []) {
    const text = String(post.note_tweet?.text || post.text || '').trim();
    const likes = normalizeMetric(post.public_metrics?.like_count);
    const user = users.get(post.author_id);
    if (likes < 6 || !/\bmonitoring\b/i.test(text) || !user || !/^[A-Za-z0-9_]{1,15}$/.test(user.username || '')
      || !/^\d+$/.test(post.id || '') || !Number.isFinite(Date.parse(post.created_at)) || seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push({
      id: post.id, text, createdAt: post.created_at,
      url: `https://x.com/${user.username}/status/${post.id}`,
      hasMedia: Boolean(post.attachments?.media_keys?.length),
      metrics: { likes, replies: normalizeMetric(post.public_metrics?.reply_count), reposts: normalizeMetric(post.public_metrics?.retweet_count) },
      account: {
        id: String(user.id), label: String(user.name || user.username), name: String(user.name || user.username),
        handle: user.username, profileUrl: `https://x.com/${user.username}`,
        profileImageUrl: cleanHttpsUrl(user.profile_image_url), verified: Boolean(user.verified),
      },
    });
  }
  posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return jsonResponse({ posts, nextToken: payload.meta?.next_token || null, fetchedAt: new Date().toISOString() }, 200, SUCCESS_HEADERS);
}
