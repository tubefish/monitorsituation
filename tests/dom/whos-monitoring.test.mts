import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { WhosMonitoringPanel } from '@/components/WhosMonitoringPanel';
import { fetchMonitoringFeed, type MonitoringFeed } from '@/services/monitoring-x-feed';
import { initTestI18n } from './helpers/i18n.mts';

vi.mock('@/services/monitoring-x-feed', () => ({ fetchMonitoringFeed: vi.fn() }));
let panel: WhosMonitoringPanel;
const feed = (ids: string[], nextToken: string | null = 'next'): MonitoringFeed => ({
  nextToken, fetchedAt: new Date().toISOString(), posts: ids.map(id => ({
    id, text: 'monitoring <script>alert(1)</script>', createdAt: '2026-10-08T12:00:00Z',
    url: `https://x.com/test/status/${id}`, hasMedia: false, metrics: { likes: 6, replies: 0, reposts: 0 },
    account: { id: '1', name: 'Test', label: 'Test', handle: 'test', profileUrl: 'https://x.com/test', profileImageUrl: '', verified: false },
  })),
});
beforeAll(initTestI18n);
beforeEach(() => { vi.useFakeTimers(); vi.mocked(fetchMonitoringFeed).mockReset(); });
afterEach(() => {
  panel?.destroy(); window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.useRealTimers();
});
async function mount(ids = ['1']) {
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(ids));
  panel = new WhosMonitoringPanel();
  const el = panel.getElement(); document.body.append(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 500));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  panel.notifyConnected(); await vi.advanceTimersByTimeAsync(0); return el;
}
function scrollNearEnd(el: HTMLElement) {
  const content = el.querySelector<HTMLElement>('.panel-content')!;
  Object.defineProperties(content, {
    clientHeight: { configurable: true, get: () => 400 },
    scrollHeight: { configurable: true, get: () => el.querySelectorAll('[data-post-id]').length * 600 + 200 },
  });
  content.scrollTop = Math.max(0, content.scrollHeight - content.clientHeight - 100);
  content.dispatchEvent(new Event('scroll'));
  return content;
}

it('has no search subtitle or manual update gate and treats post text as text', async () => {
  const el = await mount();
  expect(el.textContent).not.toContain('“monitoring”');
  expect(el.querySelector('.monitor-feed-update')).toBeNull();
  expect(el.querySelector('[aria-label="Refresh Who\'s Monitoring"]')).toBeNull();
  expect(el.textContent).not.toContain('Load older matches');
  expect(el.querySelector('script')).toBeNull();
  expect(el.textContent).toContain('<script>alert(1)</script>');
});

it('automatically inserts new posts while preserving the visible card and reading offset', async () => {
  const el = await mount(['2', '1']);
  const content = el.querySelector<HTMLElement>('.panel-content')!;
  const anchor = el.querySelector<HTMLElement>('[data-post-id="1"]')!;
  content.scrollTop = 120;
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 200));
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => {
    const index = [...anchor.parentElement!.children].indexOf(anchor);
    return new DOMRect(0, index * 100 - content.scrollTop, 400, 100);
  });
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['3', '2', '1']));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(3);
  expect(el.querySelector('[data-post-id="1"]')).toBe(anchor);
  expect(content.scrollTop).toBe(220);
  expect(anchor.getBoundingClientRect().top).toBe(-20);
});

it('keeps unchanged cards, focused links and timestamps live when only counts change', async () => {
  const el = await mount();
  const card = el.querySelector('.escalation-x-post')!;
  const link = card.querySelector<HTMLAnchorElement>('a')!; link.focus();
  const updated = feed(['1']); updated.posts[0]!.metrics.likes = 42;
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(updated);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(el.querySelector('.escalation-x-post')).toBe(card);
  expect(document.activeElement).toBe(link);
  expect(card.textContent).toContain('42 likes');
});

it('applies queued updates automatically after scrolling settles, without snapping to top', async () => {
  const el = await mount(); const content = el.querySelector<HTMLElement>('.panel-content')!;
  await vi.advanceTimersByTimeAsync(59_900);
  content.scrollTop = 200; content.dispatchEvent(new Event('scroll'));
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['2']));
  await vi.advanceTimersByTimeAsync(100);
  expect(el.querySelector('[data-post-id="1"]')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(80);
  expect(el.querySelector('[data-post-id="2"]')).not.toBeNull();
  expect(content.scrollTop).toBe(200);
});

it('lets a text selection finish before automatically applying new posts', async () => {
  const el = await mount();
  const range = document.createRange(); range.selectNodeContents(el.querySelector('.escalation-x-post-text')!);
  window.getSelection()!.addRange(range);
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['2']));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(el.querySelector('[data-post-id="1"]')).not.toBeNull();
  window.getSelection()!.removeAllRanges(); document.dispatchEvent(new Event('selectionchange'));
  expect(el.querySelector('[data-post-id="2"]')).not.toBeNull();
});

