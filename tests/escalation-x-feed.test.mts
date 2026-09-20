import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('../src/components/EscalationCorrelationPanel.ts', import.meta.url),
  'utf8',
);

test('Escalation Monitor embeds the five requested X accounts in order', () => {
  const handles = [...source.matchAll(/handle: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(handles, [
    'monitoringmeme',
    'sentdefender',
    'osint613',
    'osinttechnical',
    'ww3_monitor',
  ]);
});

test('Escalation Monitor no longer depends on correlation or Redis-backed bootstrap data', () => {
  assert.doesNotMatch(source, /from ['"]\.\/CorrelationPanel|ensureHydrated|getHydratedData|redis/i);
  assert.match(source, /platform\.twitter\.com\/widgets\.js/);
});
