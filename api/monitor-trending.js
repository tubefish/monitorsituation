import { jsonResponse } from './_json-response.js';
import { getLongTrending } from './_monitor-trending-data.js';

export const config = { runtime: 'edge' };
const NO_STORE = { 'Cache-Control': 'no-store' };

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, NO_STORE);
  const apiKey = process.env.LONG_API_KEY?.trim();
  if (!apiKey) return jsonResponse({ error: 'LONG feed is not configured' }, 503, NO_STORE);

  try {
    const tokens = await getLongTrending(apiKey);
    return jsonResponse({ tokens, updatedAt: new Date().toISOString() }, 200, {
      'Cache-Control': 'public, max-age=0',
      'CDN-Cache-Control': 'public, s-maxage=300, stale-if-error=300',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-if-error=300',
    });
  } catch (error) {
    console.warn('[monitor-trending] LONG data unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse({ error: 'LONG feed temporarily unavailable' }, 502, NO_STORE);
  }
}