it('preserves loaded older pages and their cursor across automatic refreshes', async () => {
  const el = await mount(['3']);
  vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed(['3', '2'], 'next2'));
  scrollNearEnd(el); await vi.advanceTimersByTimeAsync(1_180);
  expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(2);
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['4', '3'], 'new-first-page-cursor'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect([...el.querySelectorAll<HTMLElement>('[data-post-id]')].map(n => n.dataset.postId)).toEqual(['4', '3', '2']);
  vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed([], 'next3'));
  scrollNearEnd(el); await vi.advanceTimersByTimeAsync(1_180);
  expect(vi.mocked(fetchMonitoringFeed).mock.calls.at(-1)?.[1]).toBe('next2');
  expect(el.textContent).toContain('Scroll for more matches');
});

it('loads a page near the bottom without a button, duplicate cards or overlapping requests', async () => {
  const el = await mount(['3', '2']);
  const content = scrollNearEnd(el);
  content.scrollTop = 0;
  await vi.advanceTimersByTimeAsync(1_180);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(1);
  let resolve!: (value: MonitoringFeed) => void;
  vi.mocked(fetchMonitoringFeed).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  scrollNearEnd(el);
  await vi.advanceTimersByTimeAsync(1_180);
  const readingOffset = content.scrollTop;
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  expect(el.textContent).toContain('Loading more matches');
  for (let i = 0; i < 4; i++) content.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  resolve(feed(['2', '1'], 'page3'));
  await vi.advanceTimersByTimeAsync(0);
  expect([...el.querySelectorAll<HTMLElement>('[data-post-id]')].map(n => n.dataset.postId)).toEqual(['3', '2', '1']);
  expect(content.scrollTop).toBe(readingOffset);
});

it('continues through empty pages and stops at the end of available matches', async () => {
  const el = await mount(['3']);
  vi.mocked(fetchMonitoringFeed)
    .mockResolvedValueOnce(feed([], 'page3'))
    .mockResolvedValueOnce(feed(['2'], null));
  scrollNearEnd(el);
  await vi.advanceTimersByTimeAsync(2_180);
  expect(vi.mocked(fetchMonitoringFeed).mock.calls.map(call => call[1])).toEqual([undefined, 'next', 'page3']);
  expect(el.textContent).toContain('No more matches.');
  scrollNearEnd(el); await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(3);
});

it('does not loop if the service returns the same pagination cursor', async () => {
  const el = await mount();
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed([], 'next'));
  scrollNearEnd(el); await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  expect(el.textContent).toContain('No more matches.');
});

it('automatically retries a failed older page without dropping posts or changing its cursor', async () => {
  const el = await mount(['3']);
  vi.mocked(fetchMonitoringFeed).mockRejectedValueOnce(new Error('Unavailable'));
  scrollNearEnd(el); await vi.advanceTimersByTimeAsync(1_180);
  expect(el.textContent).toContain('Couldn’t load more matches. Retrying automatically');
  expect(el.querySelectorAll('[data-post-id]')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(58_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  vi.mocked(fetchMonitoringFeed).mockImplementation(async (_signal, cursor) => cursor ? feed(['2'], null) : feed(['3']));
  await vi.advanceTimersByTimeAsync(7_000);
  expect(vi.mocked(fetchMonitoringFeed).mock.calls.filter(call => call[1]).map(call => call[1])).toEqual(['next', 'next']);
  expect(el.querySelectorAll('[data-post-id]')).toHaveLength(2);
});

it('pauses pagination in a hidden tab and cancels scheduled loads on destruction', async () => {
  const el = await mount();
  scrollNearEnd(el);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed(['0'], 'page3'));
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  scrollNearEnd(el); panel.destroy();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
});

it('retains loaded posts on errors, pauses hidden tabs and refreshes on return', async () => {
  const el = await mount(); vi.mocked(fetchMonitoringFeed).mockRejectedValue(new Error('Unavailable'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(el.textContent).toContain('Showing saved posts');
  expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await vi.advanceTimersByTimeAsync(120_000); expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['2']));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(3);
  expect(el.querySelector('[data-post-id="2"]')).not.toBeNull();
  panel.destroy(); await vi.advanceTimersByTimeAsync(120_000);
  expect(fetchMonitoringFeed).toHaveBeenCalledTimes(3);
});

it('aborts a stalled request and retries automatically instead of staying locked', async () => {
  const el = await mount();
  vi.mocked(fetchMonitoringFeed).mockImplementationOnce(signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
  }));
  await vi.advanceTimersByTimeAsync(75_000);
  expect(el.textContent).toContain('Retrying automatically');
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['2']));
  await vi.advanceTimersByTimeAsync(45_000);
  expect(el.querySelector('[data-post-id="2"]')).not.toBeNull();
});
