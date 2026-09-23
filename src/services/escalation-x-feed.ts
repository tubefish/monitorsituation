import { toApiUrl } from '@/services/runtime';

export interface EscalationXAccount {
  id: string;
  label: string;
  name: string;
  handle: string;
  profileUrl: string;
  profileImageUrl: string;
  verified: boolean;
}

export interface EscalationXPost {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  hasMedia: boolean;
  metrics: { likes: number; replies: number; reposts: number };
}

export interface EscalationXFeed {
  account: EscalationXAccount;
  posts: EscalationXPost[];
  fetchedAt: string;
}

export const X_FEED_POLL_INTERVAL_MS = 60_000;
const CLIENT_CACHE_TTL_MS = 55_000;
const cache = new Map<string, { response: EscalationXFeed; cachedAt: number }>();

function getErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return `X feed request failed (${status})`;
}

export async function fetchEscalationXFeed(handle: string, signal?: AbortSignal): Promise<EscalationXFeed> {
  const cached = cache.get(handle);
  if (cached && Date.now() - cached.cachedAt < CLIENT_CACHE_TTL_MS) return cached.response;

  const response = await fetch(toApiUrl(`/api/escalation-x-feed?account=${encodeURIComponent(handle)}`), {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getErrorMessage(payload, response.status));

  const feed = payload as EscalationXFeed;
  cache.set(handle, { response: feed, cachedAt: Date.now() });
  return feed;
}
