import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { AuthSession } from '@/services/auth-state';
import { initTestI18n } from './helpers/i18n.mts';

const auth = vi.hoisted(() => ({
  state: { user: null, isPending: false } as AuthSession,
  listeners: new Set<(state: AuthSession) => void>(),
}));
vi.mock('@/services/auth-state', () => ({
  subscribeAuthState: (callback: (state: AuthSession) => void) => {
    auth.listeners.add(callback);
    callback(auth.state);
    return () => auth.listeners.delete(callback);
  },
}));
import { AuthHeaderWidget } from '@/components/AuthHeaderWidget';
import { __setClerkInstanceForTests, getCurrentClerkUser } from '@/services/clerk';

const profile = vi.fn();
const unmount = vi.fn();
let widget: AuthHeaderWidget | undefined;

function setUser(username: string | null) {
  __setClerkInstanceForTests({
    user: {
      id: 'user_existing', username, fullName: 'Private Person', firstName: 'Private',
      primaryEmailAddress: { emailAddress: 'private@example.test' }, publicMetadata: {},
    },
    openUserProfile: profile,
    mountUserButton: vi.fn(),
    unmountUserButton: unmount,
  } as unknown as NonNullable<Parameters<typeof __setClerkInstanceForTests>[0]>);
  auth.state = { user: { ...getCurrentClerkUser()!, role: 'free' }, isPending: false };
  auth.listeners.forEach(callback => callback(auth.state));
}

beforeAll(initTestI18n);
beforeEach(() => {
  profile.mockReset();
  unmount.mockReset();
});
afterEach(() => {
  widget?.destroy();
  widget = undefined;
  __setClerkInstanceForTests(null);
});

it('uses the chosen username for every public identity field', () => {
  setUser('  situationwatcher  ');
  expect(getCurrentClerkUser()).toMatchObject({
    name: 'situationwatcher', username: 'situationwatcher', id: 'user_existing',
  });
  widget = new AuthHeaderWidget();
  expect(widget.getElement().textContent).toBe('situationwatcher');
  expect(widget.getElement().querySelector('.auth-choose-username')).toBeNull();
});

it.each([null, '', '   '])('offers username selection without exposing a real name when username is %j', username => {
  setUser(username);
  expect(getCurrentClerkUser()).toMatchObject({ name: 'Account', username: null });
  widget = new AuthHeaderWidget();
  const element = widget.getElement();
  expect(element.textContent).toBe('Choose username');
  expect(element.textContent).not.toMatch(/Private|@example/);
  element.querySelector<HTMLButtonElement>('.auth-choose-username')!.click();
  expect(profile).toHaveBeenCalledOnce();
  expect(profile).toHaveBeenCalledWith(expect.objectContaining({ appearance: expect.any(Object) }));
});

it('updates the existing account header after Clerk saves a username', () => {
  setUser(null);
  widget = new AuthHeaderWidget();
  setUser('newhandle');
  expect(widget.getElement().textContent).toBe('newhandle');
  expect(widget.getElement().querySelector('.auth-choose-username')).toBeNull();
  expect(unmount).toHaveBeenCalledOnce();
});

it('returns no identity after sign-out', () => {
  setUser('situationwatcher');
  __setClerkInstanceForTests(null);
  expect(getCurrentClerkUser()).toBeNull();
});
