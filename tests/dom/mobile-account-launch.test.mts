import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { AuthSession } from '@/services/auth-state';
import type { AuthLauncher } from '@/components/AuthLauncher';
import type { AppContext } from '@/app/app-context';
import { initTestI18n } from './helpers/i18n.mts';

const auth = vi.hoisted(() => ({
  state: { user: null, isPending: false } as AuthSession,
  listeners: new Set<(state: AuthSession) => void>(),
  mountUserButton: vi.fn(() => vi.fn()),
  openUserProfile: vi.fn(),
}));
vi.mock('@/services/auth-state', () => ({
  getAuthState: () => auth.state,
  subscribeAuthState: (callback: (state: AuthSession) => void) => {
    auth.listeners.add(callback);
    callback(auth.state);
    return () => auth.listeners.delete(callback);
  },
}));
vi.mock('@/services/clerk', () => ({
  mountUserButton: auth.mountUserButton,
  openSignIn: vi.fn(),
  openSignUp: vi.fn(),
  openUserProfile: auth.openUserProfile,
}));
import { MobilePrimaryNav } from '@/app/mobile-primary-nav';
import { overlayHistory } from '@/utils/overlay-history';

let nav: MobilePrimaryNav;
const open = vi.fn();
const openSignUp = vi.fn();
beforeAll(initTestI18n);
beforeEach(() => {
  auth.state = { user: null, isPending: false };
  open.mockReset();
  openSignUp.mockReset();
  auth.openUserProfile.mockReset();
  document.body.innerHTML = '<div id="mobileMenuOverlay" class="open"></div><div id="mobileMenu" class="open"><div id="mobileAuthWidgetMount" hidden></div><button id="mobileAuthFallback">Sign In</button></div>';
  document.body.style.overflow = 'hidden';
  nav = new MobilePrimaryNav({} as AppContext, {
    openSearch: vi.fn(), navigateToVariant: vi.fn(), openMission: vi.fn(),
  });
  nav.setupAuth({ open, openSignUp } as unknown as AuthLauncher);
});
afterEach(() => {
  nav.destroy();
  overlayHistory.reset();
  vi.useRealTimers();
  document.body.replaceChildren();
  document.body.style.overflow = '';
});

it.each([
  ['.auth-signin-btn', open],
  ['.auth-signup-link', openSignUp],
] as const)('closes the drawer before launching %s', (selector, launch) => {
  launch.mockImplementation(() => {
    expect(document.getElementById('mobileMenu')?.classList.contains('open')).toBe(false);
    expect(document.getElementById('mobileMenuOverlay')?.classList.contains('open')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
  expect(document.getElementById('mobileAuthWidgetMount')?.hidden).toBe(false);
  expect(document.getElementById('mobileAuthFallback')?.hidden).toBe(true);
  document.querySelector<HTMLButtonElement>(selector)!.click();
  expect(launch).toHaveBeenCalledOnce();
});

it('keeps sign-in reachable while the account SDK loads', () => {
  auth.state = { user: null, isPending: true };
  auth.listeners.forEach(callback => callback(auth.state));
  expect(document.getElementById('mobileAuthWidgetMount')?.hidden).toBe(true);
  expect(document.getElementById('mobileAuthFallback')?.hidden).toBe(false);
  document.getElementById('mobileAuthFallback')!.click();
  expect(open).toHaveBeenCalledOnce();
});

it.each([
  ['.auth-signin-btn', open],
  ['.auth-signup-link', openSignUp],
] as const)('waits for every Back listener before opening %s', (selector, launch) => {
  vi.useFakeTimers();
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
  overlayHistory.open('menu', () => nav.closeMenu('history'));
  document.querySelector<HTMLButtonElement>(selector)!.click();
  expect(launch).not.toHaveBeenCalled();
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  expect(launch).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(launch).toHaveBeenCalledOnce();
});

it('cancels a queued account launch when navigation is destroyed', () => {
  vi.useFakeTimers();
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
  overlayHistory.open('menu', () => nav.closeMenu('history'));
  document.querySelector<HTMLButtonElement>('.auth-signin-btn')!.click();
  nav.destroy();
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  vi.runAllTimers();
  expect(open).not.toHaveBeenCalled();
});

it('closes the mobile drawer and waits for Back before opening username settings', () => {
  vi.useFakeTimers();
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
  auth.state = {
    user: { id: 'existing_user', name: 'Private Person', username: null, email: 'private@example.test', role: 'free' },
    isPending: false,
  };
  auth.listeners.forEach(callback => callback(auth.state));
  overlayHistory.open('menu', () => nav.closeMenu('history'));
  document.querySelector<HTMLButtonElement>('.auth-choose-username')!.click();
  expect(document.getElementById('mobileMenu')?.classList.contains('open')).toBe(false);
  expect(auth.openUserProfile).not.toHaveBeenCalled();
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  expect(auth.openUserProfile).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(auth.openUserProfile).toHaveBeenCalledOnce();
});
