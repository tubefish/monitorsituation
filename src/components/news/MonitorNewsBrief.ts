import type { NewsItem } from '@/types';
import { BRIEF_TOPICS, briefTopic, selectMonitorBrief, type BriefTopic } from '../../../shared/monitor-news';

/** DOM-only presentation: no generated summaries, injected markup or extra feed requests. */
export class MonitorNewsBrief {
  readonly element = document.createElement('section');
  private readonly filters = document.createElement('div');
  private readonly stories = document.createElement('div');
  private active: BriefTopic | 'Top stories' = 'Top stories';
  private items: NewsItem[] = [];

  constructor() {
    this.element.className = 'monitor-news-brief';
    this.element.setAttribute('aria-label', 'The Situation Brief');
    const intro = document.createElement('div');
    intro.className = 'monitor-brief-intro';
    const kicker = document.createElement('span');
    kicker.className = 'monitor-brief-kicker';
    kicker.textContent = 'THE SITUATION BRIEF';
    const description = document.createElement('p');
    description.textContent = 'The world. Washington. What’s next.';
    intro.append(kicker, description);
    this.filters.className = 'monitor-brief-filters';
    this.filters.setAttribute('role', 'group');
    this.filters.setAttribute('aria-label', 'Filter news by topic');
    for (const topic of ['Top stories', ...BRIEF_TOPICS] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = topic;
      button.dataset.topic = topic;
      button.addEventListener('click', () => {
        this.active = topic;
        this.render();
      });
      this.filters.append(button);
    }
    this.stories.className = 'monitor-brief-stories';
    this.element.append(intro, this.filters, this.stories);
  }

  update(items: NewsItem[]): NewsItem[] {
    this.items = selectMonitorBrief(items);
    this.render();
    return this.items;
  }

  private render(): void {
    for (const button of this.filters.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.topic === this.active));
    }
    const visible = this.items.filter(item => this.active === 'Top stories' || briefTopic(item) === this.active);
    const fragment = document.createDocumentFragment();
    visible.forEach((item, index) => {
      const headline = item.title.replace(/\s+[-–|]\s+(Reuters|AP News|BBC(?: News)?|CNN)$/i, '');
      const article = document.createElement('article');
      article.className = 'monitor-brief-story';
      if (index === 0) article.classList.add('monitor-brief-lead');
      const topic = document.createElement('span');
      topic.className = 'monitor-brief-topic';
      topic.textContent = briefTopic(item);
      const heading = document.createElement('h3');
      const link = document.createElement('a');
      link.href = item.link; // selectMonitorBrief admits only absolute HTTP(S) URLs.
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = headline;
      heading.append(link);
      article.append(topic, heading);
      const excerpt = item.snippet?.trim() ?? '';
      const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      // Google News descriptions often contain only the headline + publisher.
      // Do not present that duplicate text as a meaningful summary.
      if (excerpt && !normalize(excerpt).startsWith(normalize(headline))) {
        const summary = document.createElement('p');
        summary.className = 'monitor-brief-summary';
        summary.textContent = excerpt;
        article.append(summary);
      }
      const meta = document.createElement('div');
      meta.className = 'monitor-brief-meta';
      const source = document.createElement('span');
      source.textContent = item.source;
      const time = document.createElement('time');
      const published = new Date(item.pubDate);
      time.dateTime = published.toISOString();
      time.title = published.toLocaleString();
      const minutes = Math.max(0, Math.floor((Date.now() - published.getTime()) / 60_000));
      time.textContent = minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
      meta.append(source, time);
      article.append(meta);
      fragment.append(article);
    });
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'monitor-brief-empty';
      empty.textContent = this.active === 'Top stories'
        ? 'No fresh headlines available. New stories will appear when sources update.'
        : `No fresh ${this.active} stories in this update. Try Top stories.`;
      fragment.append(empty);
    }
    this.stories.replaceChildren(fragment);
  }
}
