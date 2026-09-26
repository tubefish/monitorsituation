import { config as configureZod } from 'zod/v4/core';

// Install the MONITOR favicon as part of the eager bootstrap path. The static
// document still carries legacy favicon links, so replace them before the rest
// of the app starts instead of waiting for Settings code to load.
if (typeof document !== 'undefined') {
  document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => link.remove());

  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/svg+xml';
  favicon.href = '/favico/monitor-favicon.svg?v=4';
  document.head.appendChild(favicon);
}

// The production CSP intentionally omits `unsafe-eval`. Zod v4 can probe a
// JIT object parser with `new Function`, which works around CSP only by
// producing an enforced violation event. Keep validation on the interpreter
// path so the dashboard starts cleanly under the hardened policy.
configureZod({ jitless: true });
