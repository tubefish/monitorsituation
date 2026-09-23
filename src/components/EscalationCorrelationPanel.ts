import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';
import { sanitizeUrl } from '@/utils/sanitize';
import { formatXTime } from '@/services/x-intel';
import {
  fetchEscalationXFeed,
  X_FEED_POLL_INTERVAL_MS,
  type EscalationXAccount,
  type EscalationXFeed,
  type EscalationXPost,
} from '@/services/escalation-x-feed';

interface XAccountSource {
  label: string;
  handle: string;
}

const NEW_POST_THRESHOLD_MS = 30 * 60 * 1000;

export const ESCALATION_X_ACCOUNTS: readonly XAccountSource[] = [
  { label: 'Monitoring', handle: 'monitoringmeme' },
  { label: 'OSINTdefender', handle: 'sentdefender' },
  { label: 'Open Source Intel', handle: 'osint613' },
  { label: 'OSINTtechnical', handle: 'osinttechnical' },
  { label: 'WW3 Monitor', handle: 'ww3_monitor' },
  { label: 'Polymarket', handle: 'polymarket' },
  { label: 'Rapid Response 47', handle: 'rapidresponse47' },
  { label: 'ZeroHedge', handle: 'zerohedge' },
  { label: 'Watcher.Guru', handle: 'watcherguru' },
];

export class EscalationCorrelationPanel extends Panel {
  private requestController: AbortController | null = null;
  private renderGeneration = 0;
  private displayedFeeds: EscalationXFeed[] = [];
  private pendingFeed: { feeds: EscalationXFeed[]; failedCount: number } | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private updateButton: HTMLButtonElement;
  private notice: HTMLElement;

  constructor() {
    super({
      id: 'escalation-correlation',
      title: 'X Tracker',
      className: 'panel-wide escalation-monitor-panel',
      defaultRowSpan: 3,
    });

    this.updateButton = h('button', { type: 'button', className: 'monitor-feed-update' }) as HTMLButtonElement;
    this.updateButton.hidden = true;
    this.updateButton.addEventListener('click', () => this.showPendingFeed(), { signal: this.signal });
    this.content.addEventListener('scroll', () => {
      if (this.canShowUpdates()) this.showPendingFeed();
    }, { passive: true, signal: this.signal });
    document.addEventListener('visibilitychange', () => {
      if (this.isFeedVisible()) void this.loadCombinedFeed();
    }, { signal: this.signal });
    this.notice = h('div', { className: 'monitor-feed-notice', role: 'status' });
    this.notice.hidden = true;
    this.content.before(this.notice, this.updateButton);
    this.runWhenConnected(() => {
      void this.loadCombinedFeed();
      // Poll visible feeds once a minute; the shared CDN cache bounds X reads.
      this.pollTimer = setInterval(() => {
        if (this.isFeedVisible()) void this.loadCombinedFeed();
      }, X_FEED_POLL_INTERVAL_MS);
    });
  }

  private isFeedVisible(): boolean {
    const rect = this.element.getBoundingClientRect();
    return document.visibilityState === 'visible' && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  private canShowUpdates(): boolean {
    const selection = window.getSelection();
    const readingSelection = selection && !selection.isCollapsed && this.content.contains(selection.anchorNode);
    return this.content.scrollTop < 40 && !this.content.contains(document.activeElement) && !readingSelection;
  }

  private showPendingFeed(): void {
    if (!this.pendingFeed) return;
    const pending = this.pendingFeed;
    this.pendingFeed = null;
    this.updateButton.hidden = true;
    this.renderFeed(pending.feeds, pending.failedCount);
    this.content.scrollTop = 0;
  }

  private async loadCombinedFeed(showLatest = false): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    const generation = ++this.renderGeneration;
    this.requestController?.abort();
    this.requestController = new AbortController();
    if (!this.displayedFeeds.length) this.renderLoading();
    this.element.querySelectorAll<HTMLButtonElement>('.monitor-feed-refresh').forEach(button => { button.disabled = true; });

    try {
      const results = await Promise.allSettled(
        ESCALATION_X_ACCOUNTS.map(account => fetchEscalationXFeed(account.handle, this.requestController!.signal)),
      );
      if (this.signal.aborted || generation !== this.renderGeneration || this.requestController.signal.aborted) return;

      const feeds: EscalationXFeed[] = [];
      let firstError = 'X feeds are temporarily unavailable';
      let failedCount = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          feeds.push(result.value);
          continue;
        }
        failedCount += 1;
        if (result.reason instanceof Error && result.reason.message) firstError = result.reason.message;
      }

