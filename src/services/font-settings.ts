export type FontFamily = 'mono' | 'system';

const STORAGE_KEY = 'wm-font-family';
const EVENT_NAME = 'wm-font-changed';

export function getFontFamily(): FontFamily {
  return 'system';
}

export function setFontFamily(_font: FontFamily): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'system');
  } catch {
    // ignore
  }
  applyFont();
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { font: 'system' } }));
}

export function applyFont(_font?: FontFamily): void {
  document.documentElement.dataset.font = 'system';
  try {
    localStorage.setItem(STORAGE_KEY, 'system');
  } catch {
    // The system font still applies when storage is unavailable.
  }
}

export function subscribeFontChange(cb: (font: FontFamily) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { font?: FontFamily } | undefined;
    cb(detail?.font ?? getFontFamily());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
