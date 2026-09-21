import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';
import { sanitizeUrl } from '@/utils/sanitize';
import { formatXTime } from '@/services/x-intel';
import {
  fetchEscalationXFeed,
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
];

export class EscalationCorrelationPanel extends Panel {
  private requestController: AbortController | null = null;
  private renderGeneration = 0;

  constructor() {
    super({
      id: 'escalation-correlation',
      title: 'X Tracker',
      className: 'panel-wide escalation-monitor-panel',
      defaultRowSpan: 2,
    });

    this.runWhenConnected(() => void this.loadCombinedFeed());
  }

  private async loadCombinedFeed(): Promise<void> {
    const generation = ++this.renderGeneration;
    this.requestController?.abort();
    this.requestController = new AbortController();
    this.renderLoading();

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

      this.renderFeed(feeds, failedCount);
    } catch (error) {
      if (this.signal.aborted || generation !== this.renderGeneration || this.requestController.signal.aborted) return;
      this.renderError(error instanceof Error ? error.message : 'X feeds are temporarily unavailable');
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

  private renderFeed(feeds: EscalationXFeed[], failedCount: number): void {
    const posts = feeds
      .flatMap(feed => feed.posts.map(post => ({ account: feed.account, post })))
      .sort((a, b) => Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt));
    const fetchedAt = feeds[0]?.fetchedAt ?? null;

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
          ? h('span', { className: 'escalation-x-live' }, h('span', { className: 'escalation-x-live-dot' }), 'LIVE')
          : h('span', { className: 'escalation-x-updated' }, 'Loading feeds…'),
        fetchedAt ? h('span', { className: 'escalation-x-updated' }, `Updated ${formatXTime(fetchedAt)} ago`) : null,
        failedCount > 0
          ? h('span', { className: 'escalation-x-updated' }, `${failedCount} source${failedCount === 1 ? '' : 's'} unavailable`)
          : null,
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
          h('a', { className: 'escalation-x-open-post', href: postUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open post by ${account.name} on X` }, 'OPEN POST ↗'),
        ),
      ),
    );
  }

  private renderError(message: string): void {
    this.setContentNodes(
      this.buildCombinedHeader(0, ESCALATION_X_ACCOUNTS.length, null),
      h('div', { className: 'escalation-x-error', role: 'status' },
        h('strong', {}, 'Feeds unavailable'),
        h('span', {}, message),
        h('button', { className: 'escalation-x-retry', type: 'button', onClick: () => void this.loadCombinedFeed() }, 'Try again'),
      ),
    );
  }

  override destroy(): void {
    this.requestController?.abort();
    this.renderGeneration += 1;
    super.destroy();
  }
}
