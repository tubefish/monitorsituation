import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscalationCorrelationPanel } from '@/components/EscalationCorrelationPanel';
import { fetchEscalationXFeed } from '@/services/escalation-x-feed';
import { initTestI18n } from './helpers/i18n.mts';

vi.mock('@/services/escalation-x-feed', () => ({ fetchEscalationXFeed: vi.fn(), X_FEED_POLL_INTERVAL_MS: 60_000 }));
let panel: EscalationCorrelationPanel | null = null;
beforeAll(initTestI18n);
beforeEach(() => { vi.useFakeTimers(); vi.mocked(fetchEscalationXFeed).mockClear(); });
afterEach(() => { panel?.destroy(); panel = null; document.body.replaceChildren(); vi.useRealTimers(); });

function respond(newPosts = false, fail = false): void {
  vi.mocked(fetchEscalationXFeed).mockImplementation(async handle => {
    if (fail) throw new Error('Temporary outage');
    return {
      account: { id: handle, label: handle, name: handle, handle, profileUrl: `https://x.com/${handle}`, profileImageUrl: '', verified: false },
      fetchedAt: new Date().toISOString(),
      posts: (newPosts ? ['new', 'old'] : ['old']).map(id => ({ id: `${handle}-${id}`, text: `${handle} ${id} post`, createdAt: new Date().toISOString(), url: `https://x.com/${handle}/status/1`, hasMedia: false, metrics: { likes: 0, replies: 0, reposts: 0 } })),
    };
  });
}

async function mount() {
  respond();
  panel = new EscalationCorrelationPanel();
  const el = panel.getElement();
  document.body.append(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 500));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  panel.notifyConnected();
  await vi.advanceTimersByTimeAsync(0);
  expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(9);
  return el;
}

describe('X Tracker automatic updates', () => {
  it('shows new posts after one minute when the reader is at the top', async () => {
    const el = await mount();
    respond(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
    expect(el.querySelector<HTMLButtonElement>('.monitor-feed-update')!.hidden).toBe(true);
    expect(fetchEscalationXFeed).toHaveBeenCalledTimes(18);
  });

  it('preserves cards and scroll while reading, then applies updates on returning to the top', async () => {
    const el = await mount();
    const first = el.querySelector('.escalation-x-post');
    const content = el.querySelector<HTMLElement>('.panel-content')!;
    content.scrollTop = 180;
    respond(true);
    await vi.advanceTimersByTimeAsync(60_000);
    const update = el.querySelector<HTMLButtonElement>('.monitor-feed-update')!;
    expect(update.hidden).toBe(false);
    expect(update.textContent).toContain('9 new posts');
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(9);
    expect(el.querySelector('.escalation-x-post')).toBe(first);
    expect(content.scrollTop).toBe(180);
    content.scrollTop = 0;
    content.dispatchEvent(new Event('scroll'));
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
    expect(update.hidden).toBe(true);
    respond(false, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(el.querySelector('.monitor-feed-notice')?.textContent).toContain('previously loaded');
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
    expect(el.querySelector('.escalation-x-live')?.textContent).toBe('OFFLINE');
  });

  it('preserves keyboard focus on a post until updates are explicitly requested', async () => {
    const el = await mount();
    const post = el.querySelector<HTMLElement>('.escalation-x-post')!;
    post.focus();
    respond(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.activeElement).toBe(post);
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(9);
    el.querySelector<HTMLButtonElement>('.monitor-feed-update')!.click();
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
  });

  it('pauses hidden tabs and offscreen panels and clears polling on destroy', async () => {
    const el = await mount();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchEscalationXFeed).toHaveBeenCalledTimes(9);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -600, 400, 500));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchEscalationXFeed).toHaveBeenCalledTimes(9);
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 500));
    respond(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
    panel!.destroy(); panel = null;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchEscalationXFeed).toHaveBeenCalledTimes(18);
  });
});
