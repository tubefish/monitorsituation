import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Panel } from '@/components/Panel';
import { initTestI18n } from './helpers/i18n.mts';

const panels: Panel[] = [];
beforeAll(initTestI18n);
afterEach(() => {
  panels.splice(0).forEach((panel) => panel.destroy());
  document.body.replaceChildren();
});

function mount(id: string): Panel {
  const panel = new Panel({ id, title: id });
  panels.push(panel);
  document.body.appendChild(panel.getElement());
  return panel;
}

describe('panel expansion', () => {
  it('expands and restores in place, retaining dimensions, content, and focus', () => {
    const panel = mount('X Tracker');
    const el = panel.getElement();
    const content = el.querySelector('.panel-content')!;
    const button = el.querySelector<HTMLButtonElement>('.panel-expand-btn')!;
    el.classList.add('span-3', 'col-span-2');
    button.focus();
    button.click();

    expect(panel.supportsFullscreen()).toBe(true);
    expect(panel.isFullscreenActive()).toBe(true);
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.classList.contains('panel-expanded-active')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isFullscreenActive()).toBe(false);
    expect(el.parentElement).toBe(document.body);
    expect(el.querySelector('.panel-content')).toBe(content);
    expect(el.classList.contains('span-3')).toBe(true);
    expect(el.classList.contains('col-span-2')).toBe(true);
    expect(el.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('restores the previous panel when another opens and cleans up on destruction', () => {
    const first = mount('First');
    const second = mount('Second');
    first.setFullscreen(true);
    second.setFullscreen(true);
    expect(first.isFullscreenActive()).toBe(false);
    expect(first.getElement().classList.contains('panel-expanded')).toBe(false);
    expect(second.isFullscreenActive()).toBe(true);
    second.destroy();
    expect(document.body.classList.contains('panel-expanded-active')).toBe(false);
    expect(second.isFullscreenActive()).toBe(false);
  });

  it('lets media panels retain their existing fullscreen controls', () => {
    const panel = new Panel({ id: 'player', title: 'Player', expandable: false });
    panels.push(panel);
    expect(panel.getElement().querySelector('.panel-expand-btn')).toBeNull();
    expect(panel.setFullscreen(true)).toBe(false);
  });
});
