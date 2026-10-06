import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { WhosMonitoringPanel } from '@/components/WhosMonitoringPanel';
import { fetchMonitoringFeed, type MonitoringFeed } from '@/services/monitoring-x-feed';
import { initTestI18n } from './helpers/i18n.mts';
vi.mock('@/services/monitoring-x-feed', () => ({ fetchMonitoringFeed: vi.fn() }));
let panel: WhosMonitoringPanel;
const feed = (ids: string[], nextToken: string | null = 'next'): MonitoringFeed => ({ nextToken, fetchedAt: new Date().toISOString(), posts: ids.map(id => ({ id, text: 'monitoring <script>alert(1)</script>', createdAt: new Date().toISOString(), url: `https://x.com/test/status/${id}`, hasMedia: false, metrics: { likes: 6, replies: 0, reposts: 0 }, account: { id: '1', name: 'Test', label: 'Test', handle: 'test', profileUrl: 'https://x.com/test', profileImageUrl: '', verified: false } })) });
beforeAll(initTestI18n);
beforeEach(() => { vi.useFakeTimers(); vi.mocked(fetchMonitoringFeed).mockReset(); });
afterEach(() => { panel?.destroy(); document.body.replaceChildren(); vi.useRealTimers(); });
async function mount() {
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['1']));
  panel = new WhosMonitoringPanel(); const el = panel.getElement(); document.body.append(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 500));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  panel.notifyConnected(); await vi.advanceTimersByTimeAsync(0); return el;
}
it('keeps the reading position, stages refreshes, escapes text and replaces outdated cards', async () => {
  const el = await mount(); const content = el.querySelector<HTMLElement>('.panel-content')!;
  expect(el.querySelector('script')).toBeNull(); content.scrollTop = 200;
  vi.mocked(fetchMonitoringFeed).mockResolvedValue(feed(['2'])); await vi.advanceTimersByTimeAsync(60_000);
  expect(content.scrollTop).toBe(200); expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(1);
  el.querySelector<HTMLButtonElement>('.monitor-feed-update')!.click();
  expect(el.querySelector('a')?.href).toContain('/2'); expect(content.scrollTop).toBe(0);
});
it('appends older pages once and allows continuing through a zero-match page', async () => {
  const el = await mount(); vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed(['1','2'], 'next2'));
  const older = [...el.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Load older matches')!;
  older.click(); await vi.advanceTimersByTimeAsync(0); expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(2);
  expect(vi.mocked(fetchMonitoringFeed).mock.calls.at(-1)?.[1]).toBe('next');
  vi.mocked(fetchMonitoringFeed).mockResolvedValueOnce(feed([], 'next3')); older.click(); await vi.advanceTimersByTimeAsync(0); expect(older.hidden).toBe(false);
});
it('retains loaded posts after errors and pauses polling when hidden', async () => {
  const el = await mount(); vi.mocked(fetchMonitoringFeed).mockRejectedValue(new Error('Unavailable'));
  await vi.advanceTimersByTimeAsync(60_000); expect(el.textContent).toContain('Showing saved posts'); expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); await vi.advanceTimersByTimeAsync(120_000); expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
  panel.destroy(); await vi.advanceTimersByTimeAsync(120_000); expect(fetchMonitoringFeed).toHaveBeenCalledTimes(2);
});
