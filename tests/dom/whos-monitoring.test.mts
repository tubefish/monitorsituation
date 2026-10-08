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
const olderButton = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Load older matches')!;

it('has no search subtitle or manual update gate and treats post text as text', async () => {
  const el = await mount();
  expect(el.textContent).not.toContain('“monitoring”');
  expect(el.querySelector('.monitor-feed-update')).toBeNull();
  expect(el.querySelector('[aria-label="Refresh Who\'s Monitoring"]')).toBeNull();
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
  olderButton(el).click(); await vi.advanceTimersByTimeAsync(0);
  expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(2);
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['4', '3'], 'new-first-page-cursor'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect([...el.querySelectorAll<HTMLElement>('[data-post-id]')].map(n => n.dataset.postId)).toEqual(['4', '3', '2']);
  vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed([], 'next3'));
  olderButton(el).click(); await vi.advanceTimersByTimeAsync(0);
  expect(vi.mocked(fetchMonitoringFeed).mock.calls.at(-1)?.[1]).toBe('next2');
  expect(olderButton(el).hidden).toBe(false);
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
