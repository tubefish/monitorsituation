import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isDisallowedOrigin as legacyDenied } from '../api/_cors.js';
import { isDisallowedOrigin as gatewayDenied } from '../server/cors.ts';

test('both API stacks admit MONITOR and refuse lookalike origins', () => {
  for (const origin of ['https://monitorsituation.xyz', 'https://www.monitorsituation.xyz']) {
    const req = new Request('https://monitorsituation.xyz/api/rss-proxy', { headers: { origin } });
    assert.equal(legacyDenied(req), false);
    assert.equal(gatewayDenied(req), false);
  }
  for (const origin of ['https://monitorsituation.xyz.evil.test', 'https://random.vercel.app', 'http://monitorsituation.xyz']) {
    const req = new Request('https://monitorsituation.xyz/api/rss-proxy', { headers: { origin } });
    assert.equal(legacyDenied(req), true);
    assert.equal(gatewayDenied(req), true);
  }
});

test('explicit Vercel deployment origin is allowed without admitting other deployments', () => {
  const previous = process.env.VERCEL_URL;
  process.env.VERCEL_URL = 'monitor-fixture-123.vercel.app';
  try {
    assert.equal(legacyDenied(new Request('https://example.com', { headers: { origin: 'https://monitor-fixture-123.vercel.app' } })), false);
    assert.equal(gatewayDenied(new Request('https://example.com', { headers: { origin: 'https://other-123.vercel.app' } })), true);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previous;
  }
});

test('Vercel ships news while preserving the twelve-function deployment budget', () => {
  const ignore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.ok(!ignore.split('\n').includes('api/*'));
  assert.ok(ignore.includes('api/economic/'));
  for (const family of ['conflict', 'news', 'infrastructure', 'intelligence', 'military', 'radiation', 'unrest']) {
    assert.ok(!ignore.includes(`api/${family}/`));
  }
  assert.ok(ignore.includes('api/youtube/*'));
  assert.ok(ignore.includes('!api/youtube/live.js'));
  const prune = readFileSync(new URL('../scripts/monitor-prune-vercel-api.mjs', import.meta.url), 'utf8');
  const kept = prune.match(/const KEEP_ENTRYPOINTS = new Set\(\[([\s\S]*?)\]\)/)?.[1].match(/'[^']+'/g) ?? [];
  assert.equal(kept.length, 12);
  assert.ok(kept.includes("'news/v1/[rpc].ts'"));
  assert.ok(!kept.includes("'economic/v1/[rpc].ts'"));
});
