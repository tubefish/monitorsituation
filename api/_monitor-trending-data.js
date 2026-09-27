// LONG's Robinhood Chain asset feed, observed in its public FDV-sorted tokens page.
// The integrator is public routing metadata; LONG_API_KEY is supplied only at runtime.
const LONG_GRAPHQL_URL = 'https://api.long.xyz/v1/graphql';
const LONG_INTEGRATOR = '0x92d435C96E63c43E12d6D0AB28f6b0B04072F765';
const ADDRESS = /^0x[a-f\d]{40}$/i;

export const LONG_TRENDING_QUERY = `
  query MonitorTrending($where: Asset_bool_exp!, $orderBy: [Asset_order_by!], $limit: Int!) {
    Asset(where: $where, order_by: $orderBy, limit: $limit) {
      asset_address
      asset_numeraire_address
      auction_pool {
        pool_current_fdv_usd
        base_token { token_symbol token_name token_image_public_url }
        quote_token { token_symbol }
      }
    }
  }
`;

export const LONG_TRENDING_VARIABLES = {
  limit: 20,
  orderBy: [
    { auction_pool: { pool_current_fdv_usd: 'desc' } },
    { asset_creation_block: 'desc' },
  ],
  where: {
    chain_id: { _eq: 4663 },
    integrator_address: { _ilike: LONG_INTEGRATOR },
    asset_address: { _ilike: '%1e18' },
    auction_pool: {
      pool_volume_24h_usd: { _gte: '1000000000000000000' },
      pool_volume_24h_swap_count: { _gte: 1 },
    },
  },
};

function safeImageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'storage.long.xyz' ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeLongAssets(payload) {
  if (!Array.isArray(payload?.data?.Asset)) throw new Error('Invalid LONG asset response');
  const seen = new Set();
  return payload.data.Asset.flatMap((asset) => {
    const address = asset?.asset_address;
    const pool = asset?.auction_pool;
    const token = pool?.base_token;
    const rawFdv = pool?.pool_current_fdv_usd;
    // The on-chain FDV is a fixed-point USD amount with 18 decimals.
    const fdvUsd = typeof rawFdv === 'string' && /^\d+$/.test(rawFdv)
      ? Number(rawFdv) / 1e18 : NaN;
    if (!ADDRESS.test(address) || seen.has(address.toLowerCase()) ||
        !Number.isFinite(fdvUsd) || fdvUsd <= 0 ||
        typeof token?.token_symbol !== 'string' || !token.token_symbol.trim()) return [];
    seen.add(address.toLowerCase());
    return [{
      address,
      name: typeof token.token_name === 'string' ? token.token_name.trim() : token.token_symbol.trim(),
      symbol: token.token_symbol.trim(),
      pair: typeof pool.quote_token?.token_symbol === 'string'
        ? pool.quote_token.token_symbol.trim() : '',
      fdvUsd,
      imageUrl: safeImageUrl(token.token_image_public_url),
    }];
  }).sort((a, b) => b.fdvUsd - a.fdvUsd).slice(0, 10);
}

export async function getLongTrending(apiKey, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(LONG_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'MonitorSituation-Trending/1.0',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ operationName: 'MonitorTrending', query: LONG_TRENDING_QUERY, variables: LONG_TRENDING_VARIABLES }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LONG upstream status ${response.status}`);
    const payload = await response.json();
    if (payload?.errors?.length) throw new Error('LONG GraphQL query failed');
    return normalizeLongAssets(payload);
  } finally {
    clearTimeout(timeout);
  }
}
