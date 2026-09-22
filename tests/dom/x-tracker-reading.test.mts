import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EscalationCorrelationPanel } from '@/components/EscalationCorrelationPanel';
import { fetchEscalationXFeed } from '@/services/escalation-x-feed';
import { initTestI18n } from './helpers/i18n.mts';

vi.mock('@/services/escalation-x-feed', () => ({ fetchEscalationXFeed: vi.fn() }));
let panel: EscalationCorrelationPanel | null = null;
beforeAll(initTestI18n);
afterEach(() => { panel?.destroy(); panel = null; document.body.replaceChildren(); });

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

describe('X Tracker reading stability', () => {
  it('holds incoming posts until requested and retains the original cards and scroll position', async () => {
    respond();
    panel = new EscalationCorrelationPanel();
    document.body.append(panel.getElement()); panel.notifyConnected();
    const el = panel.getElement();
    await vi.waitFor(() => expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(9));
    const first = el.querySelector('.escalation-x-post');
    const content = el.querySelector<HTMLElement>('.panel-content')!;
    content.scrollTop = 180;
    respond(true);
    el.querySelector<HTMLButtonElement>('.monitor-feed-refresh')!.click();
    const update = el.querySelector<HTMLButtonElement>('.monitor-feed-update')!;
    await vi.waitFor(() => expect(update.hidden).toBe(false));
    expect(update.textContent).toContain('9 new posts');
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(9);
    expect(el.querySelector('.escalation-x-post')).toBe(first);
    expect(content.scrollTop).toBe(180);
    update.click();
    await vi.waitFor(() => expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18));
    expect(content.scrollTop).toBe(0);
    expect(update.hidden).toBe(true);
    respond(false, true);
    el.querySelector<HTMLButtonElement>('.monitor-feed-refresh')!.click();
    await vi.waitFor(() => expect(el.querySelector('.monitor-feed-notice')?.textContent).toContain('previously loaded'));
    expect(el.querySelectorAll('.escalation-x-post')).toHaveLength(18);
    expect(el.querySelector('.escalation-x-live')?.textContent).toBe('OFFLINE');
  });
});
