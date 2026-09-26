import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Panel } from '@/components/Panel';
import { invalidatePanelStorageCacheForKeys, PANEL_SPANS_KEY, PANEL_COL_SPANS_KEY } from '@/utils/panel-storage';
import { initTestI18n } from './helpers/i18n.mts';

const keys = [PANEL_SPANS_KEY, PANEL_COL_SPANS_KEY];
const panels: Panel[] = [];
beforeAll(initTestI18n);
beforeEach(() => {
  keys.forEach(key => localStorage.removeItem(key));
  invalidatePanelStorageCacheForKeys(keys);
});
afterEach(() => {
  panels.splice(0).forEach(panel => panel.destroy());
  document.body.replaceChildren();
  keys.forEach(key => localStorage.removeItem(key));
  invalidatePanelStorageCacheForKeys(keys);
});

it('applies downloaded dimensions without remounting and restores defaults for an empty account', () => {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.style.gridTemplateColumns = '300px 300px 300px';
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ width: 1000 } as DOMRect);
  document.body.appendChild(grid);
  const panel = new Panel({ id: 'tweets', title: 'Tweets', defaultRowSpan: 2 });
  panels.push(panel);
  const el = panel.getElement();
  grid.appendChild(el);
  const content = el.querySelector('.panel-content');

  localStorage.setItem(PANEL_SPANS_KEY, JSON.stringify({ tweets: 4 }));
  localStorage.setItem(PANEL_COL_SPANS_KEY, JSON.stringify({ tweets: 3 }));
  invalidatePanelStorageCacheForKeys(keys);
  panel.restoreSavedDimensions();
  expect(el.classList.contains('span-4')).toBe(true);
  expect(el.classList.contains('col-span-3')).toBe(true);
  expect(el.querySelector('.panel-resize-handle')?.getAttribute('aria-valuenow')).toBe('4');
  expect(el.querySelector('.panel-col-resize-handle')?.getAttribute('aria-valuenow')).toBe('3');
  expect(el.querySelector('.panel-content')).toBe(content);

  keys.forEach(key => localStorage.removeItem(key));
  invalidatePanelStorageCacheForKeys(keys);
  panel.restoreSavedDimensions();
  expect(el.classList.contains('span-4')).toBe(false);
  expect(el.classList.contains('span-2')).toBe(true);
  expect(el.classList.contains('col-span-3')).toBe(false);
});
