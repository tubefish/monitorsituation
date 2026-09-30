import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIEF_MAX_AGE_MS, briefTopic, selectMonitorBrief } from '../../shared/monitor-news';
import { MonitorNewsBrief } from '../../src/components/news/MonitorNewsBrief';
import type { NewsItem } from '../../src/types';

const now = Date.parse('2026-09-30T12:00:00Z');
function story(title: string, source = 'Reuters World', hours = 1): NewsItem {
  return { title, source, pubDate: new Date(now - hours * 3_600_000), link: `https://example.com/${encodeURIComponent(title)}`, isAlert: false };
}
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('the situation brief selection', () => {
  it('rejects stale, undated, future and local filler even when marked critical', () => {
    const fresh = story('Ukraine ceasefire talks resume');
    const old = { ...story('NATO military summit', 'AP News', 72), importanceScore: 100, isAlert: true };
    const missing = { ...story('Congress votes on funding'), pubDateMissing: true };
    expect(selectMonitorBrief([old, missing, story('Teacher killed in student attack'), story('Trump visits Congress', 'Reuters US', -2), fresh], now)).toEqual([fresh]);
    expect(selectMonitorBrief([story('Ukraine ceasefire', 'AP News', BRIEF_MAX_AGE_MS / 3_600_000 + 1)], now)).toEqual([]);
  });
  it('keeps globally relevant Indian news without promoting unrelated local headlines', () => {
    expect(briefTopic(story('India and US agree trade deal'))).toBe('Markets');
    expect(briefTopic(story('India prime minister holds peace talks'))).toBe('Geopolitics');
    expect(briefTopic(story('Local school announces annual celebration'))).toBeNull();
  });
  it('reserves coverage for each available topic and limits sports, culture and source dominance', () => {
    const major = Array.from({ length: 12 }, (_, i) => story(`Ukraine peace talks round ${i}`, 'Reuters World', i));
    const other = [story('Congress votes on budget', 'AP News'), story('OpenAI releases model', 'The Verge'), story('Inflation falls', 'Financial Times'), story('Bitcoin market update', 'CoinDesk'), story('World Cup final', 'BBC Sport'), story('World Cup semi final', 'BBC Sport'), story('Oscars nominees announced', 'BBC Culture')];
    const selected = selectMonitorBrief([...major, ...other], now);
    expect(new Set(selected.map(briefTopic)).size).toBe(7);
    expect(selected.filter(item => item.source === 'Reuters World')).toHaveLength(4);
    expect(selected.filter(item => briefTopic(item) === 'Sports')).toHaveLength(1);
    expect(briefTopic(selected[0]!)).not.toBe('Sports');
  });
  it('deduplicates tracking links and syndicated titles, and refuses executable links', () => {
    const original = story('Ukraine ceasefire talks resume');
    expect(selectMonitorBrief([original, { ...original, source: 'AP News', link: `${original.link}?utm_source=test` }, { ...original, title: `${original.title} - BBC`, link: 'https://bbc.com/story' }, { ...story('Congress votes'), link: 'javascript:alert(1)' }], now)).toEqual([original]);
  });
  it('gives a fresh major story precedence over an old threat score', () => {
    const old = { ...story('Iran nuclear talks', 'AP News', 36), importanceScore: 100, isAlert: true };
    const fresh = story('Congress passes funding bill', 'Reuters US', 0.1);
    expect(selectMonitorBrief([old, fresh], now)[0]).toBe(fresh);
  });
  it('excludes publisher-labelled opinion rather than presenting it as reporting', () => {
    const news = story('Bitcoin exchange launches regulated trading', 'CoinDesk');
    const opinion = { ...story('Democrats killed the crypto bill', 'CoinDesk'), link: 'https://www.coindesk.com/opinion/2026/09/29/crypto-bill' };
    expect(selectMonitorBrief([news, opinion, { ...story('Congress must act'), isOpinion: true }, story('Opinion: Trump should change course')], now)).toEqual([news]);
  });
});

describe('the situation brief interface', () => {
  it('preserves a selected topic and keyboard focus when fresh stories arrive', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const brief = new MonitorNewsBrief(); document.body.append(brief.element);
    brief.update([story('Ukraine peace talks'), story('Bitcoin climbs', 'CoinDesk')]);
    const crypto = [...brief.element.querySelectorAll('button')].find(button => button.textContent === 'Crypto')!;
    crypto.focus(); crypto.click();
    expect(brief.element.querySelectorAll('article')).toHaveLength(1);
    brief.update([story('Congress votes'), story('Ethereum update', 'CoinDesk')]);
    expect(crypto.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(crypto);
    expect(brief.element.querySelector('h3')?.textContent).toBe('Ethereum update');
  });
  it('renders publisher text safely and labels the source and actual publication time', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const brief = new MonitorNewsBrief();
    brief.update([{ ...story('OpenAI <img src=x onerror=alert(1)>', 'The Verge'), snippet: '<script>alert(1)</script>Publisher excerpt' }]);
    expect(brief.element.querySelector('script, img')).toBeNull();
    expect(brief.element.querySelector('time')?.dateTime).toBe(new Date(now - 3_600_000).toISOString());
    expect(brief.element.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(brief.element.querySelector('.monitor-brief-meta')?.textContent).toContain('The Verge');
  });
  it('does not fill an empty or failed update with old headlines', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const brief = new MonitorNewsBrief();
    brief.update([story('Congress votes', 'AP News', 120)]);
    expect(brief.element.querySelector('article')).toBeNull();
    expect(brief.element.textContent).toContain('No fresh headlines available');
  });
  it('does not repeat Google News headline-only excerpts or publisher suffixes', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const brief = new MonitorNewsBrief();
    brief.update([{ ...story('Congress passes funding bill - Reuters', 'Reuters US'), snippet: 'Congress passes funding bill Reuters' }]);
    expect(brief.element.querySelector('h3')?.textContent).toBe('Congress passes funding bill');
    expect(brief.element.querySelector('.monitor-brief-summary')).toBeNull();
  });
});
