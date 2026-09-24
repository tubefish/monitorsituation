import { afterEach, expect, it, vi } from 'vitest';
import { waitForDashboardStyles } from '@/utils/dashboard-styles-ready';

afterEach(() => { document.head.querySelectorAll('link').forEach(link => link.remove()); document.body.replaceChildren(); vi.useRealTimers(); });

function pendingStylesheet(): HTMLLinkElement {
  const link = document.createElement('link');
  link.dataset.wmDeferredStyle = 'dashboard';
  link.media = 'print';
  document.head.append(link);
  return link;
}

it('keeps the boot shell until the stylesheet has loaded', async () => {
  const link = pendingStylesheet();
  let ready = false;
  const pending = waitForDashboardStyles().then(() => { ready = true; });
  await Promise.resolve();
  expect(ready).toBe(false);
  expect(link.media).toBe('all');
  link.dispatchEvent(new Event('load'));
  await pending;
  expect(ready).toBe(true);
});

it('handles cached styles without waiting for a second load event', async () => {
  const link = pendingStylesheet();
  Object.defineProperty(link, 'sheet', { value: new CSSStyleSheet() });
  await expect(waitForDashboardStyles()).resolves.toBeUndefined();
});

it('leaves a retry control instead of revealing an unstyled app when CSS fails', async () => {
  const link = pendingStylesheet();
  document.body.innerHTML = '<div class="monitor-boot-status">Connecting…</div>';
  const result = expect(waitForDashboardStyles()).rejects.toThrow('stylesheet could not load');
  link.dispatchEvent(new Event('error'));
  await result;
  expect(document.querySelector('button')?.textContent).toBe('Retry loading');
});
