import { SITE_VARIANT } from '@/config/variant';
import { h } from '@/utils/dom-utils';

const GROUPS: Array<[string, string[]]> = [
  ['Conflicts & security', ['conflicts', 'hotspots', 'iranAttacks', 'sanctions', 'protests', 'ucdpEvents', 'displacement', 'ciiChoropleth']],
  ['Military & aviation', ['bases', 'military', 'nuclear', 'irradiators', 'flights', 'gpsJamming', 'satellites', 'spaceports']],
  ['Infrastructure & trade', ['cables', 'pipelines', 'outages', 'datacenters', 'cyberThreats', 'ais', 'waterways', 'economic', 'tradeRoutes', 'storageFacilities', 'fuelShortages']],
  ['Weather & environment', ['natural', 'weather', 'fires', 'climate']],
];

/** Retain the renderer's real controls and listeners inside a compact native drawer. */
export function organizeMapLayerControls(root: HTMLElement): () => void {
  if (SITE_VARIANT !== 'full') return () => {};
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.layer-toggle-row'));
  if (!rows.length) return () => {};
  const oldList = root.querySelector<HTMLElement>('.toggle-list');
  const list = oldList ?? h('div', { className: 'toggle-list' });
  const search = root.querySelector<HTMLInputElement>('.layer-search');
  const guide = root.querySelector<HTMLElement>('.layer-help-btn');
  const count = h('span', { className: 'monitor-layer-count' });
  const summary = h('summary', {}, h('span', {}, 'Map layers'), count);
  const details = h('details', { className: 'monitor-layer-drawer' }, summary) as HTMLDetailsElement;
  const active = h('div', { className: 'monitor-active-layers', 'aria-label': 'Active map layers' });
  const body = h('div', { className: 'monitor-layer-body' });
  if (search) { search.setAttribute('aria-label', 'Find a map layer'); body.append(search); }
  if (guide) { guide.textContent = 'Layer guide'; body.append(guide); }
  const grouped = new Set<string>();
  const addGroup = (title: string, members: HTMLElement[]) => {
    if (!members.length) return;
    const group = h('section', { className: 'monitor-layer-group', 'aria-label': title }, h('h3', {}, title), ...members);
    list.append(group);
  };
  for (const [title, keys] of GROUPS) {
    const members = rows.filter(row => keys.includes(row.dataset.layer ?? ''));
    members.forEach(row => grouped.add(row.dataset.layer!));
    addGroup(title, members);
  }
  addGroup('More layers', rows.filter(row => !grouped.has(row.dataset.layer!)));
  list.classList.remove('collapsed');
  body.append(list);
  details.append(body);
  root.replaceChildren(details, active);
  root.classList.add('monitor-layer-controls');

  const sync = () => {
    const enabled = rows.filter(row => {
      const control = row.querySelector<HTMLElement>('.layer-toggle');
      const input = control?.querySelector<HTMLInputElement>('input');
      return input ? input.checked : control?.classList.contains('active');
    });
    count.textContent = `${enabled.length} active`;
    active.replaceChildren(...enabled.slice(0, 3).map(row => h('span', {},
      row.querySelector('.toggle-label')?.textContent?.trim() || row.querySelector('.layer-toggle')?.textContent?.trim() || '',
    )));
    if (enabled.length > 3) active.append(h('span', {}, `+${enabled.length - 3}`));
    active.hidden = enabled.length === 0;
    rows.forEach(row => {
      const button = row.querySelector<HTMLButtonElement>('button.layer-toggle');
      if (button) button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
  };
  const observer = new MutationObserver(sync);
  observer.observe(list, { attributes: true, subtree: true, attributeFilter: ['class', 'checked'] });
  root.addEventListener('change', sync);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && details.open) { details.open = false; summary.focus(); event.stopPropagation(); }
  };
  root.addEventListener('keydown', onKey);
  sync();
  return () => { observer.disconnect(); root.removeEventListener('change', sync); root.removeEventListener('keydown', onKey); };
}
