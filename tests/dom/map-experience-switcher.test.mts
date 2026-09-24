import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { MapExperienceSwitcher } from '../../src/components/MapExperienceSwitcher.ts';

let windowInstance: Window;

beforeEach(() => {
  windowInstance = new Window({ settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    localStorage: windowInstance.localStorage,
    Event: windowInstance.Event,
    AbortController: windowInstance.AbortController,
  });
});

afterEach(() => windowInstance.close());

test('switches lazily between situation, Wingbits, and location news', () => {
  const section = document.createElement('section');
  const map = document.createElement('div');
  section.append(map);
  document.body.append(section);
  let selected = '';
  const switcher = new MapExperienceSwitcher(section, map, item => { selected = item.title; });

  assert.equal(section.querySelector('iframe'), null);
  const flights = section.querySelector<HTMLButtonElement>('[data-map-experience="flights"]')!;
  flights.click();
  const frame = section.querySelector<HTMLIFrameElement>('iframe')!;
  assert.match(frame.src, /^https:\/\/wingbits\.com\/map\?/);
  assert.match(frame.src, /utm_campaign=MTS-map/);
  assert.equal(section.classList.contains('map-experience-flights-active'), true);

  switcher.setLocationNews([{ lat: 1, lon: 2, title: 'Top story', location: 'London', threatLevel: 'high', url: 'https://example.com' }]);
  section.querySelector<HTMLButtonElement>('[data-map-experience="news"]')!.click();
  assert.equal(section.querySelector<HTMLElement>('.map-experience-news')!.hidden, false);
  section.querySelector<HTMLButtonElement>('.map-experience-news-focus')!.click();
  assert.equal(selected, 'Top story');
  assert.equal(section.querySelectorAll('iframe').length, 1, 'Wingbits stays mounted when switching views');

  switcher.destroy();
  assert.equal(section.querySelector('.map-experience-switcher'), null);
});
