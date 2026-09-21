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

interface XAccountTab {
  label: string;
  handle: string;
}

const NEW_POST_THRESHOLD_MS = 30 * 60 * 1000;

export const ESCALATION_X_ACCOUNTS: readonly XAccountTab[] = [
  { label: 'Monitoring', handle: 'monitoringmeme' },
  { label: 'OSINTdefender', handle: 'sentdefender' },
  { label: 'Open Source Intel', handle: 'osint613' },
  { label: 'OSINTtechnical', handle: 'osinttechnical' },
  { label: 'WW3 Monitor', handle: 'ww3_monitor' },
];

export class EscalationCorrelationPanel extends Panel {
  private activeAccount = ESCALATION_X_ACCOUNTS[0]!;
  private tabsEl: HTMLElement;
  private requestController: AbortController | null = null;
  private renderGeneration = 0;

  constructor() {
    super({
      id: 'escalation-correlation',
      title: 'X Account Tracking',
      className: 'panel-wide escalation-monitor-panel',
      defaultRowSpan: 2,
    });

    this.tabsEl = this.createTabs();
    this.element.insertBefore(this.tabsEl, this.content);
    this.runWhenConnected(() => void this.loadActiveAccount());
  }

  private createTabs(): HTMLElement {
    return h('div', {
      className: 'panel-tabs escalation-x-tabs',
      role: 'tablist',
      'aria-label': 'X account feeds',
    }, ...ESCALATION_X_ACCOUNTS.map(account =>
      h('button', {
        className: `panel-tab ${account.handle === this.activeAccount.handle ? 'active' : ''}`,
        dataset: { accountHandle: account.handle },
        role: 'tab',
        'aria-selected': account.handle === this.activeAccount.handle ? 'true' : 'false',
        title: `${account.label} (@${account.handle})`,
        onClick: () => this.selectAccount(account),
      }, h('span', { className: 'tab-label' }, account.label)),
    ));
  }

  private selectAccount(account: XAccountTab): void {
    if (account.handle === this.activeAccount.handle) return;
    this.activeAccount = account;
    this.tabsEl.querySelectorAll<HTMLElement>('.panel-tab').forEach(tab => {
      const active = tab.dataset.accountHandle === account.handle;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    void this.loadActiveAccount();
  }

  private async loadActiveAccount(): Promise<void> {
    const account = this.activeAccount;
    const generation = ++this.renderGeneration;
    this.requestController?.abort();
    this.requestController = new AbortController();
    this.renderLoading(account);

    try {
      const feed = await fetchEscalationXFeed(account.handle, this.requestController.signal);
      if (this.signal.aborted || generation !== this.renderGeneration) return;
      this.renderFeed(feed);
    } catch (error) {
      if (this.signal.aborted || generation !== this.renderGeneration || this.requestController.signal.aborted) return;
      this.renderError(account, error instanceof Error ? error.message : 'X feed is temporarily unavailable');
    }
  }

  private renderLoading(account: XAccountTab): void {
    this.setContentNodes(
      this.buildAccountHeader({
        id: '', label: account.label, name: account.label, handle: account.handle,
        profileUrl: `https://x.com/${account.handle}`, profileImageUrl: '', verified: false,
      }, null),
      h('div', { className: 'escalation-x-loading', 'aria-label': `Loading posts from ${account.label}` },
        ...Array.from({ length: 4 }, () => h('div', { className: 'escalation-x-skeleton' },
          h('span', { className: 'escalation-x-skeleton-meta' }),
          h('span', { className: 'escalation-x-skeleton-line' }),
          h('span', { className: 'escalation-x-skeleton-line short' }),
        )),
      ),
    );
  }

  private renderFeed(feed: EscalationXFeed): void {
    this.setContentNodes(
      this.buildAccountHeader(feed.account, feed.fetchedAt),
      feed.posts.length
        ? h('div', { className: 'escalation-x-posts' }, ...feed.posts.map(post => this.buildPost(feed.account, post)))
        : h('div', { className: 'empty-state escalation-x-empty' }, 'No recent original posts were returned for this account.'),
    );
  }

  private buildAccountHeader(account: EscalationXAccount, fetchedAt: string | null): HTMLElement {
    const avatar = account.profileImageUrl
      ? h('img', { className: 'escalation-x-avatar', src: sanitizeUrl(account.profileImageUrl), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : h('span', { className: 'escalation-x-avatar escalation-x-avatar-fallback', 'aria-hidden': 'true' }, account.label.slice(0, 1));

    return h('div', { className: 'escalation-x-account-bar' },
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
      h('div', { className: 'escalation-x-status' },
        h('span', { className: 'escalation-x-live' }, h('span', { className: 'escalation-x-live-dot' }), 'LIVE'),
        fetchedAt ? h('span', { className: 'escalation-x-updated' }, `Updated ${formatXTime(fetchedAt)} ago`) : null,
        h('a', { className: 'escalation-x-profile-link', href: sanitizeUrl(account.profileUrl), target: '_blank', rel: 'noopener noreferrer' }, 'View profile ↗'),
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

    return h('article', { className: `escalation-x-post ${isNew ? 'is-new' : ''}` },
      h('div', { className: 'escalation-x-post-rail', 'aria-hidden': 'true' }),
      h('div', { className: 'escalation-x-post-body' },
        h('div', { className: 'escalation-x-post-meta' },
          h('span', { className: 'escalation-x-signal-label' }, 'X SIGNAL'),
          isNew ? h('span', { className: 'escalation-x-new-badge' }, 'NEW') : null,
          h('span', { className: 'escalation-x-post-time' }, `${formatXTime(post.createdAt)} ago`),
        ),
        h('p', { className: 'escalation-x-post-text' }, post.text),
        h('div', { className: 'escalation-x-post-footer' },
          h('span', { className: 'escalation-x-post-stats' }, stats.join(' · ')),
          h('a', { className: 'escalation-x-open-post', href: sanitizeUrl(post.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open post by ${account.name} on X` }, 'OPEN POST ↗'),
        ),
      ),
    );
  }

  private renderError(account: XAccountTab, message: string): void {
    this.setContentNodes(
      this.buildAccountHeader({
        id: '', label: account.label, name: account.label, handle: account.handle,
        profileUrl: `https://x.com/${account.handle}`, profileImageUrl: '', verified: false,
      }, null),
      h('div', { className: 'escalation-x-error', role: 'status' },
        h('strong', {}, 'Feed unavailable'),
        h('span', {}, message),
        h('button', { className: 'escalation-x-retry', type: 'button', onClick: () => void this.loadActiveAccount() }, 'Try again'),
      ),
    );
  }

  override destroy(): void {
    this.requestController?.abort();
    this.renderGeneration += 1;
    super.destroy();
  }
}
