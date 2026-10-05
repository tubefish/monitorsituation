import { Panel } from './Panel';
import { RUSSIA_DISEASE_WATCH as focus } from '@/config/disease-watch';
import { diseaseGroup, emptyDiseaseWatch, fetchDiseaseWatch } from '@/services/disease-watch';
import type { DiseaseWatchData, DiseaseWatchFeed, DiseaseWatchReport } from '@/types/disease-watch';
import '@/styles/disease-watch.css';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function link(label: string, href: string): HTMLAnchorElement {
  const element = node('a', 'dw-link', label);
  try {
    const url = new URL(href);
    if (url.protocol === 'https:') element.href = url.href;
  } catch { /* Invalid upstream URLs are rendered as text. */ }
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}
function date(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(value);
}
function checked(value: number): string {
  return `${date(value)} · ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(value)} UTC`;
}

export class DiseaseWatchPanel extends Panel {
  private data: DiseaseWatchData = emptyDiseaseWatch();
  private busy = false;
  private disposed = false;
  private failed = false;
  private timer: ReturnType<typeof setInterval>;
  private events = new AbortController();
  private refresh = node('button', 'dw-refresh', 'Refresh');
  private connection = node('span', 'dw-connection', 'Checking sources…');
  private russiaStatus = node('p', 'dw-source-status');
  private russiaReports = node('div', 'dw-report-list');
  private globalStatus = node('p', 'dw-source-status');
  private globalReports = node('div', 'dw-global-grid');
  private reviewStatus = node('p', 'dw-review');
  private search = node('input', 'dw-search');
  private diseases = node('select', 'dw-select');
  private period = node('select', 'dw-select');
  private count = node('span', 'dw-report-count');

