/** Check applied CSS, not just a link's load event. Bundled styles may be
 * inserted after the app module starts, or loaded before their media applies. */
export function waitForDashboardStyles(): Promise<void> {
  const ready = () => getComputedStyle(document.documentElement)
    .getPropertyValue('--monitor-styles-ready').trim() === '1';
  if (ready()) return Promise.resolve();
  document.querySelectorAll<HTMLLinkElement>('link[data-wm-deferred-style="dashboard"]')
    .forEach(link => { link.media = 'all'; });

  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    const timeout = setTimeout(() => {
      cancelAnimationFrame(frame);
      const status = document.querySelector('.monitor-boot-status');
      if (status) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry loading';
        retry.addEventListener('click', () => window.location.reload(), { once: true });
        status.replaceChildren(retry);
      }
      reject(new Error('Dashboard stylesheet could not load'));
    }, 20_000);
    const check = () => {
      if (ready()) {
        clearTimeout(timeout);
        resolve();
      } else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
  });
}
