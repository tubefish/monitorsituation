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

test('only the five curated account handles are accepted', async () => {
  assert.deepEqual(Object.keys(ESCALATION_X_ACCOUNTS), [
    'monitoringmeme',
    'sentdefender',
    'osint613',
    'osinttechnical',
    'ww3_monitor',
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
  assert.match(response.headers.get('vercel-cdn-cache-control'), /s-maxage=300/);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/users\/by\/username\/monitoringmeme/);
  assert.match(calls[1].url, /\/users\/42\/tweets/);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${process.env.X_BEARER_TOKEN}`);
  assert.equal(body.account.handle, 'monitoringmeme');
  assert.equal(body.posts[0].url, 'https://x.com/monitoringmeme/status/99');
  assert.equal(body.posts[0].metrics.likes, 12);
  assert.equal(body.posts[0].hasMedia, true);
});
