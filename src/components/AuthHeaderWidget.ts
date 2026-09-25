import { subscribeAuthState, type AuthSession } from '@/services/auth-state';
import { mountUserButton, openSignIn, openSignUp } from '@/services/clerk';
import { t } from '@/services/i18n';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

const CLERK_ACCOUNT_BACKDROP_STYLE_ID = 'monitor-clerk-account-backdrop';

/**
 * Keep Clerk's Account/Profile & Security backdrop aligned with the MONITOR
 * shell, and bind Clerk's live CSS variables to the site's data-theme value.
 * Unlike Clerk's mount-time appearance object, these variables update while
 * the profile modal is already open, so no hard refresh is required.
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

    html[data-theme='dark'] :where(.cl-userProfile-root, .cl-userProfile-root *) {
      --clerk-color-background: #0f0f0f !important;
      --clerk-color-input-background: #141414 !important;
      --clerk-color-input: #141414 !important;
      --clerk-color-input-text: #e8e8e8 !important;
      --clerk-color-input-foreground: #e8e8e8 !important;
      --clerk-color-text: #e8e8e8 !important;
      --clerk-color-foreground: #e8e8e8 !important;
      --clerk-color-text-secondary: #aaaaaa !important;
      --clerk-color-muted-foreground: #aaaaaa !important;
      --clerk-color-primary: #44ff88 !important;
      --clerk-color-primary-foreground: #000000 !important;
      --clerk-color-neutral: #e8e8e8 !important;
      --clerk-color-danger: #ff4444 !important;
    }

    html[data-theme='light'] :where(.cl-userProfile-root, .cl-userProfile-root *) {
      --clerk-color-background: #ffffff !important;
      --clerk-color-input-background: #f8f9fa !important;
      --clerk-color-input: #f8f9fa !important;
      --clerk-color-input-text: #1a1a1a !important;
      --clerk-color-input-foreground: #1a1a1a !important;
      --clerk-color-text: #1a1a1a !important;
      --clerk-color-foreground: #1a1a1a !important;
      --clerk-color-text-secondary: #555555 !important;
      --clerk-color-muted-foreground: #555555 !important;
      --clerk-color-primary: #16a34a !important;
      --clerk-color-primary-foreground: #ffffff !important;
      --clerk-color-neutral: #1a1a1a !important;
      --clerk-color-danger: #dc2626 !important;
    }
  `;
  document.head.appendChild(style);
}

export class AuthHeaderWidget {
  private container: HTMLElement;
  private unsubscribeAuth: (() => void) | null = null;
  private unmountUserButton: (() => void) | null = null;
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

    this.unsubscribeAuth = subscribeAuthState((state: AuthSession) => {
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
