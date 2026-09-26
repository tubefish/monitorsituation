import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAccountEnvironment } from '../scripts/monitor-account-preflight.mjs';

const production = {
  VERCEL_ENV: 'production',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
  CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
  VITE_CONVEX_URL: 'https://fixture.convex.cloud',
  CONVEX_URL: 'https://fixture.convex.cloud/',
  VITE_CLOUD_PREFS_ENABLED: 'true',
};

test('allows local and preview development without production credentials', () => {
  assert.deepEqual(validateAccountEnvironment({}), []);
  assert.deepEqual(validateAccountEnvironment({ VERCEL_ENV: 'preview' }), []);
});

test('accepts configured production and normalizes trailing backend slash', () => {
  assert.deepEqual(validateAccountEnvironment(production), []);
});

test('blocks the missing production browser key and development Clerk instance', () => {
  for (const key of ['', 'pk_test_fixture']) {
    const errors = validateAccountEnvironment({ ...production, VITE_CLERK_PUBLISHABLE_KEY: key });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /VITE_CLERK_PUBLISHABLE_KEY/);
    assert.ok(!errors.join('\n').includes('fixture'));
  }
});

test('blocks disabled persistence, missing issuer, and mismatched account backends', () => {
  const errors = validateAccountEnvironment({
    ...production,
    VITE_CLOUD_PREFS_ENABLED: 'false',
    CLERK_JWT_ISSUER_DOMAIN: '',
    CONVEX_URL: 'https://other.convex.cloud',
  });
  assert.equal(errors.length, 3);
  assert.ok(!errors.join('\n').includes('other.convex.cloud'));
});
