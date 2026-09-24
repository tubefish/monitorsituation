/** Keep the branded shell while the main CSS is still in flight. */
export async function waitForDashboardStyles(): Promise<void> {
  const links = [...document.querySelectorAll<HTMLLinkElement>(
    'link[data-wm-deferred-style="dashboard"], link[rel="stylesheet"][href*="/assets/main-"]',
  )];
  await Promise.all(links.map(link => {
    link.media = 'all';
    if (link.sheet) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => {
        cleanup();
        const status = document.querySelector('.monitor-boot-status');
        if (status) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.textContent = 'Retry loading';
          retry.addEventListener('click', () => window.location.reload(), { once: true });
          status.replaceChildren(retry);
        }
        reject(new Error('Dashboard stylesheet could not load'));
      };
      const timeout = setTimeout(failed, 20_000);
      link.addEventListener('load', loaded, { once: true });
      link.addEventListener('error', failed, { once: true });
      if (link.sheet) loaded();
    });
  }));
}
