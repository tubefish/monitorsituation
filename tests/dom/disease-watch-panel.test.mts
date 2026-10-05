import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from './helpers/i18n.mts';
const { fetchData } = vi.hoisted(() => ({ fetchData: vi.fn() }));
vi.mock('@/services/disease-watch', async importOriginal => ({ ...await importOriginal<typeof import('@/services/disease-watch')>(), fetchDiseaseWatch: fetchData }));
import { DiseaseWatchPanel } from '@/components/DiseaseWatchPanel';

const panels: DiseaseWatchPanel[] = [];
const report = (title: string, source = 'WHO', url = 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON618') => ({ id: title, title, source, url, publishedAt: Date.now() - 60_000 });
const payload = () => ({
  russia: { status: 'ok', fetchedAt: Date.now(), reports: [report('Russia plague report remains unconfirmed', 'Reuters')] },
  global: { status: 'ok', fetchedAt: Date.now(), reports: [report('Ebola - DRC'), report('Cholera - Global')] },
});
beforeAll(async () => { await initTestI18n(); });
afterEach(() => { panels.splice(0).forEach(panel => panel.destroy()); document.body.replaceChildren(); fetchData.mockReset(); });
async function mount() {
  fetchData.mockResolvedValue(payload());
  const panel = new DiseaseWatchPanel(); panels.push(panel); document.body.append(panel.getElement());
  await vi.waitFor(() => expect(panel.getElement().querySelector('.dw-connection')?.textContent).toContain('Auto-refresh'));
  return panel;
}
describe('Russia-first disease watch', () => {
  it('leads with the unconfirmed assessment and never presents observation counts as cases', async () => {
    const panel = await mount();
    const root = panel.getElement();
    expect(root.querySelector('h2')?.textContent).toBe('Pneumonic plague reports');
    expect(root.querySelector('.dw-status')?.textContent).toBe('Diagnosis unconfirmed');
    expect(root.querySelector('.dw-facts')?.textContent).toContain('Do not interpret people under observation as confirmed cases');
    expect(root.querySelector('.dw-review')?.textContent).toContain('5 Oct 2026');
    expect(root.querySelectorAll('.dw-report').length).toBe(3);
  });
  it('filters other diseases without hiding Russia or losing the search input focus', async () => {
    const panel = await mount(); const root = panel.getElement();
    const search = root.querySelector<HTMLInputElement>('input')!;
    search.focus(); search.value = 'cholera'; search.dispatchEvent(new Event('input'));
    expect(document.activeElement).toBe(search);
    expect(root.querySelectorAll('.dw-global-grid article').length).toBe(1);
    expect(root.querySelector('.dw-global-grid')?.textContent).toContain('Cholera');
    expect(root.querySelector('.dw-lead')).not.toBeNull();
    search.value = 'unknown'; search.dispatchEvent(new Event('input'));
    expect(root.querySelector('.dw-global-grid')?.textContent).toContain('does not mean there are no outbreaks');
  });
  it('retains results and original assessment time on failed refresh; recovery clears the error', async () => {
    const panel = await mount(); const root = panel.getElement();
    const review = root.querySelector('.dw-review')!.textContent;
    fetchData.mockRejectedValueOnce(new Error('offline'));
    await panel.fetchData(true);
    expect(root.querySelector('.dw-connection')?.textContent).toContain('unavailable');
    expect(root.querySelector('.dw-source-status')?.textContent).toContain('Refresh delayed');
    expect(root.querySelectorAll('.dw-report').length).toBe(3);
    expect(root.querySelector('.dw-review')?.textContent).toBe(review);
    await panel.fetchData(true);
    expect(root.querySelector('.dw-connection')?.textContent).toContain('Auto-refresh');
  });
  it('renders hostile source text as text and refuses unsafe links', async () => {
    const panel = await mount();
    const data = payload(); data.global.reports = [report('<img src=x onerror=alert(1)>', 'WHO', 'javascript:alert(1)')];
    fetchData.mockResolvedValueOnce(data); await panel.fetchData(true);
    const body = panel.getElement().querySelector('.dw-global-grid')!;
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain('<img');
    expect(body.querySelector('a')?.hasAttribute('href')).toBe(false);
  });
  it('does not render late requests after destruction', async () => {
    const panel = await mount();
    let resolve: (value: ReturnType<typeof payload>) => void;
    fetchData.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = panel.fetchData(true);
    panel.destroy(); const html = panel.getElement().innerHTML;
    resolve!(payload()); await pending;
    expect(panel.getElement().innerHTML).toBe(html);
  });
});
