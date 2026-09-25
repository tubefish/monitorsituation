import { subscribeAuthState, type AuthSession } from '@/services/auth-state';
import { mountUserButton, openSignIn, openSignUp } from '@/services/clerk';
import { t } from '@/services/i18n';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

const CLERK_ACCOUNT_BACKDROP_STYLE_ID = 'monitor-clerk-account-backdrop';

/**
 * Keep Clerk's Account/Profile & Security backdrop aligned with the MONITOR
 * shell while Clerk's own appearance follows the active site theme.
 */
function ensureClerkAccountBackdrop(): void {
  if (typeof document === 'undefined' || document.getElementById(CLERK_ACCOUNT_BACKDROP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CLERK_ACCOUNT_BACKDROP_STYLE_ID;
  style.textContent = `
    .cl-modalBackdrop:has(.cl-userProfile-root) {
      background: rgba(34, 36, 39, 0.72) !important;
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
    }
  `;
  document.head.appendChild(style);
}

export class AuthHeaderWidget {
  private container: HTMLElement;
  private unsubscribeAuth: (() => void) | null = null;
  private unmountUserButton: (() => void) | null = null;
  private themeObserver: MutationObserver | null = null;
  private currentAuthState: AuthSession | null = null;
  private onSignInClick?: () => void;
  private onSettingsClick?: () => void;
  private onBillingClick?: () => void;

  constructor(
    onSignInClick?: () => void,
    onSettingsClick?: () => void,
    onBillingClick?: () => void,
  ) {
    this.onSignInClick = onSignInClick;
    this.onSettingsClick = onSettingsClick;
    this.onBillingClick = onBillingClick;
    this.container = document.createElement('div');
    this.container.className = 'auth-header-widget';
    ensureClerkAccountBackdrop();

    // The MONITOR shell currently omits the upstream authWidgetMount node even
    // though EventHandlerManager still initializes this widget and header.css
    // still styles the mount. Recreate the mount when needed so the existing
    // Clerk account controls can be exercised safely on preview builds.
    // Preview deployments must provide VITE_CLERK_PUBLISHABLE_KEY for Clerk UI.
    if (!document.getElementById('authWidgetMount')) {
      const headerRight = document.querySelector<HTMLElement>('.header-right');
      if (headerRight) {
        const mount = document.createElement('div');
        mount.id = 'authWidgetMount';
        headerRight.appendChild(mount);
      }
    }

    // Clerk's sign-in/sign-up surfaces receive a fresh appearance object each
    // time they open, but the UserButton (which owns Profile & Security) is
    // mounted once. Re-mount it when data-theme changes so its account panel
    // always receives the current light/dark appearance from getAppearance().
    if (typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver((mutations) => {
        const themeChanged = mutations.some(
          (mutation) => mutation.type === 'attributes' && mutation.attributeName === 'data-theme',
        );
        if (!themeChanged) return;

        const state = this.currentAuthState;
        if (!state || state.isPending || !state.user) return;
        this.render(state);
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }

    this.unsubscribeAuth = subscribeAuthState((state: AuthSession) => {
      this.currentAuthState = state;
      if (state.isPending) {
        this.renderPending();
        return;
      }
      this.render(state);
    });
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.unmountUserButton?.();
    this.unmountUserButton = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.currentAuthState = null;
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
  }

  private render(state: AuthSession): void {
    this.unmountUserButton?.();
    this.unmountUserButton = null;
    this.container.classList.remove('auth-header-widget-pending');
    this.container.removeAttribute('aria-busy');
    setTrustedHtml(this.container, trustedHtml('', 'legacy direct innerHTML migration'));

    if (!state.user) {
      this.renderSignedOut();
      return;
    }
    this.renderSignedIn(state.user);
  }

  private renderPending(): void {
    this.unmountUserButton?.();
    this.unmountUserButton = null;
    this.container.classList.add('auth-header-widget-pending');
    this.container.setAttribute('aria-busy', 'true');
    setTrustedHtml(this.container, trustedHtml('', 'legacy direct innerHTML migration'));

    const signInSkeleton = document.createElement('span');
    signInSkeleton.className = 'auth-header-skeleton auth-header-skeleton-signin';
    signInSkeleton.setAttribute('aria-hidden', 'true');
    this.container.appendChild(signInSkeleton);

    const signUpSkeleton = document.createElement('span');
    signUpSkeleton.className = 'auth-header-skeleton auth-header-skeleton-signup';
    signUpSkeleton.setAttribute('aria-hidden', 'true');
    this.container.appendChild(signUpSkeleton);
  }

  private renderSignedOut(): void {
    const signInBtn = document.createElement('button');
    signInBtn.className = 'auth-signin-btn';
    signInBtn.textContent = t('auth.signIn');
    signInBtn.addEventListener('click', () => {
      if (this.onSignInClick) this.onSignInClick();
      else openSignIn();
    });
    this.container.appendChild(signInBtn);

    const signUpLink = document.createElement('button');
    signUpLink.className = 'auth-signup-link';
    signUpLink.textContent = t('auth.createAccount');
    signUpLink.addEventListener('click', () => openSignUp());
    this.container.appendChild(signUpLink);
  }

  private renderSignedIn(user: NonNullable<AuthSession['user']>): void {
    const username = document.createElement('span');
    username.className = 'auth-header-username';
    username.textContent = user.username?.trim() || user.name;
    username.title = username.textContent;
    this.container.appendChild(username);

    const userBtnEl = document.createElement('div');
    userBtnEl.className = 'auth-clerk-user-button';
    this.container.appendChild(userBtnEl);
    this.unmountUserButton = mountUserButton(userBtnEl, {
      onBillingClick: this.onBillingClick,
      onSettingsClick: this.onSettingsClick,
    });
  }
}
