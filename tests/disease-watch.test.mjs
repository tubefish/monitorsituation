import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiseaseWatchLoader, parseRussiaReports, parseWhoReports } from '../api/_disease-watch.js';
import { bootstrapTierKeyNames } from '../shared/bootstrap-tier-keys.js';

const NOW = Date.parse('2026-10-05T16:00:00Z');
const item = (title, source = 'https://www.reuters.com', date = 'Mon, 05 Oct 2026 12:00:00 GMT', url = 'https://news.google.com/rss/articles/one') => `<item><title>${title}</title><source url="${source}">Reuters</source><pubDate>${date}</pubDate><link>${url}</link></item>`;
const feed = (items) => `<rss><channel>${items}</channel></rss>`;
const who = { value: [{ Title: 'Ebola - DRC', ItemDefaultUrl: '/2026-DON618', PublicationDateAndTime: '2026-09-25T15:16:26Z' }] };

test('Russia selection requires a known publisher, geographic relevance, disease relevance and a valid recent date', () => {
  const xml = feed([
    item('Russia plague reports remain unconfirmed - Reuters'),
    item('Russia plague reports remain unconfirmed - Reuters'),
    item('Russia plague', 'https://reuters.com.attacker.example'),
    item('Russia election results'), item('Plague in another country'),
    item('Russia plague', undefined, 'invalid'),
    item('Russia plague', undefined, 'Mon, 05 Oct 2027 12:00:00 GMT'),
    item('Russia plague', undefined, 'Mon, 05 Oct 2025 12:00:00 GMT'),
    item('Russia plague', undefined, undefined, 'javascript:alert(1)'),
  ].join(''));
  const reports = parseRussiaReports(xml, NOW);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'Russia plague reports remain unconfirmed');
  assert.equal(reports[0].source, 'Reuters');
  assert.equal('confirmed' in reports[0], false, 'Headlines must not become diagnostic status');
});

test('malformed upstream payloads fail instead of becoming healthy empty feeds', () => {
  assert.throws(() => parseRussiaReports('<html>unavailable</html>'));
  assert.throws(() => parseRussiaReports('<!DOCTYPE rss><rss><channel/></rss>'));
  assert.throws(() => parseWhoReports({ error: 'Unavailable' }));
  assert.deepEqual(parseRussiaReports(feed('')), []);
});

test('WHO links are canonical, publication dates bounded, and IDs deduplicated', () => {
  const valid = who.value[0];
  const reports = parseWhoReports({ value: [valid, valid,
    { ...valid, ItemDefaultUrl: '//attacker.example' },
    { ...valid, PublicationDateAndTime: '2020-01-01' },
    { ...valid, PublicationDateAndTime: '2027-01-01' },
  ] }, NOW);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].url, 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON618');
});

test('parallel reads coalesce; refresh failures preserve timestamps and expire cached results', async () => {
  let now = NOW;
  let broken = false;
  let calls = 0;
  const loader = createDiseaseWatchLoader(async url => {
    calls++;
    if (broken) throw new Error('offline');
    return new Response(url.includes('google') ? feed(item('Russia plague reports remain unconfirmed')) : JSON.stringify(who));
  }, () => now);
  const [first, second] = await Promise.all([loader(), loader()]);
  assert.equal(calls, 2);
  assert.equal(first, second);
  assert.equal(first.russia.status, 'ok');
  assert.equal(first.global.reports.length, 1);
  broken = true;
  now += 300_001;
  const stale = await loader();
  assert.equal(stale.russia.status, 'stale');
  assert.equal(stale.russia.fetchedAt, NOW);
  assert.equal(stale.russia.reports.length, 1);
  now += 86_400_000;
  const expired = await loader();
  assert.deepEqual(expired.russia, { status: 'unavailable', fetchedAt: 0, reports: [] });
});

test('one broken source does not erase the other and oversized responses are rejected', async () => {
  const loader = createDiseaseWatchLoader(async url => new Response(url.includes('google') ? 'x'.repeat(600_001) : JSON.stringify(who)), () => NOW);
  const data = await loader();
  assert.equal(data.russia.status, 'unavailable');
  assert.equal(data.global.status, 'ok');
});

test('Disease Watch is only requested on demand, never in the startup tiers', () => {
  assert.ok(bootstrapTierKeyNames('on-demand').includes('diseaseWatch'));
  assert.ok(!bootstrapTierKeyNames('fast').includes('diseaseWatch'));
  assert.ok(!bootstrapTierKeyNames('slow').includes('diseaseWatch'));
});
