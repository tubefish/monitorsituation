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

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { response: EscalationXFeed; cachedAt: number }>();

export async function fetchEscalationXFeed(handle: string, signal?: AbortSignal): Promise<EscalationXFeed> {
  const cached = cache.get(handle);
  if (cached && Date.now() - cached.cachedAt < CLIENT_CACHE_TTL_MS) return cached.response;

  const response = await fetch(toApiUrl(`/api/escalation-x-feed?account=${encodeURIComponent(handle)}`), {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as EscalationXFeed & { error?: string };
  if (!response.ok) throw new Error(payload.error || `X feed request failed (${response.status})`);

  cache.set(handle, { response: payload, cachedAt: Date.now() });
  return payload;
}
