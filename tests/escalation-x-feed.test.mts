import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('../src/components/EscalationCorrelationPanel.ts', import.meta.url),
  'utf8',
);

test('X Tracker includes the nine requested X accounts in order', () => {
  const handles = [...source.matchAll(/handle: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(handles, [
    'monitoringmeme',
    'sentdefender',
    'osint613',
    'osinttechnical',
    'ww3_monitor',
    'polymarket',
    'rapidresponse47',
    'zerohedge',
    'watcherguru',
  ]);
});

test('Escalation Monitor no longer depends on correlation or Redis-backed bootstrap data', () => {
  assert.doesNotMatch(source, /from ['"]\.\/CorrelationPanel|ensureHydrated|getHydratedData|redis/i);
  assert.match(source, /fetchEscalationXFeed/);
  assert.doesNotMatch(source, /platform\.twitter\.com\/widgets\.js/);
});

test('Escalation Monitor renders a native feed with loading, error, and post states', () => {
  assert.match(source, /escalation-x-loading/);
  assert.match(source, /escalation-x-error/);
  assert.match(source, /escalation-x-post/);
  assert.match(source, /View on X/);
});
