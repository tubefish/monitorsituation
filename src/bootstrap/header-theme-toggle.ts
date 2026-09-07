import { getCurrentTheme, getStoredTheme, setTheme } from '@/utils/theme-manager';

const TOGGLE_ID = 'monitorThemeToggle';
const STYLE_ID = 'monitorThemeToggleStyles';
const DESKTOP_QUERY = '(min-width: 769px)';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .monitor-theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 1px;
      height: 24px;
      padding: 1px;
      margin: 0 6px 0 0;
      border: 1px solid var(--border-color, #d4d4d4);
      background: var(--bg-secondary, transparent);
      color: inherit;
      cursor: pointer;
      font: inherit;
      line-height: 1;
      box-sizing: border-box;
    }

    .monitor-theme-toggle:hover {
      background: var(--bg-hover, rgba(127, 127, 127, 0.08));
    }

    .monitor-theme-toggle__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 20px;
      opacity: 0.42;
      box-sizing: border-box;
    }

    [data-theme='light'] .monitor-theme-toggle__icon--light,
    [data-theme='dark'] .monitor-theme-toggle__icon--dark {
      opacity: 1;
      background: var(--bg-hover, rgba(127, 127, 127, 0.12));
    }

    @media (max-width: 768px) {
      .monitor-theme-toggle { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function updateToggleState(button: HTMLButtonElement): void {
  const theme = getCurrentTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  button.dataset.theme = theme;
  button.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
  button.title = `Switch to ${nextTheme} mode`;
}

function mountToggle(): void {
  if (!window.matchMedia(DESKTOP_QUERY).matches) return;
  if (document.getElementById(TOGGLE_ID)) return;

  const contractButton = document.getElementById('copyLinkBtn');
  if (!(contractButton instanceof HTMLButtonElement) || !contractButton.parentElement) return;

  injectStyles();

  const button = document.createElement('button');
  button.type = 'button';
  button.id = TOGGLE_ID;
  button.className = 'monitor-theme-toggle';
  button.innerHTML = `
    <span class="monitor-theme-toggle__icon monitor-theme-toggle__icon--light" aria-hidden="true">☀</span>
    <span class="monitor-theme-toggle__icon monitor-theme-toggle__icon--dark" aria-hidden="true">☾</span>
  `;
  button.addEventListener('click', () => {
    setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
    updateToggleState(button);
  });

  contractButton.parentElement.insertBefore(button, contractButton);
  updateToggleState(button);
}

function syncToggleForViewport(): void {
  if (window.matchMedia(DESKTOP_QUERY).matches) {
    mountToggle();
    return;
  }

  document.getElementById(TOGGLE_ID)?.remove();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTheme(getStoredTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
  } else {
    mountToggle();
  }

  const observer = new MutationObserver(() => mountToggle());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.matchMedia(DESKTOP_QUERY).addEventListener('change', syncToggleForViewport);
  window.addEventListener('theme-changed', () => {
    const button = document.getElementById(TOGGLE_ID);
    if (button instanceof HTMLButtonElement) updateToggleState(button);
  });
}
