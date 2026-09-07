import type { AppContext } from '@/app/app-context';
import type { MapView } from '@/components/MapContainer';
import type { AuthLauncher } from '@/components/AuthLauncher';
import { AuthHeaderWidget } from '@/components/AuthHeaderWidget';
import { getAuthState, subscribeAuthState } from '@/services/auth-state';
import { track, trackMapViewChange, trackThemeChanged } from '@/services/analytics';
import { getCurrentTheme, setTheme } from '@/utils';
import { createFocusTrap, type FocusTrap } from '@/utils/focus-trap';
import {
  overlayHistory,
  type OverlayCloseOrigin,
  type OverlayId,
} from '@/utils/overlay-history';
import { reconcileOverlayForTab } from '@/app/mobile-overlay-reconcile';

const MONITOR_DEX_URL = 'https://dexscreener.com/robinhood/0xcfa7bb34e23a7022c3de3e1618e1ff29cde8f16a76c341eca19d16f928968a3d?utm_source=worldmonitor&utm_medium=referral&utm_campaign=monitor-market';
const MONITOR_CONTRACT_ADDRESS = '0x1a911bb954dAA9CB38513423075bE74450351e18';

const MOBILE_MAP_GLOBE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M3 12h18"></path>
    <path d="M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9"></path>
    <path d="M12 3c-2.6 2.5-4 5.6-4 9s1.4 6.5 4 9"></path>
  </svg>
`;

const MOBILE_TODAY_SUNRISE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
    <path d="M4 21a8 8 0 0 1 16 0H4Z"></path>
    <path d="M12 1l1.25 5h-2.5L12 1Z"></path>
    <path d="M4.1 4.1 8.7 7 7 8.7 4.1 4.1Z"></path>
    <path d="m1 11.7 5.4-1.1-.45 2.4L1 11.7Z"></path>
    <path d="m19.9 4.1-4.6 2.9L17 8.7l2.9-4.6Z"></path>
    <path d="m23 11.7-5.4-1.1.45 2.4L23 11.7Z"></path>
  </svg>
`;

const MOBILE_MORE_MENU_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M4 6h16"></path>
    <path d="M4 12h16"></path>
    <path d="M4 18h16"></path>
  </svg>
