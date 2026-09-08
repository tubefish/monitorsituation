import { addPublicSharedRpcMarker } from '@/shared/public-rpc-cache';

const CREDENTIAL_HEADERS = ['Authorization', 'X-WorldMonitor-Key', 'X-Api-Key', 'Cookie'];
const MONITOR_CUSTOM_HOSTS = new Set(['monitorsituation.xyz', 'www.monitorsituation.xyz']);

function getMonitorSessionUrl(rawUrl: string): string | null {
  if (typeof window === 'undefined' || !MONITOR_CUSTOM_HOSTS.has(window.location.hostname)) {
    return null;
  }

  try {
    const requested = new URL(rawUrl, window.location.href);
    if (requested.pathname !== '/api/news/v1/list-feed-digest') return null;

    const sessionUrl = new URL(`${requested.pathname}${requested.search}`, window.location.origin);
    sessionUrl.searchParams.delete('public');
    return sessionUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch one of the explicitly caller-invariant dashboard RPCs through its
 * isolated public CDN cache key. The legacy URL remains session/key gated.
 *
 * MONITOR's canonical custom domains use the existing anonymous browser
 * session for the news digest because Vercel currently fails to classify that
 * custom-domain request as public and otherwise returns 401.
 */
export const publicRpcFetch: typeof fetch = async (input, init) => {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (method.toUpperCase() !== 'GET') {
    throw new Error('public RPC fetch only supports GET');
  }

  const rawUrl = input instanceof Request ? input.url : String(input);
  const monitorSessionUrl = getMonitorSessionUrl(rawUrl);
  if (monitorSessionUrl) {
    return globalThis.fetch(monitorSessionUrl, {
      ...init,
      method: 'GET',
      credentials: 'include',
    });
  }

  const url = addPublicSharedRpcMarker(rawUrl);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  for (const name of CREDENTIAL_HEADERS) headers.delete(name);

  return globalThis.fetch(url, {
    ...init,
    method: 'GET',
    headers,
    credentials: 'omit',
  });
};
