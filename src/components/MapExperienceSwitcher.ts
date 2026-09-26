import { GlobalChat } from './GlobalChat';

const WINGBITS_URL = 'https://wingbits.com/map?utm_source=MTS&utm_medium=referral&utm_campaign=MTS-map&lat=29.76460&lon=-95.36570&zoom=4.0';
const STORAGE_KEY = 'monitor-map-experience-v1';

export type MapExperienceMode = 'situation' | 'flights' | 'news' | 'chat';

export interface LocationNewsItem {
  lat: number;
  lon: number;
  title: string;
  location: string;
  threatLevel: string;
  timestamp?: Date;
  url?: string;
}

export class MapExperienceSwitcher {
  private readonly root = document.createElement('div');
  private readonly overlayHost = document.createElement('div');
  private readonly flightStage = document.createElement('div');
  private readonly newsStage = document.createElement('aside');
  private readonly newsList = document.createElement('div');
  private readonly chat = new GlobalChat(() => this.setMode('situation'));
  private readonly listeners = new AbortController();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly buttons = new Map<MapExperienceMode, HTMLButtonElement>();
  private news: LocationNewsItem[] = [];

  constructor(
    private readonly mapSection: HTMLElement,
    private readonly mapContainer: HTMLElement,
    private readonly onSelectLocation: (item: LocationNewsItem) => void,
  ) {
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.syncOverlayBounds());
    this.root.className = 'map-experience-switcher';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Choose map view');

    const options: Array<{ mode: MapExperienceMode; label: string; icon: string }> = [
      { mode: 'situation', label: 'Situation', icon: '◎' },
      { mode: 'flights', label: 'Flights', icon: '✈' },
      { mode: 'news', label: 'Top news', icon: '▤' },
      { mode: 'chat', label: 'Chat', icon: '◉' },
    ];
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mapExperience = option.mode;
      button.innerHTML = `<span aria-hidden="true">${option.icon}</span><span>${option.label}</span>`;
      button.addEventListener('click', () => this.setMode(option.mode), { signal: this.listeners.signal });
      this.buttons.set(option.mode, button);
      this.root.append(button);
    }

    this.overlayHost.className = 'map-experience-overlay-host';
    this.overlayHost.setAttribute('aria-live', 'polite');

    this.flightStage.className = 'map-experience-stage map-experience-flights';
    this.flightStage.hidden = true;
    this.flightStage.setAttribute('aria-label', 'Wingbits live flight map');
    const flightEyebrow = document.createElement('span');
    flightEyebrow.className = 'map-experience-flight-eyebrow';
    flightEyebrow.textContent = 'WINGBITS · LIVE';
    const flightTitle = document.createElement('strong');
    flightTitle.textContent = 'Follow live air traffic';
    const flightCopy = document.createElement('p');
    flightCopy.textContent = 'Open the full Wingbits map for live aircraft, flight details, weather, and receiver coverage.';
    const flightFeatures = document.createElement('span');
    flightFeatures.className = 'map-experience-flight-features';
    flightFeatures.textContent = 'Aircraft · Weather · Stations';
    const flightLink = document.createElement('a');
    flightLink.className = 'map-experience-flight-link';
    flightLink.href = WINGBITS_URL;
    flightLink.target = '_blank';
    flightLink.rel = 'noopener noreferrer';
    flightLink.textContent = 'Open live flight map ↗';
    this.flightStage.append(flightEyebrow, flightTitle, flightCopy, flightFeatures, flightLink);

    this.newsStage.className = 'map-experience-stage map-experience-news';
    this.newsStage.hidden = true;
    this.newsStage.setAttribute('aria-label', 'Top news by location');
    const newsHeader = document.createElement('header');
    const newsTitle = document.createElement('strong');
    newsTitle.textContent = 'Top news by location';
    const newsHint = document.createElement('span');
    newsHint.textContent = 'Select a story to focus the map';
    newsHeader.append(newsTitle, newsHint);
    this.newsList.className = 'map-experience-news-list';
    this.newsStage.append(newsHeader, this.newsList);

    this.overlayHost.append(this.flightStage, this.newsStage, this.chat.element);
    this.mapSection.append(this.overlayHost, this.root);
    this.resizeObserver?.observe(this.mapSection);
    this.resizeObserver?.observe(this.mapContainer);
    window.addEventListener('resize', () => this.syncOverlayBounds(), { signal: this.listeners.signal });
    this.syncOverlayBounds();
    this.renderNews();
    this.setMode(this.readStoredMode(), false);
  }

  public setLocationNews(items: LocationNewsItem[]): void {
    const seen = new Set<string>();
    this.news = [...items]
      .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0))
      .filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .slice(0, 20);
    this.renderNews();
  }

  public destroy(): void {
    this.listeners.abort();
    this.resizeObserver?.disconnect();
    this.chat.destroy();
    this.root.remove();
    this.overlayHost.remove();
    this.mapSection.classList.remove('map-experience-flights-active', 'map-experience-news-active', 'map-experience-chat-active');
  }

  private readStoredMode(): MapExperienceMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'flights' || stored === 'news' || stored === 'chat' ? stored : 'situation';
    } catch {
      return 'situation';
    }
  }

  private syncOverlayBounds(): void {
    this.overlayHost.style.top = `${this.mapContainer.offsetTop}px`;
    this.overlayHost.style.left = `${this.mapContainer.offsetLeft}px`;
    this.overlayHost.style.width = `${this.mapContainer.offsetWidth}px`;
    this.overlayHost.style.height = `${this.mapContainer.offsetHeight}px`;
  }

  private setMode(mode: MapExperienceMode, persist = true): void {
    this.flightStage.hidden = mode !== 'flights';
    this.newsStage.hidden = mode !== 'news';
    this.chat.setActive(mode === 'chat');
    this.mapSection.classList.toggle('map-experience-flights-active', mode === 'flights');
    this.mapSection.classList.toggle('map-experience-news-active', mode === 'news');
    this.mapSection.classList.toggle('map-experience-chat-active', mode === 'chat');
    for (const [key, button] of this.buttons) {
      const active = key === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* optional preference */ }
    }
    if (mode !== 'flights') window.dispatchEvent(new Event('resize'));
  }

  private renderNews(): void {
    if (this.news.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'map-experience-news-empty';
      empty.textContent = 'Location headlines are loading…';
      this.newsList.replaceChildren(empty);
      return;
    }
    const cards = this.news.slice(0, 12).map(item => {
      const article = document.createElement('article');
      const focus = document.createElement('button');
      focus.type = 'button';
      focus.className = 'map-experience-news-focus';
      const meta = document.createElement('span');
      meta.className = `map-experience-news-meta threat-${item.threatLevel}`;
      meta.textContent = item.location;
      const title = document.createElement('strong');
      title.textContent = item.title;
      focus.append(meta, title);
      focus.addEventListener('click', () => this.onSelectLocation(item), { signal: this.listeners.signal });
      article.append(focus);
      if (item.url) {
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Open story: ${item.title}`);
        link.textContent = '↗';
        article.append(link);
      }
      return article;
    });
    this.newsList.replaceChildren(...cards);
  }
}
