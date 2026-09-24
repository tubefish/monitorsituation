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

test('switches between situation, Wingbits, and location news', () => {
  const section = document.createElement('section');
  const map = document.createElement('div');
  section.append(map);
  document.body.append(section);
  let selected = '';
  const switcher = new MapExperienceSwitcher(section, map, item => { selected = item.title; });

  const flights = section.querySelector<HTMLButtonElement>('[data-map-experience="flights"]')!;
  flights.click();
  const wingbitsLink = section.querySelector<HTMLAnchorElement>('.map-experience-flight-link')!;
  assert.match(wingbitsLink.href, /^https:\/\/wingbits\.com\/map\?/);
  assert.match(wingbitsLink.href, /utm_campaign=MTS-map/);
  assert.equal(section.classList.contains('map-experience-flights-active'), true);

  switcher.setLocationNews([{ lat: 1, lon: 2, title: 'Top story', location: 'London', threatLevel: 'high', url: 'https://example.com' }]);
  section.querySelector<HTMLButtonElement>('[data-map-experience="news"]')!.click();
  assert.equal(section.querySelector<HTMLElement>('.map-experience-news')!.hidden, false);
  section.querySelector<HTMLButtonElement>('.map-experience-news-focus')!.click();
  assert.equal(selected, 'Top story');
  assert.equal(wingbitsLink.isConnected, true, 'Wingbits access stays available when switching views');

  switcher.destroy();
  assert.equal(section.querySelector('.map-experience-switcher'), null);
});
