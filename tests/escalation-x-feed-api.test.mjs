import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import handler, { ESCALATION_X_ACCOUNTS } from '../api/escalation-x-feed.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.X_BEARER_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = originalToken;
});

test('only the ten curated account handles are accepted', async () => {
  assert.deepEqual(Object.keys(ESCALATION_X_ACCOUNTS), [
    'monitoringmeme',
    'sentdefender',
    'osint613',
    'osinttechnical',
    'ww3_monitor',
    'polymarket',
    'rapidresponse47',
    'zerohedge',
    'watcherguru',
    'anniejacobsen',
  ]);

  const response = await handler(new Request('https://example.test/api/escalation-x-feed?account=somebodyelse'));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('returns a clear configuration error without exposing a credential', async () => {
  delete process.env.X_BEARER_TOKEN;
  const response = await handler(new Request('https://example.test/api/escalation-x-feed?account=monitoringmeme'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'X feed is not configured' });
});

test('fetches and normalizes an allowlisted account with paid reads behind CDN caching', async () => {
  process.env.X_BEARER_TOKEN = ['fixture', 'bearer'].join('-');
  const calls = [];
  const upstream = [
    {
      data: {
        id: '42',
        name: 'Monitoring the Situation',
        username: 'monitoringmeme',
        profile_image_url: 'https://pbs.twimg.com/profile_images/example.jpg',
        verified: true,
      },
    },
    {
      data: [{
        id: '99',
        text: 'A developing situation.',
        created_at: '2026-09-21T05:00:00.000Z',
        attachments: { media_keys: ['3_99'] },
        public_metrics: { like_count: 12, reply_count: 2, retweet_count: 4 },
      }],
    },
  ];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(upstream.shift());
  };

  const response = await handler(new Request('https://example.test/api/escalation-x-feed?account=monitoringmeme'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('vercel-cdn-cache-control'), /s-maxage=60/);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/users\/by\/username\/monitoringmeme/);
  assert.match(calls[1].url, /\/users\/42\/tweets/);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${process.env.X_BEARER_TOKEN}`);
  assert.equal(body.account.handle, 'monitoringmeme');
  assert.equal(body.posts[0].url, 'https://x.com/monitoringmeme/status/99');
  assert.equal(body.posts[0].metrics.likes, 12);
  assert.equal(body.posts[0].hasMedia, true);
});

test('monitoring search enforces 6+ likes, literal text, authors, sort and pagination', async () => {
  process.env.X_BEARER_TOKEN = 'fixture';
  const post = (id, text, likes) => ({ id, text, author_id: '42', created_at: `2026-10-05T12:00:${id.padStart(2,'0')}Z`, public_metrics: { like_count: likes } });
  globalThis.fetch = async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('query'), 'monitoring -is:retweet');
    assert.equal(params.get('next_token'), 'next_123');
    assert.equal(params.get('sort_order'), 'recency');
    return Response.json({
      data: [post('1', 'Monitoring the situation', 5), post('2', 'MONITORING now', 6), post('3', 'unmonitoring', 90), post('4', '#monitoring', 100), post('4', '#monitoring', 100), post('5', 'monitoring', undefined)],
      includes: { users: [{ id: '42', username: 'tester', name: '<script>test</script>', profile_image_url: 'javascript:alert(1)' }] },
      meta: { next_token: 'next_456' },
    });
  };
  const response = await handler(new Request('https://example.test/api/escalation-x-feed?mode=monitoring&cursor=next_123'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.posts.map(p => p.id), ['4', '2']);
  assert.equal(body.posts[0].account.profileImageUrl, '');
  assert.equal(body.nextToken, 'next_456');
});

test('monitoring search validates cursors and handles access/rate failures without secrets', async () => {
  process.env.X_BEARER_TOKEN = 'fixture';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', {status: 403}); };
  assert.equal((await handler(new Request('https://example.test/api/escalation-x-feed?mode=monitoring&cursor=%26query%3Dother'))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handler(new Request('https://example.test/api/escalation-x-feed?mode=monitoring'))).status, 502);
  globalThis.fetch = async () => new Response('', {status: 429});
  const response = await handler(new Request('https://example.test/api/escalation-x-feed?mode=monitoring'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
});
