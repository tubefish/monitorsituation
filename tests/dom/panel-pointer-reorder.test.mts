import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelLayoutManager } from '@/app/panel-layout';

// Exercise the production pointer listeners and persistence without starting
// unrelated feeds, maps, subscriptions, or checkout during this focused test.
type DragHarness = {
  makeDraggable: (element: HTMLElement, key: string) => void;
  panelDragCleanupHandlers: Array<() => void>;
};
let manager: DragHarness;
let news: HTMLElement;
let markets: HTMLElement;
const order = () => [...document.querySelectorAll('#panelsGrid > .panel')].map(el => (el as HTMLElement).dataset.panel);

function pointer(target: EventTarget, type: string, x: number, y: number, pointerType = 'mouse') {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, isPrimary: true, pointerType, clientX: x, clientY: y }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.classList.add('monitor-dashboard');
  document.documentElement.classList.remove('monitor-layout-editing');
  document.body.innerHTML = '<div id="panelsGrid" class="panels-grid"><section class="panel" data-panel="news"><header class="panel-header"><span class="panel-title">News</span><button>Expand</button></header><div class="panel-content">Selectable news</div></section><section class="panel" data-panel="markets"><header class="panel-header"><span class="panel-title">Markets</span><button>Expand</button></header><div class="panel-content">Selectable markets</div></section></div><div id="mapBottomGrid" class="map-bottom-grid"></div>';
  news = document.querySelector('[data-panel="news"]')!;
  markets = document.querySelector('[data-panel="markets"]')!;
  vi.spyOn(news, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
  vi.spyOn(markets, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 300, 200));
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(news.querySelector('.panel-title'));
  manager = Object.assign(Object.create(PanelLayoutManager.prototype), {
    ctx: { panels: {}, PANEL_ORDER_KEY: 'test-pointer-order' },
    bottomSetMemory: new Set(),
    resolvedPanelOrder: ['news', 'markets'],
    panelDragCleanupHandlers: [],
  }) as DragHarness;
  manager.makeDraggable(markets, 'markets');
});

afterEach(() => {
  manager.panelDragCleanupHandlers.forEach(cleanup => cleanup());
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
  document.documentElement.classList.remove('monitor-dashboard', 'monitor-layout-editing');
  localStorage.clear();
});

describe('direct section reordering', () => {
  it.each(['mouse', 'touch'])('drags and persists outside Customize using %s', pointerType => {
    const start = markets.querySelector(pointerType === 'mouse' ? '.panel-title' : '.panel-move-btn')!;
    pointer(start, 'pointerdown', 40, 220, pointerType);
    pointer(document, 'pointermove', 40, 40, pointerType);
    expect(document.body.classList.contains('panel-drag-active')).toBe(true);
    pointer(document, 'pointerup', 40, 40, pointerType);
    expect(order()).toEqual(['markets', 'news']);
    expect(JSON.parse(localStorage.getItem('test-pointer-order')!)).toEqual(['markets', 'news']);
    expect(document.body.classList.contains('panel-drag-active')).toBe(false);
  });

  it('supports keyboard reordering outside Customize', () => {
    markets.querySelector('.panel-move-btn')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(order()).toEqual(['markets', 'news']);
    expect(JSON.parse(localStorage.getItem('test-pointer-order')!)).toEqual(['markets', 'news']);
  });

  it.each(['.panel-content', '.panel-header > button:not(.panel-move-btn)'])('leaves %s interactions alone', selector => {
    pointer(markets.querySelector(selector)!, 'pointerdown', 40, 220);
    pointer(document, 'pointermove', 40, 40);
    pointer(document, 'pointerup', 40, 40);
    expect(order()).toEqual(['news', 'markets']);
    expect(localStorage.getItem('test-pointer-order')).toBeNull();
  });

  it('cancels a drag with Escape without changing the saved layout', () => {
    pointer(markets.querySelector('.panel-title')!, 'pointerdown', 40, 220);
    pointer(document, 'pointermove', 40, 40);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(document, 'pointerup', 40, 40);
    expect(order()).toEqual(['news', 'markets']);
    expect(localStorage.getItem('test-pointer-order')).toBeNull();
    expect(document.body.classList.contains('panel-drag-active')).toBe(false);
  });
});