      if (feeds.length === 0) {
        this.renderError(firstError);
        return;
      }

      this.notice.hidden = failedCount === 0;
      this.notice.textContent = failedCount ? `${failedCount} source${failedCount === 1 ? '' : 's'} could not refresh. Previously loaded posts are retained.` : '';
      const receivedHandles = new Set(feeds.map(feed => feed.account.handle));
      const combined = [...feeds, ...this.displayedFeeds.filter(feed => !receivedHandles.has(feed.account.handle))];
      if (!this.displayedFeeds.length) this.renderFeed(combined, failedCount);
      else {
        const shown = new Set(this.displayedFeeds.flatMap(feed => feed.posts.map(post => post.id)));
        const newCount = combined.flatMap(feed => feed.posts).filter(post => !shown.has(post.id)).length;
        if (newCount > 0 && (showLatest || this.canShowUpdates())) {
          this.pendingFeed = { feeds: combined, failedCount };
          this.showPendingFeed();
          return;
        }
        this.pendingFeed = newCount > 0 ? { feeds: combined, failedCount } : null;
        this.updateButton.textContent = newCount ? `${newCount} new post${newCount === 1 ? '' : 's'} · Show updates` : 'Feed refreshed · Show latest';
        this.updateButton.hidden = newCount === 0;
        // Keep the current cards, focus, selection and scroll position intact.
        const oldHeader = this.content.querySelector('.escalation-x-account-bar');
        const restoreRefreshFocus = oldHeader?.contains(document.activeElement);
        const header = this.buildCombinedHeader(feeds.length, failedCount, this.oldestFetchTime(combined));
        oldHeader?.replaceWith(header);
        if (restoreRefreshFocus) header.querySelector<HTMLButtonElement>('.monitor-feed-refresh')?.focus();
      }
    } catch (error) {
      if (this.signal.aborted || generation !== this.renderGeneration || this.requestController.signal.aborted) return;
      this.renderError(error instanceof Error ? error.message : 'X feeds are temporarily unavailable');
    } finally {
      this.refreshing = false;
      this.element.querySelectorAll<HTMLButtonElement>('.monitor-feed-refresh').forEach(button => { button.disabled = false; });
    }
  }

  private renderLoading(): void {
    this.setContentNodes(
      this.buildCombinedHeader(0, 0, null),
      h('div', { className: 'escalation-x-loading', 'aria-label': 'Loading posts from tracked X accounts' },
        ...Array.from({ length: 4 }, () => h('div', { className: 'escalation-x-skeleton' },
          h('span', { className: 'escalation-x-skeleton-meta' }),
          h('span', { className: 'escalation-x-skeleton-line' }),
          h('span', { className: 'escalation-x-skeleton-line short' }),
        )),
      ),
    );
  }

  private oldestFetchTime(feeds: EscalationXFeed[]): string | null {
    const times = feeds.map(feed => Date.parse(feed.fetchedAt)).filter(Number.isFinite);
    return times.length ? new Date(Math.min(...times)).toISOString() : null;
  }

  private renderFeed(feeds: EscalationXFeed[], failedCount: number): void {
    this.displayedFeeds = feeds;
    const posts = feeds
      .flatMap(feed => feed.posts.map(post => ({ account: feed.account, post })))
      .sort((a, b) => Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt));
    const fetchedAt = this.oldestFetchTime(feeds);

    this.setContentNodes(
      this.buildCombinedHeader(feeds.length, failedCount, fetchedAt),
      posts.length
        ? h('div', { className: 'escalation-x-posts' }, ...posts.map(({ account, post }) => this.buildPost(account, post)))
        : h('div', { className: 'empty-state escalation-x-empty' }, 'No recent original posts were returned from the tracked accounts.'),
    );
  }

  private buildCombinedHeader(loadedCount: number, failedCount: number, fetchedAt: string | null): HTMLElement {
    return h('div', { className: 'escalation-x-account-bar' },
      h('div', { className: 'escalation-x-identity' },
        h('span', { className: 'escalation-x-avatar escalation-x-avatar-fallback', 'aria-hidden': 'true' }, 'X'),
      ),
      h('div', { className: 'escalation-x-status' },
        loadedCount > 0
          ? h('span', { className: 'escalation-x-live' }, h('span', { className: 'escalation-x-live-dot' }), fetchedAt && Date.now() - Date.parse(fetchedAt) < 600_000 ? 'LIVE' : 'CACHED')
          : h('span', { className: 'escalation-x-updated' }, 'Loading feeds…'),
        fetchedAt ? h('span', { className: 'escalation-x-updated', title: 'Checks automatically every minute while this panel is visible' }, `Updated ${formatXTime(fetchedAt)} ago · Auto 1m`) : null,
        failedCount > 0
          ? h('span', { className: 'escalation-x-updated' }, `${failedCount} source${failedCount === 1 ? '' : 's'} unavailable`)
          : null,
        h('button', { type: 'button', className: 'monitor-feed-refresh', onClick: () => void this.loadCombinedFeed(true), 'aria-label': 'Refresh X Tracker' }, 'Refresh'),
      ),
    );
  }

  private buildPost(account: EscalationXAccount, post: EscalationXPost): HTMLElement {
    const createdMs = Date.parse(post.createdAt);
    const isNew = Number.isFinite(createdMs) && Date.now() - createdMs < NEW_POST_THRESHOLD_MS;
    const stats = [
      post.hasMedia ? 'MEDIA' : '',
      post.metrics.reposts ? `${post.metrics.reposts.toLocaleString()} reposts` : '',
      post.metrics.likes ? `${post.metrics.likes.toLocaleString()} likes` : '',
    ].filter(Boolean);
    const postUrl = sanitizeUrl(post.url);
    const openPost = () => window.open(postUrl, '_blank', 'noopener,noreferrer');
    const avatar = account.profileImageUrl
      ? h('img', { className: 'escalation-x-avatar', src: sanitizeUrl(account.profileImageUrl), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : h('span', { className: 'escalation-x-avatar escalation-x-avatar-fallback', 'aria-hidden': 'true' }, account.label.slice(0, 1));

    return h('article', {
      className: `escalation-x-post ${isNew ? 'is-new' : ''}`,
      role: 'link',
      tabindex: '0',
      'aria-label': `Open post by ${account.name} on X`,
      style: { cursor: 'pointer' },
      onClick: (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('a, button')) return;
        openPost();
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openPost();
      },
    },
      h('div', { className: 'escalation-x-post-rail', 'aria-hidden': 'true' }),
      h('div', { className: 'escalation-x-post-body' },
        h('div', { className: 'escalation-x-post-meta' },
          h('div', { className: 'escalation-x-identity' },
            avatar,
            h('div', { className: 'escalation-x-account-copy' },
              h('div', { className: 'escalation-x-name-row' },
                h('strong', { className: 'escalation-x-name' }, account.name || account.label),
                account.verified ? h('span', { className: 'escalation-x-verified', title: 'Verified on X', 'aria-label': 'Verified on X' }, '✓') : null,
              ),
              h('span', { className: 'escalation-x-handle' }, `@${account.handle}`),
            ),
          ),
          isNew ? h('span', { className: 'escalation-x-new-badge' }, 'NEW') : null,
          h('span', { className: 'escalation-x-post-time' }, `${formatXTime(post.createdAt)} ago`),
        ),
        h('p', { className: 'escalation-x-post-text' }, post.text),
        h('div', { className: 'escalation-x-post-footer' },
          h('span', { className: 'escalation-x-post-stats' }, stats.join(' · ')),
          h('a', { className: 'escalation-x-open-post', href: postUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open post by ${account.name} on X` }, 'View on X ↗'),
        ),
      ),
    );
  }

  private renderError(message: string): void {
    if (this.displayedFeeds.length) {
      this.notice.hidden = false;
      this.notice.replaceChildren(
        h('span', {}, 'Could not refresh. Showing previously loaded posts. '),
        h('button', { type: 'button', className: 'monitor-feed-refresh', onClick: () => void this.loadCombinedFeed(true) }, 'Retry'),
      );
      this.content.querySelector('.escalation-x-live')?.replaceChildren(document.createTextNode('OFFLINE'));
      return;
    }
    const header = this.buildCombinedHeader(0, ESCALATION_X_ACCOUNTS.length, null);
    const status = header.querySelector('.escalation-x-updated');
    if (status) status.textContent = 'Unavailable';
    this.setContentNodes(
      header,
      h('div', { className: 'escalation-x-error', role: 'status' },
        h('strong', {}, 'Feeds unavailable'),
        h('span', {}, message),
        h('button', { className: 'escalation-x-retry', type: 'button', onClick: () => void this.loadCombinedFeed(true) }, 'Try again'),
      ),
    );
  }

  override destroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pendingFeed = null;
    this.requestController?.abort();
    this.renderGeneration += 1;
    super.destroy();
  }
}