`;

type MobilePrimaryNavCallbacks = {
  openSearch(options: { replaceOverlayId?: OverlayId; historyPending: true }): void;
  navigateToVariant(variant: string, options: { isLocalDev: boolean }): Promise<void>;
  openMission(anchor: HTMLElement): void;
};

export class MobilePrimaryNav {
  private readonly listeners = new AbortController();
  private menuOpenFrame: number | null = null;
  private menuTrap: FocusTrap | null = null;
  private regionTrap: FocusTrap | null = null;
  private regionOpenFrame: number | null = null;
  private alertScrollFrame: number | null = null;
  private authWidget: AuthHeaderWidget | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private unsubscribeHistory: (() => void) | null = null;
  private activeTab = 'map';
  private lastContentTab = 'map';

  constructor(
    private readonly ctx: AppContext,
    private readonly callbacks: MobilePrimaryNavCallbacks,
  ) {}

  init(): void {
    this.installCompactMapStyle();
    this.setupTabBar();
    this.setupMenu();
    this.unsubscribeHistory = overlayHistory.subscribe((top) => {
      if (top === 'search' || top === 'search-pending') this.setActive('search');
      else if (top === 'menu' || top === 'region' || top === 'settings' || top === 'settings-pending') this.setActive('more');
      else if (!top && (this.activeTab === 'search' || this.activeTab === 'more')) this.setActive(this.lastContentTab);
    });
  }

  setupAuth(modal: AuthLauncher): void {
    const mobileMount = document.getElementById('mobileAuthWidgetMount');
    const fallback = document.getElementById('mobileAuthFallback') as HTMLButtonElement | null;
    const openAuth = () => {
      this.closeMenu();
      modal.open();
    };
    fallback?.addEventListener('click', openAuth, { signal: this.listeners.signal });
    if (!mobileMount) return;

    this.authWidget = new AuthHeaderWidget(openAuth);
    mobileMount.appendChild(this.authWidget.getElement());
    const renderPending = (pending: boolean) => {
      mobileMount.hidden = pending;
      if (fallback) fallback.hidden = !pending;
    };
    renderPending(getAuthState().isPending);
    this.unsubscribeAuth = subscribeAuthState((state) => renderPending(state.isPending));
  }

  updateThemeItem(): void {
    const button = document.getElementById('mobileMenuTheme');
    if (!button) return;
    const isDark = getCurrentTheme() === 'dark';
    const icon = button.querySelector('.mobile-menu-item-icon');
    const label = button.querySelector('.mobile-menu-item-label');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }

  closeMenu(origin: OverlayCloseOrigin = 'control'): void {
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    if (!overlay || !menu) return;
    if (this.menuOpenFrame !== null) cancelAnimationFrame(this.menuOpenFrame);
    this.menuOpenFrame = null;
    menu.classList.remove('open');
    overlay.classList.remove('open');
    this.menuTrap?.deactivate();
    const sheetOpen = document.getElementById('regionBottomSheet')?.classList.contains('open');
    if (!sheetOpen) document.body.style.overflow = '';
    if (origin === 'control') overlayHistory.close('menu');
  }

  destroy(): void {
    this.listeners.abort();
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = null;
    this.authWidget?.destroy();
    this.authWidget = null;
    if (this.menuOpenFrame !== null) cancelAnimationFrame(this.menuOpenFrame);
    if (this.regionOpenFrame !== null) cancelAnimationFrame(this.regionOpenFrame);
    if (this.alertScrollFrame !== null) cancelAnimationFrame(this.alertScrollFrame);
    this.menuOpenFrame = null;
    this.regionOpenFrame = null;
    this.alertScrollFrame = null;
    this.menuTrap?.deactivate({ restoreFocus: false });
    this.menuTrap = null;
    this.regionTrap?.deactivate({ restoreFocus: false });
    this.regionTrap = null;
  }

  private installCompactMapStyle(): void {
    if (document.getElementById('monitor-mobile-map-size')) return;

    const style = document.createElement('style');
    style.id = 'monitor-mobile-map-size';
    style.textContent = `
      @media (max-width: 768px) {
        #mapSection.map-section:not(.collapsed):not(.live-news-fullscreen) {
          height: clamp(420px, 62dvh, 560px) !important;
          min-height: 0 !important;
          max-height: 560px !important;
        }

        /* $MONITOR mobile panel footprints. Desktop retains each component's
           natural 3-row default; these overrides only apply below 768px. */
        #panelsGrid > .panel[data-panel="live-news"]:not(.panel-collapsed) {
          grid-row: span 2 !important;
          min-height: var(--dashboard-first-grid-reservation) !important;
        }

        #panelsGrid > .panel[data-panel="monitor-market"]:not(.panel-collapsed) {
          grid-row: span 4 !important;
          min-height: calc(
            var(--dashboard-panel-row-min) * 4 +
            var(--dashboard-grid-gap) * 3
          ) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private setupTabBar(): void {
    const tabBar = document.getElementById('mobileTabBar');
    if (!tabBar) return;

    // $MONITOR mobile opens map-first: Map occupies slot one, Today slot two.
    const mapButton = tabBar.querySelector<HTMLButtonElement>('[data-mobile-tab="map"]');
    const todayButton = tabBar.querySelector<HTMLButtonElement>('[data-mobile-tab="today"]');
    const dexButton = tabBar.querySelector<HTMLButtonElement>('[data-mobile-tab="alerts"]');
    const moreButton = tabBar.querySelector<HTMLButtonElement>('[data-mobile-tab="more"]');
    if (mapButton) tabBar.prepend(mapButton);
    if (mapButton && todayButton) mapButton.after(todayButton);

    // The shared shell reserves five grid tracks, but $MONITOR hides Search.
    // Replace that template with four equal tracks so each visible control
    // occupies exactly one quarter of the available tab-bar width.
    tabBar.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    [mapButton, todayButton, dexButton, moreButton].forEach((button) => {
      if (!button) return;
      button.style.width = '100%';
      button.style.minWidth = '0';
    });

    this.setTabIcon(mapButton, MOBILE_MAP_GLOBE_ICON);
    this.setTabIcon(todayButton, MOBILE_TODAY_SUNRISE_ICON);
    this.setTabLabel(dexButton, 'DEX');
    if (dexButton) dexButton.setAttribute('aria-label', 'Open DEX on Dexscreener');
    this.setTabIcon(moreButton, MOBILE_MORE_MENU_ICON);

    this.setActive('map');
    this.expandMap();
    // On the globe renderer, lower logical zoom values are farther away.
    // Zoom 1 maps to the standard global-view altitude (~1.8).
    this.ctx.map?.setZoom(1);

    tabBar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mobile-tab]');
      const tab = button?.dataset.mobileTab;
      if (!tab) return;
      if (this.alertScrollFrame !== null) {
        cancelAnimationFrame(this.alertScrollFrame);
        this.alertScrollFrame = null;
      }

      // $MONITOR uses the former Alerts slot as a direct external DEX link.
      // Handle it before overlay reconciliation so opening the DEX cannot alter
      // whichever Map/Today state the user is currently viewing.
      if (tab === 'alerts') {
        window.open(MONITOR_DEX_URL, '_blank', 'noopener,noreferrer');
        return;
      }

      const replaceOverlayId = this.reconcileOverlayForTab(tab);
      if (replaceOverlayId === null) return;

      switch (tab) {
        case 'today':
          this.exitMap();
          this.collapseMap();
          this.scrollToLiveNews();
          break;
        case 'map': {
          // Keep the bottom Map tab on the normal mobile map path. The old
          // implementation expanded the map and then immediately clicked the
          // separate fullscreen control, which could race the collapse/resize
          // state and make this tab appear intermittent.
          this.exitMap();
          this.expandMap();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('.main-content')?.scrollTo({
                top: 0,
                behavior: 'smooth',
              });
              window.dispatchEvent(new Event('resize'));
            });
          });
          break;
        }
        case 'search': {
          this.exitMap();
          track('search-open', { source: 'mobile-tab' });
          this.callbacks.openSearch({
            replaceOverlayId,
            historyPending: true,
          });
          break;
        }
        case 'more':
          this.exitMap();
          this.openMenu(replaceOverlayId);
          break;
        default:
          return;
      }

      if (tab === 'map' || tab === 'today') {
        this.lastContentTab = tab;
      }
      this.setActive(tab);
    }, { signal: this.listeners.signal });
  }

  private setTabIcon(button: HTMLButtonElement | null, svg: string): void {
    const icon = button?.querySelector<HTMLElement>('.mobile-tab-icon');
    if (icon) icon.innerHTML = svg;
  }

  private setTabLabel(button: HTMLButtonElement | null, text: string): void {
    if (!button) return;
    const label = Array.from(button.querySelectorAll<HTMLElement>('span'))
      .find((span) => !span.classList.contains('mobile-tab-icon'));
    if (label) {
      label.textContent = text;
      return;
    }

    // Fallback for shells where the label is a direct text node rather than a span.
    const textNode = Array.from(button.childNodes)
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (textNode) textNode.textContent = text;
  }

  private setupMenu(): void {
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    const close = document.getElementById('mobileMenuClose');
    const sheet = document.getElementById('regionBottomSheet');
    if (!overlay || !menu || !close) return;
    const options = { signal: this.listeners.signal };

    // $MONITOR's More drawer only needs Global, contract copy, theme, and X.
    menu.querySelectorAll<HTMLElement>('.mobile-menu-variant').forEach((item) => item.remove());
    document.getElementById('mobileMenuMission')?.remove();
    document.getElementById('mobileMenuSettings')?.remove();
    menu.querySelector<HTMLElement>(':scope > .mobile-menu-divider')?.remove();

    const themeButton = document.getElementById('mobileMenuTheme');
    let contractButton = document.getElementById('mobileMenuContract') as HTMLButtonElement | null;
    if (!contractButton && themeButton) {
      contractButton = document.createElement('button');
      contractButton.type = 'button';
      contractButton.className = 'mobile-menu-item';
      contractButton.id = 'mobileMenuContract';

      const icon = document.createElement('span');
      icon.className = 'mobile-menu-item-icon';
      icon.textContent = '⧉';

      const label = document.createElement('span');
      label.className = 'mobile-menu-item-label';
      label.textContent = 'Contact Address';

      contractButton.append(icon, label);
      themeButton.before(contractButton);
    }

    overlay.addEventListener('click', () => this.closeMenu(), options);
    close.addEventListener('click', () => this.closeMenu(), options);
    document.getElementById('mobileMenuRegion')?.addEventListener('click', () => {
      this.openRegion('menu');
    }, options);
    contractButton?.addEventListener('click', async () => {
      const label = contractButton?.querySelector<HTMLElement>('.mobile-menu-item-label');
      if (!label) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(MONITOR_CONTRACT_ADDRESS);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = MONITOR_CONTRACT_ADDRESS;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }

        label.textContent = 'Copied';
        window.setTimeout(() => {
          if (label.isConnected) label.textContent = 'Contact Address';
        }, 1500);
      } catch (error) {
        console.warn('Failed to copy token CA:', error);
      }
    }, options);
    document.getElementById('mobileMenuTheme')?.addEventListener('click', () => {
      this.closeMenu();
      const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      trackThemeChanged(next);
    }, options);
    document.getElementById('regionSheetBackdrop')?.addEventListener('click', () => this.closeRegion(), options);
    sheet?.querySelectorAll<HTMLButtonElement>('.region-sheet-option').forEach((option) => {
      option.addEventListener('click', () => this.selectRegion(option, sheet), options);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (sheet?.classList.contains('open')) this.closeRegion();
      else if (menu.classList.contains('open')) this.closeMenu();
    }, options);
  }

  private selectRegion(option: HTMLButtonElement, sheet: HTMLElement): void {
    const region = option.dataset.region;
    if (!region) return;
    this.ctx.map?.setView(region as MapView);
    trackMapViewChange(region);
    const select = document.getElementById('regionSelect') as HTMLSelectElement | null;
    if (select) select.value = region;
    sheet.querySelectorAll('.region-sheet-option').forEach((item) => {
      item.classList.toggle('active', item === option);
      const check = item.querySelector('.region-sheet-check');
      if (check) check.textContent = item === option ? '✓' : '';
    });
    const label = document.getElementById('mobileMenuRegion')?.querySelector('.mobile-menu-item-label');
    if (label) label.textContent = option.querySelector('span')?.textContent ?? '';
    this.closeRegion();
  }

  private openMenu(replaceOverlayId?: OverlayId): void {
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    if (!overlay || !menu) return;
    overlay.classList.add('open');
    if (this.menuOpenFrame !== null) cancelAnimationFrame(this.menuOpenFrame);
    this.menuOpenFrame = requestAnimationFrame(() => {
      this.menuOpenFrame = null;
      menu.classList.add('open');
      this.menuTrap ??= createFocusTrap(menu);
      this.menuTrap.activate();
    });
    document.body.style.overflow = 'hidden';
    const close = (origin: OverlayCloseOrigin) => this.closeMenu(origin);
    if (replaceOverlayId) overlayHistory.replaceInPlace(replaceOverlayId, 'menu', close);
    else overlayHistory.open('menu', close);
  }

  private openRegion(replaceOverlayId?: OverlayId): void {
    const backdrop = document.getElementById('regionSheetBackdrop');
    const sheet = document.getElementById('regionBottomSheet');
    if (!backdrop || !sheet) return;
    backdrop.classList.add('open');
    if (this.regionOpenFrame !== null) cancelAnimationFrame(this.regionOpenFrame);
    this.regionOpenFrame = requestAnimationFrame(() => {
      this.regionOpenFrame = null;
      sheet.classList.add('open');
      this.regionTrap ??= createFocusTrap(sheet);
      this.regionTrap.activate();
    });
    const close = (origin: OverlayCloseOrigin) => this.closeRegion(origin);
    if (replaceOverlayId) overlayHistory.replaceInPlace(replaceOverlayId, 'region', close);
    else overlayHistory.open('region', close);
    document.body.style.overflow = 'hidden';
  }

  private closeRegion(origin: OverlayCloseOrigin = 'control'): void {
    const backdrop = document.getElementById('regionSheetBackdrop');
    const sheet = document.getElementById('regionBottomSheet');
    if (!backdrop || !sheet) return;
    if (this.regionOpenFrame !== null) cancelAnimationFrame(this.regionOpenFrame);
    this.regionOpenFrame = null;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    this.regionTrap?.deactivate();
    document.body.style.overflow = '';
    if (origin === 'control') overlayHistory.close('region');
  }

  private reconcileOverlayForTab(tab: string): OverlayId | undefined | null {
    return reconcileOverlayForTab(tab, {
      top: () => overlayHistory.top(),
      dismiss: (id) => overlayHistory.dismiss(id),
      settingsHasPendingChanges: () => this.ctx.unifiedSettings?.hasPendingChanges() ?? false,
      closeSettings: () => this.ctx.unifiedSettings?.close(),
      setActive: (nextTab) => this.setActive(nextTab),
    });
  }

  private exitMap(): void {
    if (document.getElementById('mapSection')?.classList.contains('live-news-fullscreen')) {
      document.getElementById('mapFullscreenBtn')?.click();
    }
  }

  private expandMap(): void {
    const mapSection = document.getElementById('mapSection');
    if (mapSection?.classList.contains('collapsed')) {
      document.querySelector<HTMLButtonElement>('.map-collapse-btn')?.click();
    }
  }

  private collapseMap(): void {
    const mapSection = document.getElementById('mapSection');
    if (mapSection && !mapSection.classList.contains('collapsed')) {
      document.querySelector<HTMLButtonElement>('.map-collapse-btn')?.click();
    }
  }

  private scrollToLiveNews(): void {
    requestAnimationFrame(() => {
      const liveNewsPanel = document.querySelector<HTMLElement>(
        '#panelsGrid [data-panel="live-news"]:not(.hidden)',
      );
      if (liveNewsPanel) {
        liveNewsPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      document.getElementById('panelsGrid')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  private setActive(tab: string): void {
    this.activeTab = tab;
    document.getElementById('mobileTabBar')?.querySelectorAll<HTMLButtonElement>('[data-mobile-tab]').forEach((button) => {
      const active = button.dataset.mobileTab === tab;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
}
