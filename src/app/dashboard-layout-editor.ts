import { h } from '@/utils/dom-utils';
import {
  loadPanelSpans, loadPanelColSpans, savePanelSpan, savePanelColSpan,
  clearPanelSpan, clearPanelColSpan,
} from '@/utils/panel-storage';

interface EditorOptions {
  defaultOrder: readonly string[];
  defaultRows: Readonly<Record<string, { rowSpan?: number }>>;
  persistOrder: (bottom: string[]) => boolean;
  refreshPanels: () => void;
}
interface LayoutSnapshot {
  grids: Array<{ id: string; panels: string[] }>;
  sizes: Record<string, string[]>;
  rows: Record<string, number>;
  columns: Record<string, number>;
  mapWidth: string;
  storedMapWidth: string | null;
}

export function installDashboardLayoutEditor(options: EditorOptions): () => void {
  const root = document.documentElement;
  const button = document.getElementById('customizeLayoutBtn');
  const mobileButton = document.getElementById('mobileCustomizeLayoutBtn');
  const main = document.querySelector<HTMLElement>('.main-content');
  if (!button || !main) return () => {};
  const abort = new AbortController();
  const signal = abort.signal;
  let snapshot: LayoutSnapshot | null = null;
  const grids = () => ['panelsGrid', 'mapBottomGrid'].map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const panels = () => grids().flatMap(grid => Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.panel));
  const sizeClasses = (el: HTMLElement) => [...el.classList].filter(name => /^(span-[1-4]|col-span-[1-3]|resized)$/.test(name));
  const note = h('span', { className: 'monitor-layout-note', role: 'status' }, 'Drag sections or resize their edges. Changes save on this device.');
  const undo = h('button', { type: 'button' }, 'Undo changes');
  const reset = h('button', { type: 'button' }, 'Reset layout');
  const done = h('button', { type: 'button', className: 'monitor-primary-button' }, 'Done');
  const toolbar = h('div', { className: 'monitor-layout-toolbar', 'aria-label': 'Layout controls' }, note, undo, reset, done);
  toolbar.hidden = true;
  document.querySelector('.header')?.after(toolbar);
  const save = () => {
    const bottom = document.getElementById('mapBottomGrid');
    const persisted = options.persistOrder(Array.from(bottom?.children ?? []).map(el => (el as HTMLElement).dataset.panel!).filter(Boolean));
    note.textContent = persisted ? 'Layout saved on this device.' : 'Layout updated for this visit. Browser storage is unavailable.';
    for (const el of panels()) {
      const row = [...el.classList].find(name => /^span-[1-4]$/.test(name));
      el.querySelector('.panel-resize-handle')?.setAttribute('aria-valuenow', row ? row.slice(5) : String(options.defaultRows[el.dataset.panel!]?.rowSpan ?? 1));
    }
    options.refreshPanels();
    window.dispatchEvent(new Event('resize'));
  };
  const capture = (): LayoutSnapshot => ({
    grids: grids().map(grid => ({ id: grid.id, panels: Array.from(grid.children).map(el => (el as HTMLElement).dataset.panel!).filter(Boolean) })),
    sizes: Object.fromEntries(panels().map(el => [el.dataset.panel!, sizeClasses(el)])),
    rows: { ...loadPanelSpans() }, columns: { ...loadPanelColSpans() },
    mapWidth: main.style.getPropertyValue('--map-col-width'),
    storedMapWidth: (() => { try { return localStorage.getItem('map-col-width'); } catch { return null; } })(),
  });
  const setEditing = (editing: boolean) => {
    root.classList.toggle('monitor-layout-editing', editing);
    toolbar.hidden = !editing;
    button.setAttribute('aria-pressed', String(editing));
    mobileButton?.setAttribute('aria-pressed', String(editing));
    button.textContent = editing ? 'Finish editing' : 'Customize';
    if (editing) {
      snapshot = capture();
      note.textContent = 'Drag sections or resize their edges. Changes save on this device.';
      done.focus();
    } else { save(); button.focus(); }
    window.dispatchEvent(new Event('resize'));
  };
  const toggle = () => setEditing(!root.classList.contains('monitor-layout-editing'));
  button.addEventListener('click', toggle, { signal });
  mobileButton?.addEventListener('click', () => {
    document.getElementById('mobileMenuClose')?.click();
    setEditing(true);
  }, { signal });
  done.addEventListener('click', () => setEditing(false), { signal });
  undo.addEventListener('click', () => {
    if (!snapshot) return;
    const byId = new Map(panels().map(el => [el.dataset.panel!, el]));
    for (const grid of snapshot.grids) for (const id of grid.panels) {
      const el = byId.get(id);
      if (el) document.getElementById(grid.id)?.append(el);
    }
    for (const [id, classes] of Object.entries(snapshot.sizes)) {
      const el = byId.get(id);
      if (!el) continue;
      el.classList.remove(...sizeClasses(el));
      el.classList.add(...classes);
      const row = snapshot.rows[id];
      const column = snapshot.columns[id];
      if (row === undefined) clearPanelSpan(id); else savePanelSpan(id, row);
      if (column === undefined) clearPanelColSpan(id); else savePanelColSpan(id, column);
    }
    main.style.setProperty('--map-col-width', snapshot.mapWidth);
    try {
      if (snapshot.storedMapWidth === null) localStorage.removeItem('map-col-width');
      else localStorage.setItem('map-col-width', snapshot.storedMapWidth);
    } catch { /* Session layout remains usable. */ }
    save();
    note.textContent = 'Restored the layout from when you started editing.';
  }, { signal });
  reset.addEventListener('click', () => {
    // Keep chosen panels and regions; reset their order and dimensions only.
    for (const grid of grids()) {
      const children = Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.panel);
      const rank = (id: string) => { const index = options.defaultOrder.indexOf(id); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
      children.sort((a, b) => rank(a.dataset.panel!) - rank(b.dataset.panel!)).forEach(el => grid.append(el));
    }
    for (const el of panels()) {
      const id = el.dataset.panel!;
      el.classList.remove(...sizeClasses(el));
      const row = options.defaultRows[id]?.rowSpan;
      if (row && row > 1) el.classList.add(`span-${row}`);
      clearPanelSpan(id); clearPanelColSpan(id);
    }
    main.style.setProperty('--map-col-width', '65%');
    try { localStorage.removeItem('map-col-width'); } catch { /* Session-only reset. */ }
    save();
    note.textContent = 'Default order and sizes restored. Undo changes is available.';
  }, { signal });
  return () => { abort.abort(); toolbar.remove(); root.classList.remove('monitor-layout-editing'); };
}
