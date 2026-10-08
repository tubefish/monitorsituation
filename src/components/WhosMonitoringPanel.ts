import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';
import { buildXPost, updateXPostMetadata } from './x-post-card';
import { fetchMonitoringFeed, type MonitoringFeed, type MonitoringPost } from '@/services/monitoring-x-feed';
import { formatXTime } from '@/services/x-intel';

const POLL_MS = 60_000;
const SCROLL_IDLE_MS = 180;

export class WhosMonitoringPanel extends Panel {
  private posts: MonitoringPost[] = [];
  private olderPosts: MonitoringPost[] = [];
  private nextToken: string | null = null;
  private paged = false;
  private pending: MonitoringFeed | null = null;
  private fetchedAt = '';
  private lastAttempt = -Infinity;
  private loading = false;
  private inViewport = true;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private applyTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: IntersectionObserver | null = null;
  private readonly cards = new Map<string, { node: HTMLElement; signature: string }>();
  private readonly status: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly older: HTMLButtonElement;
  private readonly list: HTMLElement;

  constructor() {
    super({ id: 'whos-monitoring', title: "Who's Monitoring", className: 'panel-wide escalation-monitor-panel', defaultRowSpan: 3 });
    this.status = h('span', { className: 'escalation-x-updated', role: 'status' }, 'Connecting to X…');
    this.retry = h('button', { type: 'button', className: 'monitor-feed-refresh', onClick: () => void this.load() }, 'Retry') as HTMLButtonElement;
    this.retry.hidden = true;
    this.older = h('button', { type: 'button', className: 'monitor-feed-refresh', onClick: () => void this.load(true) }, 'Load older matches') as HTMLButtonElement;
    this.older.hidden = true;
    this.list = h('div', { className: 'escalation-x-posts' });
    // Anchor explicitly around keyed updates; native anchoring would apply twice.
    this.content.style.overflowAnchor = 'none';
    this.setContentNodes(
      h('div', { className: 'escalation-x-account-bar' },
        h('span', { className: 'escalation-x-live', title: 'Updates automatically every minute' },
          h('span', { className: 'escalation-x-live-dot' }), 'LIVE'),
        h('div', { className: 'escalation-x-status' }, this.status, this.retry)),
      this.list, this.older,
    );
    const resume = () => { if (this.visible()) this.refreshIfStale(); };
    document.addEventListener('visibilitychange', resume, { signal: this.signal });
    window.addEventListener('focus', resume, { signal: this.signal });
    window.addEventListener('online', resume, { signal: this.signal });
    document.addEventListener('selectionchange', () => this.applyPending(), { signal: this.signal });
    this.content.addEventListener('scroll', () => {
      // Let the gesture finish before moving cards. No DOM work in the scroll handler.
      if (this.applyTimer) clearTimeout(this.applyTimer);
      this.applyTimer = setTimeout(() => {
        this.applyTimer = null;
        this.applyPending();
      }, SCROLL_IDLE_MS);
    }, { passive: true, signal: this.signal });
    this.runWhenConnected(() => {
      if (typeof IntersectionObserver !== 'undefined') {
        this.observer = new IntersectionObserver(([entry]) => {
          this.inViewport = Boolean(entry?.isIntersecting);
          resume();
        });
        this.observer.observe(this.element);
      }
      void this.load();
      // The cheap clock check also catches an off-screen panel returning between polls.
      this.timer = setInterval(resume, 5_000);
    });
  }

  private visible(): boolean {
    if (document.visibilityState !== 'visible' || !this.inViewport) return false;
    if (this.observer) return true;
    const rect = this.element.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  private refreshIfStale(): void {
    if (Date.now() - this.lastAttempt >= POLL_MS) void this.load();
  }

  private applyPending(): void {
    if (!this.pending || this.applyTimer || this.signal.aborted) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && this.list.contains(selection.anchorNode)) return;
    const feed = this.pending;
    this.pending = null;
    this.apply(feed, false);
  }

