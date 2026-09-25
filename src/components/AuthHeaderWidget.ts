import { subscribeAuthState, type AuthSession } from '@/services/auth-state';
import { mountUserButton, openSignIn, openSignUp } from '@/services/clerk';
import { t } from '@/services/i18n';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

const CLERK_ACCOUNT_THEME_STYLE_ID = 'monitor-clerk-account-theme';

/**
 * Clerk owns the Account/Profile & Security surface, so it is rendered outside
 * this component's DOM tree. Keep the account surface visually aligned with the
 * MONITOR shell by installing a narrowly-scoped set of overrides for Clerk's
 * UserProfile classes. Authentication behaviour and the sign-in/sign-up cards
 * are intentionally left untouched.
 */
function ensureClerkAccountTheme(): void {
  if (typeof document === 'undefined' || document.getElementById(CLERK_ACCOUNT_THEME_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CLERK_ACCOUNT_THEME_STYLE_ID;
  style.textContent = `
    .cl-userProfile-root {
      color-scheme: dark;
      --monitor-clerk-surface: rgba(24, 26, 29, 0.96);
      --monitor-clerk-sidebar: rgba(18, 20, 23, 0.97);
      --monitor-clerk-border: rgba(255, 255, 255, 0.09);
      --monitor-clerk-text: #edf0f2;
      --monitor-clerk-muted: #9ba3aa;
      --monitor-clerk-accent: #44ff88;
    }

    .cl-userProfile-root .cl-cardBox,
    .cl-userProfile-root .cl-card,
    .cl-userProfile-root .cl-pageScrollBox,
    .cl-userProfile-root .cl-userProfilePage,
    .cl-userProfile-root .cl-scrollBox {
      background: var(--monitor-clerk-surface) !important;
      color: var(--monitor-clerk-text) !important;
      border-color: var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-cardBox,
    .cl-userProfile-root .cl-card {
      border: 1px solid var(--monitor-clerk-border) !important;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55) !important;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .cl-userProfile-root .cl-navbar,
    .cl-userProfile-root .cl-navbarMobileMenuRow {
      background: var(--monitor-clerk-sidebar) !important;
      border-color: var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-navbar {
      border-right: 1px solid var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-navbarButton,
    .cl-userProfile-root .cl-navbarButtonIcon,
    .cl-userProfile-root .cl-headerTitle,
    .cl-userProfile-root .cl-profileSectionTitle,
    .cl-userProfile-root .cl-profileSectionContent,
    .cl-userProfile-root .cl-menuButton,
    .cl-userProfile-root .cl-menuList {
      color: var(--monitor-clerk-text) !important;
    }

    .cl-userProfile-root .cl-headerSubtitle,
    .cl-userProfile-root .cl-profileSectionSubtitle,
    .cl-userProfile-root .cl-navbarButton:not([data-active='true']) {
      color: var(--monitor-clerk-muted) !important;
    }

    .cl-userProfile-root .cl-navbarButton[data-active='true'],
    .cl-userProfile-root .cl-profileSectionPrimaryButton,
    .cl-userProfile-root .cl-userPreviewSecondaryIdentifier,
    .cl-userProfile-root a {
      color: var(--monitor-clerk-accent) !important;
    }

    .cl-userProfile-root .cl-navbarButton[data-active='true'] {
      background: rgba(68, 255, 136, 0.09) !important;
    }

    .cl-userProfile-root .cl-profileSection,
    .cl-userProfile-root .cl-profileSectionItem,
    .cl-userProfile-root .cl-menuList,
    .cl-userProfile-root .cl-menuItem,
    .cl-userProfile-root hr {
      border-color: var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-menuList,
    .cl-userProfile-root .cl-menuItem,
    .cl-userProfile-root .cl-formFieldInput,
    .cl-userProfile-root .cl-selectButton {
      background: rgba(12, 14, 16, 0.72) !important;
      color: var(--monitor-clerk-text) !important;
      border-color: var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-badge {
      background: rgba(255, 255, 255, 0.06) !important;
      color: var(--monitor-clerk-muted) !important;
      border-color: var(--monitor-clerk-border) !important;
    }

    .cl-userProfile-root .cl-modalCloseButton,
    .cl-userProfile-root .cl-navbarMobileMenuButton {
      color: var(--monitor-clerk-muted) !important;
    }

    .cl-userProfile-root .cl-modalCloseButton:hover,
    .cl-userProfile-root .cl-navbarButton:hover,
    .cl-userProfile-root .cl-menuItem:hover {
      background: rgba(255, 255, 255, 0.06) !important;
      color: var(--monitor-clerk-text) !important;
    }

    .cl-modalBackdrop:has(.cl-userProfile-root) {
      background: rgba(0, 0, 0, 0.62) !important;
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
    ensureClerkAccountTheme();

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
