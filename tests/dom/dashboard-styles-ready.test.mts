import { afterEach, expect, it, vi } from 'vitest';
import { waitForDashboardStyles } from '@/utils/dashboard-styles-ready';

afterEach(() => {
  document.documentElement.style.removeProperty('--monitor-styles-ready');
  document.head.querySelectorAll('link').forEach(link => link.remove());
  document.body.replaceChildren();
  vi.useRealTimers();
});

it('waits for applied styles even when a link has already loaded', async () => {
  const link = document.createElement('link');
  link.dataset.wmDeferredStyle = 'dashboard';
  link.media = 'print';
  Object.defineProperty(link, 'sheet', { value: new CSSStyleSheet() });
  document.head.append(link);
  let ready = false;
  const pending = waitForDashboardStyles().then(() => { ready = true; });
  await Promise.resolve();
  expect(ready).toBe(false);
  expect(link.media).toBe('all');
  document.documentElement.style.setProperty('--monitor-styles-ready', '1');
  await pending;
  expect(ready).toBe(true);
});

it('resolves immediately when the dashboard CSS is already applied', async () => {
  document.documentElement.style.setProperty('--monitor-styles-ready', '1');
  await expect(waitForDashboardStyles()).resolves.toBeUndefined();
});

it('leaves a retry control instead of revealing an unstyled app when CSS fails', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div class="monitor-boot-status">Connecting…</div>';
  const result = expect(waitForDashboardStyles()).rejects.toThrow('stylesheet could not load');
  await vi.advanceTimersByTimeAsync(20_000);
  await result;
  expect(document.querySelector('button')?.textContent).toBe('Retry loading');
});