  private apply(feed: MonitoringFeed, append: boolean): void {
    if (append) {
      const ids = new Set(this.posts.map(post => post.id));
      const added = feed.posts.filter(post => !ids.has(post.id));
      this.olderPosts.push(...added);
      this.posts.push(...added);
      this.paged = true;
      this.nextToken = feed.nextToken;
    } else {
      const ids = new Set(feed.posts.map(post => post.id));
      this.olderPosts = this.olderPosts.filter(post => !ids.has(post.id));
      this.posts = [...feed.posts, ...this.olderPosts];
      // A fresh first page must not reset the cursor for pages already being read.
      if (!this.paged) this.nextToken = feed.nextToken;
      this.fetchedAt = feed.fetchedAt;
    }
    const ids = new Set(this.posts.map(post => post.id));
    const scrollTop = this.content.scrollTop;
    const viewportTop = this.content.getBoundingClientRect().top;
    // Prefer a surviving visible card. If it disappeared, keep the next survivor
    // at its current offset instead of jumping back to the beginning.
    const anchor = scrollTop > 0 ? [...this.list.children].find(node =>
      node instanceof HTMLElement && ids.has(node.dataset.postId || '')
      && node.getBoundingClientRect().bottom > viewportTop) as HTMLElement | undefined : undefined;
    const anchorId = anchor?.dataset.postId;
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top - viewportTop : 0;
    const active = document.activeElement;
    this.list.querySelector('.empty-state, .escalation-x-error')?.remove();
    for (const [id, card] of this.cards) {
      if (ids.has(id)) continue;
      card.node.remove();
      this.cards.delete(id);
    }
    let cursor = this.list.firstElementChild;
    for (const post of this.posts) {
      // Counts and relative timestamps change often; update those in place.
      const signature = JSON.stringify({ ...post, metrics: undefined });
      let card = this.cards.get(post.id);
      if (!card || (card.signature !== signature && !card.node.contains(active))) {
        const node = buildXPost(post.account, post);
        node.dataset.postId = post.id;
        if (card) {
          if (cursor === card.node) cursor = node;
          card.node.replaceWith(node);
        }
        card = { node, signature };
        this.cards.set(post.id, card);
      }
      updateXPostMetadata(card.node, post);
      if (card.node !== cursor) this.list.insertBefore(card.node, cursor);
      cursor = card.node.nextElementSibling;
    }
    this.older.hidden = !this.nextToken;
    if (!this.posts.length) {
      this.list.append(h('div', { className: 'empty-state' }, this.nextToken
        ? 'No matches in this batch. More posts are available below.'
        : 'No matching posts yet. Checking automatically.'));
    }
    const nextAnchor = anchorId ? this.cards.get(anchorId)?.node : undefined;
    this.content.scrollTop = nextAnchor
      ? scrollTop + nextAnchor.getBoundingClientRect().top - viewportTop - anchorOffset
      : scrollTop;
    this.status.textContent = `Updated ${formatXTime(this.fetchedAt || feed.fetchedAt)} ago`;
  }

  private async load(append = false): Promise<void> {
    if (this.loading || this.signal.aborted || (append && !this.nextToken)) return;
    this.loading = true;
    if (!append) this.lastAttempt = Date.now();
    this.retry.disabled = this.older.disabled = true;
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), 15_000);
    try {
      const feed = await fetchMonitoringFeed(this.controller.signal, append ? this.nextToken! : undefined);
      if (this.signal.aborted) return;
      this.retry.hidden = true;
      if (append) this.apply(feed, true);
      else {
        this.pending = feed;
        this.applyPending();
      }
    } catch (error) {
      if (this.signal.aborted) return;
      this.status.textContent = this.fetchedAt ? 'Retrying automatically · Showing saved posts' : 'Retrying automatically';
      this.retry.hidden = false;
      if (!this.fetchedAt) this.list.replaceChildren(h('div', { className: 'escalation-x-error', role: 'status' },
        error instanceof Error && error.name !== 'AbortError' ? error.message : 'X is taking longer than usual.'));
    } finally {
      clearTimeout(timeout);
      this.loading = false;
      this.retry.disabled = this.older.disabled = false;
    }
  }

  override destroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.applyTimer) clearTimeout(this.applyTimer);
    this.observer?.disconnect();
    this.controller?.abort();
    this.pending = null;
    this.cards.clear();
    super.destroy();
  }
}
