import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';

interface XAccount {
  label: string;
  handle: string;
}

interface XWidgetsApi {
  widgets: {
    load: (element?: HTMLElement) => void;
  };
}

declare global {
  interface Window {
    twttr?: XWidgetsApi;
  }
}

const X_WIDGET_SCRIPT_ID = 'x-widgets-script';
const X_WIDGET_SCRIPT_URL = 'https://platform.twitter.com/widgets.js';
const X_WIDGET_LOAD_TIMEOUT_MS = 12_000;
const X_TIMELINE_RENDER_TIMEOUT_MS = 8_000;

export const ESCALATION_X_ACCOUNTS: readonly XAccount[] = [
  { label: 'Monitoring the Situation', handle: 'monitoringmeme' },
  { label: 'OSINTdefender', handle: 'sentdefender' },
  { label: 'Open Source Intel', handle: 'osint613' },
  { label: 'OSINTtechnical', handle: 'osinttechnical' },
  { label: 'WW3 Monitor', handle: 'ww3_monitor' },
];

let widgetsPromise: Promise<XWidgetsApi> | null = null;

function loadXWidgets(): Promise<XWidgetsApi> {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise<XWidgetsApi>((resolve, reject) => {
    const existing = document.getElementById(X_WIDGET_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (!window.twttr?.widgets) {
        settled = true;
        widgetsPromise = null;
        reject(new Error('X timeline widget did not initialize'));
        return;
      }
      settled = true;
      resolve(window.twttr);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      widgetsPromise = null;
      reject(new Error('X timeline widget could not be loaded'));
    };

    const timeout = window.setTimeout(fail, X_WIDGET_LOAD_TIMEOUT_MS);
    const clearAndFinish = () => {
      window.clearTimeout(timeout);
      finish();
    };
    const clearAndFail = () => {
      window.clearTimeout(timeout);
      fail();
    };

    script.addEventListener('load', clearAndFinish, { once: true });
    script.addEventListener('error', clearAndFail, { once: true });

    if (!existing) {
      script.id = X_WIDGET_SCRIPT_ID;
      script.src = X_WIDGET_SCRIPT_URL;
      script.async = true;
      script.charset = 'utf-8';
      document.head.appendChild(script);
    }
  });

  return widgetsPromise;
}

export class EscalationCorrelationPanel extends Panel {
  private activeAccount = ESCALATION_X_ACCOUNTS[0]!;
  private tabsEl: HTMLElement;
  private renderGeneration = 0;

  constructor() {
    super({
      id: 'escalation-correlation',
      title: 'Escalation Monitor',
      className: 'panel-wide',
      defaultRowSpan: 2,
      infoTooltip: 'Live public posts from selected OSINT and situation-monitoring accounts on X. Choose an account tab to view its latest timeline.',
    });

    this.tabsEl = this.createTabs();
    this.element.insertBefore(this.tabsEl, this.content);
    this.runWhenConnected(() => this.renderActiveTimeline());
  }

  private createTabs(): HTMLElement {
    return h(
      'div',
      {
        className: 'panel-tabs escalation-x-tabs',
        role: 'tablist',
        'aria-label': 'X account timelines',
      },
      ...ESCALATION_X_ACCOUNTS.map(account =>
        h(
          'button',
          {
            className: `panel-tab ${account.handle === this.activeAccount.handle ? 'active' : ''}`,
            dataset: { accountHandle: account.handle },
            role: 'tab',
            'aria-selected': account.handle === this.activeAccount.handle ? 'true' : 'false',
            title: `${account.label} (@${account.handle})`,
            onClick: () => this.selectAccount(account),
          },
          h('span', { className: 'tab-label' }, account.label),
        ),
      ),
    );
  }

  private selectAccount(account: XAccount): void {
    if (account.handle === this.activeAccount.handle) return;
    this.activeAccount = account;

    this.tabsEl.querySelectorAll<HTMLElement>('.panel-tab').forEach(tab => {
      const active = tab.dataset.accountHandle === account.handle;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    this.renderActiveTimeline();
  }

  private renderActiveTimeline(): void {
    const account = this.activeAccount;
    const generation = ++this.renderGeneration;
    const profileUrl = `https://x.com/${account.handle}`;

    const timeline = h(
      'a',
      {
        className: 'twitter-timeline',
        href: profileUrl,
        dataset: {
          chrome: 'noheader nofooter noborders transparent',
          dnt: 'true',
          height: '430',
          theme: this.currentWidgetTheme(),
          tweetLimit: '8',
        },
      },
      `Posts by ${account.label}`,
    );

    const shell = h(
      'div',
      {
        className: 'escalation-x-timeline',
        style: 'min-height:360px;overflow:auto;padding:0 6px;',
      },
      timeline,
    );

    this.setContentNodes(shell);

    void loadXWidgets()
      .then(api => {
        if (this.signal.aborted || generation !== this.renderGeneration) return;
        api.widgets.load(shell);
        window.setTimeout(() => {
          if (
            this.signal.aborted
            || generation !== this.renderGeneration
            || !shell.isConnected
            || shell.querySelector('iframe')
          ) return;
          this.renderEmbedFallback(account);
        }, X_TIMELINE_RENDER_TIMEOUT_MS);
      })
      .catch(() => {
        if (this.signal.aborted || generation !== this.renderGeneration) return;
        this.renderEmbedFallback(account);
      });
  }

  private currentWidgetTheme(): 'dark' | 'light' {
    const root = document.documentElement;
    const theme = root.dataset.theme ?? root.getAttribute('data-theme');
    return theme === 'light' ? 'light' : 'dark';
  }

  private renderEmbedFallback(account: XAccount): void {
    this.setContentNodes(
      h(
        'div',
        {
          className: 'empty-state',
          style: 'padding:24px 16px;text-align:center;',
        },
        h('div', { style: 'margin-bottom:10px;' }, `X could not load @${account.handle}'s embedded timeline.`),
        h(
          'a',
          {
            href: `https://x.com/${account.handle}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: 'color:var(--accent);',
          },
          'Open this account on X →',
        ),
      ),
    );
  }

  override destroy(): void {
    this.renderGeneration += 1;
    super.destroy();
  }
}
