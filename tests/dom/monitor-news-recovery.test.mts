import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initTestI18n } from './helpers/i18n.mts';

const mocks = vi.hoisted(() => ({ topic: vi.fn(), timeline: vi.fn(), articles: vi.fn() }));
vi.mock('@/services/gdelt-intel', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/gdelt-intel')>(),
  fetchTopicIntelligence: mocks.topic,
  fetchTopicTimeline: mocks.timeline,
  fetchGdeltArticles: mocks.articles,
}));
import { GdeltIntelPanel } from '@/components/GdeltIntelPanel';
import { EconomicCorrelationPanel } from '@/components/EconomicCorrelationPanel';
import type { Panel } from '@/components/Panel';

const panels: Panel[] = [];
const article = (title: string) => ({ title, source: 'Reuters', url: 'https://example.com/news', date: '20260908T090000Z' });
function mount<T extends Panel>(panel: T): T {
  panels.push(panel);
  document.body.append(panel.getElement());
  panel.notifyConnected();
  return panel;
}
beforeAll(initTestI18n);
beforeEach(() => {
  mocks.topic.mockReset();
  mocks.timeline.mockReset().mockResolvedValue(null);
  mocks.articles.mockReset();
});
afterEach(() => {
  for (const panel of panels.splice(0)) panel.destroy();
  document.body.replaceChildren();
});

it('shows headlines even when the optional GDELT timeline never resolves', async () => {
  mocks.topic.mockResolvedValue({ articles: [article('Military headline')], fetchedAt: new Date() });
  mocks.timeline.mockReturnValue(new Promise(() => {}));
  const panel = mount(new GdeltIntelPanel());
  await vi.waitFor(() => expect(panel.getElement().textContent).toContain('Military headline'));
  expect(panel.getElement().querySelector('.panel-loading')).toBeNull();
});

it('retains successful headlines during a failed refresh', async () => {
  mocks.topic.mockResolvedValue({ articles: [article('Latest intelligence')], fetchedAt: new Date() });
  const panel = mount(new GdeltIntelPanel());
  await vi.waitFor(() => expect(panel.getElement().textContent).toContain('Latest intelligence'));
  mocks.topic.mockRejectedValue(new Error('upstream unavailable'));
  await panel.refresh();
  expect(panel.getElement().textContent).toContain('Latest intelligence');
});

it('does not let a slow previous topic overwrite the selected tab', async () => {
  let resolveFirst!: (data: unknown) => void;
  mocks.topic.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }));
  mocks.topic.mockResolvedValue({ articles: [article('Cyber headline')], fetchedAt: new Date() });
  const panel = mount(new GdeltIntelPanel());
  (panel.getElement().querySelector('[data-topic-id="cyber"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(panel.getElement().textContent).toContain('Cyber headline'));
  resolveFirst({ articles: [article('Old military headline')], fetchedAt: new Date() });
  await Promise.resolve();
  expect(panel.getElement().textContent).not.toContain('Old military headline');
});

it('Iran Watch waits for mounting and displays successful searches when another fails', async () => {
  mocks.articles.mockRejectedValueOnce(new Error('one search failed'));
  mocks.articles.mockResolvedValue([article('Iran diplomatic talks resume')]);
  const panel = new EconomicCorrelationPanel();
  expect(mocks.articles).not.toHaveBeenCalled();
  mount(panel);
  await vi.waitFor(() => expect(panel.getElement().textContent).toContain('Iran diplomatic talks resume'));
  expect(panel.getElement().querySelectorAll('.iran-watch-item')).toHaveLength(1);
});

it('Iran Watch displays a retryable error instead of an empty success on total failure', async () => {
  mocks.articles.mockRejectedValue(new Error('RSS unavailable'));
  const panel = mount(new EconomicCorrelationPanel());
  await vi.waitFor(() => expect(panel.getElement().textContent).toContain('Iran news temporarily unavailable'));
});
