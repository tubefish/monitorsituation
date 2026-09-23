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
  const label = ESCALATION_X_ACCOUNTS[handle];
  if (!label) {
    return jsonResponse({ error: 'Unknown account' }, 400, NO_STORE_HEADERS);
  }

  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'X feed is not configured' }, 503, NO_STORE_HEADERS);
  }

  try {
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
      return jsonResponse({ error: 'X authentication failed' }, 502, NO_STORE_HEADERS);
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
