import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';
import { buildXPost } from './x-post-card';
import { fetchMonitoringFeed, type MonitoringFeed, type MonitoringPost } from '@/services/monitoring-x-feed';
import { formatXTime } from '@/services/x-intel';

export class WhosMonitoringPanel extends Panel {
  private posts: MonitoringPost[] = [];
  private nextToken: string | null = null;
  private pending: MonitoringFeed | null = null;
  private fetchedAt = '';
  private loading = false;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly status: HTMLElement;
  private readonly updates: HTMLButtonElement;
  private readonly refresh: HTMLButtonElement;
  private readonly older: HTMLButtonElement;
  private readonly list: HTMLElement;

  constructor() {
    super({ id: 'whos-monitoring', title: "Who's Monitoring", className: 'panel-wide escalation-monitor-panel', defaultRowSpan: 3 });
    this.status = h('span', { className: 'escalation-x-updated', role: 'status' }, 'Searching X…');
    this.updates = h('button', { type: 'button', className: 'monitor-feed-update', onClick: () => this.applyPending() }) as HTMLButtonElement;
    this.updates.hidden = true;
    this.content.before(this.updates);
    this.refresh = h('button', { type: 'button', className: 'monitor-feed-refresh', 'aria-label': "Refresh Who's Monitoring", onClick: () => void this.load(false, true) }, 'Refresh') as HTMLButtonElement;
    this.older = h('button', { type: 'button', className: 'monitor-feed-refresh', onClick: () => void this.load(true) }, 'Load older matches') as HTMLButtonElement;
    this.older.hidden = true;
    this.list = h('div', { className: 'escalation-x-posts' });
    this.setContentNodes(
      h('div', { className: 'escalation-x-account-bar' },
        h('div', { className: 'escalation-x-identity' }, h('strong', {}, '“monitoring”')),
        h('div', { className: 'escalation-x-status' }, this.status, this.refresh)),
      h('p', { className: 'escalation-x-updated' }, 'Recent posts on X · Newest first · Auto 1m'),
      this.list, this.older,
    );
    document.addEventListener('visibilitychange', () => { if (this.visible()) void this.load(); }, { signal: this.signal });
    this.content.addEventListener('scroll', () => { if (this.canUpdate()) this.applyPending(); }, { passive: true, signal: this.signal });
    this.runWhenConnected(() => {
      void this.load();
      this.timer = setInterval(() => { if (this.visible()) void this.load(); }, 60_000);
    });
  }

  private visible(): boolean {
    const rect = this.element.getBoundingClientRect();
    return document.visibilityState === 'visible' && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  private canUpdate(): boolean {
    const selection = window.getSelection();
    return this.content.scrollTop < 40 && !this.list.contains(document.activeElement)
      && !(selection && !selection.isCollapsed && this.list.contains(selection.anchorNode));
  }

  private applyPending(): void {
    if (!this.pending) return;
    const feed = this.pending;
    this.pending = null;
    this.updates.hidden = true;
    this.apply(feed, false);
    this.content.scrollTop = 0;
  }

  private apply(feed: MonitoringFeed, append: boolean): void {
    const ids = new Set(this.posts.map(post => post.id));
    if (append) {
      const added = feed.posts.filter(post => !ids.has(post.id));
      this.posts.push(...added);
      this.list.querySelector('.empty-state')?.remove();
      this.list.append(...added.map(post => buildXPost(post.account, post)));
    } else {
      // Refresh replaces the current window so falling-like/deleted posts disappear.
      this.posts = feed.posts;
      this.list.replaceChildren(...this.posts.map(post => buildXPost(post.account, post)));
      this.fetchedAt = feed.fetchedAt;
    }
    this.nextToken = feed.nextToken;
    this.older.hidden = !this.nextToken;
    if (!this.posts.length && !this.list.querySelector('.empty-state')) {
      this.list.append(h('div', { className: 'empty-state' }, this.nextToken
        ? 'No matching posts in this batch. Load older matches to keep searching.'
        : 'No matching posts found in X’s recent search window.'));
    }
    this.status.textContent = `Updated ${formatXTime(this.fetchedAt || feed.fetchedAt)} ago`;
  }

  private async load(append = false, explicit = false): Promise<void> {
    if (this.loading || (append && !this.nextToken)) return;
    this.loading = true;
    this.refresh.disabled = this.older.disabled = true;
    this.controller = new AbortController();
    try {
      const feed = await fetchMonitoringFeed(this.controller.signal, append ? this.nextToken! : undefined);
      if (this.signal.aborted) return;
      if (append) this.apply(feed, true);
      else if (explicit || !this.fetchedAt || this.canUpdate()) {
        this.pending = null;
        this.updates.hidden = true;
        this.apply(feed, false);
        if (explicit) this.content.scrollTop = 0;
      } else {
        this.pending = feed;
        const ids = new Set(this.posts.map(post => post.id));
        const count = feed.posts.filter(post => !ids.has(post.id)).length;
        this.updates.textContent = count ? `${count} new post${count === 1 ? '' : 's'} · Show updates` : 'Feed refreshed · Show latest';
        this.updates.hidden = false;
        this.status.textContent = 'Updates ready';
      }
    } catch (error) {
      if (this.signal.aborted) return;
      this.status.textContent = this.fetchedAt ? 'Could not refresh · Showing saved posts' : 'Search unavailable';
      if (!this.fetchedAt) this.list.replaceChildren(h('div', { className: 'escalation-x-error', role: 'status' }, error instanceof Error ? error.message : 'Try refreshing shortly.'));
    } finally {
      this.loading = false;
      this.refresh.disabled = this.older.disabled = false;
    }
  }

  override destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort();
    this.pending = null;
    super.destroy();
  }
}
