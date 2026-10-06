import { h } from '@/utils/dom-utils';
import { sanitizeUrl } from '@/utils/sanitize';
import { formatXTime } from '@/services/x-intel';
import type { EscalationXAccount, EscalationXPost } from '@/services/escalation-x-feed';

const NEW_POST_THRESHOLD_MS = 30 * 60 * 1000;

export function buildXPost(account: EscalationXAccount, post: EscalationXPost): HTMLElement {
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

