import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Panel } from '@/components/Panel';
import { clearPanelColSpans, loadPanelColSpans, savePanelColSpan } from '@/utils/panel-storage';
import { initTestI18n } from './helpers/i18n.mts';
import { createDeferredPanelShell, reconcileDeferredPanelShellColSpan } from '@/app/panel-mount-deferral';

beforeAll(initTestI18n);
afterEach(() => {
  clearPanelColSpans();
  document.body.replaceChildren();
});

it('fits saved and natural wide panels to the sidebar and restores widths when space returns', () => {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.style.gridTemplateColumns = '280px 0px 158px'; // implicit tracks from an oversized panel
  grid.style.columnGap = '4px';
  document.body.appendChild(grid);
  let width = 450;
  vi.spyOn(grid, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect));
  savePanelColSpan('saved', 3);
  const saved = new Panel({ id: 'saved', title: 'Saved', className: 'panel-wide' });
  const natural = new Panel({ id: 'natural', title: 'Natural', className: 'panel-wide' });
  grid.append(saved.getElement(), natural.getElement());

  saved.refreshGridWidth();
  natural.refreshGridWidth();
  expect(saved.getElement().classList.contains('col-span-1')).toBe(true);
  expect(natural.getElement().classList.contains('col-span-1')).toBe(true);
  expect(loadPanelColSpans().saved).toBe(3);
  expect(loadPanelColSpans().natural).toBeUndefined();

  width = 1100;
  saved.refreshGridWidth();
  natural.refreshGridWidth();
  expect(saved.getElement().classList.contains('col-span-3')).toBe(true);
  expect(natural.getElement().classList.contains('col-span-1')).toBe(false);
  expect(saved.getElement().querySelector('.panel-col-resize-handle')?.getAttribute('aria-valuenow')).toBe('3');
  saved.destroy();
  natural.destroy();
});

it('fits unloaded placeholders too, including the Financial factory footprint', () => {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.style.gridTemplateColumns = '280px 164px';
  document.body.appendChild(grid);
  let width = 450;
  vi.spyOn(grid, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect));
  const wide = createDeferredPanelShell('cascade', 'Cascade', { className: 'panel-wide' });
  const finance = createDeferredPanelShell('finance', 'Financial');
  grid.append(wide, finance);
  for (const shell of [wide, finance]) {
    reconcileDeferredPanelShellColSpan(shell);
    expect(shell.classList.contains('col-span-1')).toBe(true);
  }
  width = 1000;
  for (const shell of [wide, finance]) {
    reconcileDeferredPanelShellColSpan(shell);
    expect(shell.classList.contains('col-span-2')).toBe(true);
  }
});