  constructor() {
    super({ id: 'disease-outbreaks', title: 'Disease Watch', className: 'panel-wide disease-watch-panel', defaultRowSpan: 3, showCount: false });
    const root = node('div', 'disease-watch');
    const toolbar = node('div', 'dw-toolbar');
    const label = node('span', 'dw-eyebrow', 'HEALTH INTELLIGENCE');
    this.connection.setAttribute('role', 'status');
    this.refresh.type = 'button';
    this.refresh.addEventListener('click', () => void this.fetchData(true), { signal: this.events.signal });
    toolbar.append(label, this.connection, this.refresh);

    const lead = node('section', 'dw-lead');
    lead.setAttribute('aria-label', 'Russia priority watch');
    const main = node('div', 'dw-lead-main');
    const badges = node('div', 'dw-badges');
    badges.append(node('span', 'dw-priority', 'PRIORITY WATCH / RUSSIA'), node('span', 'dw-status', focus.status));
    main.append(badges, node('h2', 'dw-title', focus.title), node('p', 'dw-location', focus.location), node('p', 'dw-summary', focus.summary));
    const sources = node('div', 'dw-sources');
    focus.sources.forEach(source => sources.append(link(`${source.name} ↗`, source.url)));
    main.append(this.reviewStatus, sources);
    const figure = node('figure', 'dw-map');
    const image = node('img');
    image.src = '/images/russia-disease-watch.svg';
    image.alt = 'Irkutsk in southeastern Russia';
    image.width = 560;
    image.height = 270;
    figure.append(image, node('figcaption', '', 'Location reference only · not a map of disease spread. Natural Earth.'));
    lead.append(main, figure);

    const facts = node('div', 'dw-facts');
    focus.facts.forEach(fact => {
      const card = node('div', 'dw-fact');
      card.append(node('span', 'dw-eyebrow', fact.label), node('strong', '', fact.value), node('p', '', fact.detail));
      facts.append(card);
    });
    const timeline = node('section', 'dw-timeline');
    timeline.append(node('h3', '', 'What we know so far'));
    const timelineList = node('ol');
    focus.timeline.forEach(item => {
      const row = node('li');
      const body = node('div');
      body.append(node('strong', '', item.title), node('p', '', item.description), link(`${item.source} ↗`, item.url));
      row.append(node('span', 'dw-timeline-date', item.date), body);
      timelineList.append(row);
    });
    timeline.append(timelineList);

    const latest = node('section', 'dw-latest');
    latest.append(node('h3', '', 'Latest Russia reporting'), node('p', 'dw-note', 'Media reports · headlines do not establish a diagnosis. Updates are checked every 5 minutes while this panel is visible.'), this.russiaStatus, this.russiaReports);
    const global = node('section', 'dw-global');
    const globalHeader = node('div', 'dw-section-header');
    globalHeader.append(node('h3', '', 'Elsewhere in the world'), this.count);
    const controls = node('div', 'dw-filters');
    this.search.type = 'search';
    this.search.placeholder = 'Search disease or location';
    this.search.setAttribute('aria-label', 'Search global disease reports');
    this.diseases.setAttribute('aria-label', 'Filter disease');
    this.period.setAttribute('aria-label', 'Report publication window');
    [[180, 'Past 6 months'], [90, 'Past 90 days'], [30, 'Past 30 days']].forEach(([value, label]) => {
      const option = node('option', '', String(label)); option.value = String(value); this.period.append(option);
    });
    [this.search, this.diseases, this.period].forEach(control => control.addEventListener(control === this.search ? 'input' : 'change', () => this.renderGlobal(), { signal: this.events.signal }));
    controls.append(this.search, this.diseases, this.period);
    global.append(globalHeader, node('p', 'dw-note', 'WHO Disease Outbreak News · official bulletins, not a real-time case census. Publication dates may lag events; coverage is not exhaustive.'), controls, this.globalStatus, this.globalReports, link('View all WHO outbreak bulletins ↗', 'https://www.who.int/emergencies/disease-outbreak-news'));
    root.append(toolbar, lead, facts, timeline, latest, global);
    this.setContentNodes(root);
    this.render();
    void this.fetchData();
    this.timer = setInterval(() => {
      if (!document.hidden && this.isVisible()) void this.fetchData(true);
      this.renderReview();
    }, 300_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isVisible()) void this.fetchData();
    }, { signal: this.events.signal });
  }

  private isVisible(): boolean {
    if (!this.element.isConnected || this.element.classList.contains('hidden')) return false;
    const rect = this.element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  public async fetchData(force = false): Promise<boolean> {
    if (this.busy || this.disposed) return false;
    this.busy = true;
    this.refresh.disabled = true;
    this.refresh.textContent = 'Checking…';
    this.connection.textContent = 'Checking sources…';
    if (!this.data.russia.fetchedAt) this.russiaStatus.textContent = 'Checking Russia reporting…';
    if (!this.data.global.fetchedAt) this.globalStatus.textContent = 'Checking WHO bulletins…';
    try {
      const data = await fetchDiseaseWatch(force);
      if (this.disposed) return false;
      // Partial source failures retain the previous successful timestamp. Never
      // convert a failed refresh into an empty, fresh-looking feed.
      for (const key of ['russia', 'global'] as const) {
        const previous = this.data[key];
        this.data[key] = data[key].status === 'unavailable' && previous.fetchedAt && Date.now() - previous.fetchedAt <= 86_400_000
          ? { ...previous, status: 'stale' } : data[key];
      }
      this.failed = false;
      return data.russia.status === 'ok' || data.global.status === 'ok';
    } catch {
      this.failed = true;
      for (const key of ['russia', 'global'] as const) {
        const previous = this.data[key];
        this.data[key] = previous.fetchedAt && Date.now() - previous.fetchedAt <= 86_400_000
          ? { ...previous, status: 'stale' } : emptyDiseaseWatch()[key];
      }
      return false;
    } finally {
      this.busy = false;
      if (!this.disposed) {
        this.refresh.disabled = false;
        this.refresh.textContent = 'Refresh';
        this.render();
      }
    }
  }

  private renderReview(): void {
    const old = Date.now() - focus.reviewedAt > 86_400_000;
    this.reviewStatus.textContent = `${old ? 'Dated assessment — check newer reporting below. ' : ''}Reviewed ${checked(focus.reviewedAt)}. Feed refreshes do not re-verify this assessment.`;
    this.reviewStatus.classList.toggle('dw-review-old', old);
  }

  private feedStatus(feed: DiseaseWatchFeed): string {
    if (feed.status === 'unavailable') return 'Source unavailable. Try Refresh or open the source directly.';
    const stale = feed.status === 'stale' || Date.now() - feed.fetchedAt > 900_000;
    return `${stale ? 'Refresh delayed · last successful check' : 'Last successful check'} ${checked(feed.fetchedAt)}`;
  }

  private reportCard(report: DiseaseWatchReport, global: boolean): HTMLElement {
    const card = node('article', 'dw-report');
    const meta = node('div', 'dw-report-meta');
    meta.append(node('span', 'dw-source-tag', global ? diseaseGroup(report.title) : report.source), node('span', '', global ? date(report.publishedAt) : checked(report.publishedAt)));
    const heading = node('h4');
    heading.append(link(report.title, report.url));
    card.append(meta, heading, node('span', 'dw-report-kind', global ? 'WHO bulletin ↗' : 'Media report ↗'));
    return card;
  }

  private render(): void {
    this.renderReview();
    this.connection.textContent = this.busy ? 'Checking sources…' : this.failed || [this.data.russia, this.data.global].some(feed => feed.status !== 'ok') ? 'Some sources unavailable' : 'Auto-refresh · 5 min';
    this.russiaStatus.textContent = this.feedStatus(this.data.russia);
    const reports = this.data.russia.reports;
    this.russiaReports.replaceChildren(...(reports.length ? reports.map(report => this.reportCard(report, false)) : [node('p', 'dw-empty', this.busy ? 'Checking the latest Russia reports…' : 'No recent reports available from the selected publishers. The dated assessment and source links above remain available.') ]));
    const selected = this.diseases.value;
    const all = node('option', '', 'All diseases'); all.value = '';
    this.diseases.replaceChildren(all);
    [...new Set(this.data.global.reports.map(report => diseaseGroup(report.title)))].sort().forEach(group => {
      const option = node('option', '', group); option.value = group; this.diseases.append(option);
    });
    if (Array.from(this.diseases.options).some(option => option.value === selected)) this.diseases.value = selected;
    this.renderGlobal();
  }

  private renderGlobal(): void {
    const query = this.search.value.trim().toLowerCase();
    const cutoff = Date.now() - Number(this.period.value || 180) * 86_400_000;
    const reports = this.data.global.reports.filter(report => report.publishedAt >= cutoff
      && (!query || report.title.toLowerCase().includes(query))
      && (!this.diseases.value || diseaseGroup(report.title) === this.diseases.value));
    this.globalStatus.textContent = this.feedStatus(this.data.global);
    this.count.textContent = `${reports.length} bulletins`;
    this.globalReports.replaceChildren(...(reports.length ? reports.map(report => this.reportCard(report, true)) : [node('p', 'dw-empty', this.data.global.status === 'unavailable' ? 'WHO bulletins are temporarily unavailable.' : 'No bulletins match these filters. This does not mean there are no outbreaks.') ]));
  }

  public override destroy(): void {
    this.disposed = true;
    clearInterval(this.timer);
    this.events.abort();
    super.destroy();
  }
}
