export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  const requestUrl = new URL(req.url);

  const query = requestUrl.searchParams.get('query');
  const maxrecords = requestUrl.searchParams.get('maxrecords') || '10';
  const timespan = requestUrl.searchParams.get('timespan') || '24h';

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'Missing query parameter' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  try {
    const params = new URLSearchParams({
      query,
      mode: 'ArtList',
      maxrecords,
      format: 'json',
      timespan,
      sort: 'HybridRel',
    });

    const gdeltUrl =
      `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

    const response = await fetch(gdeltUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': '$MONITOR/1.0',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `GDELT request failed: ${response.status}`,
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const data = await response.text();

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('[gdelt-proxy]', error);

    return new Response(
      JSON.stringify({ error: 'Failed to fetch GDELT' }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
}