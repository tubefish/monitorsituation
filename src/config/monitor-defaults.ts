import type { PanelConfig } from '@/types';
import { SITE_VARIANT } from './variant';
import { migrateMonitorMarketLayout } from './monitor-layout-migration';
import {
  ALL_PANELS,
  DEFAULT_PANELS as UPSTREAM_DEFAULT_PANELS,
  VARIANT_DEFAULTS as UPSTREAM_VARIANT_DEFAULTS,
  getEffectivePanelConfig,
} from './panels';

/**
 * $MONITOR factory layout.
 *
 * This is the panel set/order a brand-new visitor should receive for the full
 * variant. Panels that are not listed here stay available in the panel catalog,
 * but they are not enabled by default.
 *
 * Desktop natural footprints are owned by the panel components/CSS:
 * - live-news: 2 wide x 3 tall
 * - monitor-market: 1 wide x 2 tall
 * - commodity-watch: 2 wide x 3 tall
 * - threat-timeline: 2 wide x 2 tall
 * - intel: 1 wide x 2 tall
 * - fear-greed: 1 wide x 2 tall
 * - gdelt-intel: 2 wide x 2 tall
 * - escalation-correlation: 2 wide x 2 tall
 * - politics: 2 wide x 2 tall
 * - economic-correlation: 2 wide x 2 tall
 * - cascade: 2 wide x 2 tall
 * - finance: 2 wide x 2 tall (see base-layer.css)
 */
export const MONITOR_DEFAULT_PANEL_ORDER = [
  'map',
  'escalation-correlation',
  'market-heatmap',
  'commodity-watch',
  'live-news',
  'threat-timeline',
  'intel',
  'fear-greed',
  'gdelt-intel',
  'politics',
  'economic-correlation',
  'cascade',
  'finance',
  'monitor-market',
] as const;

/**
 * The upstream app has two legacy layout migrations that intentionally move
 * Live News to the front. That is correct for World Monitor, but it overrides
 * the dedicated $MONITOR order above on a fresh browser/profile.
 *
 * Own the saved order for the full MONITOR variant before App boots. Existing
 * layouts keep every other panel position; only X Tracker is moved directly
 * before Live News. Fresh layouts receive the MONITOR factory order. Mark the
 * upstream migrations complete so they cannot rewrite that order afterward.
 */
const MONITOR_PANEL_ORDER_MIGRATION_KEY = 'monitor-x-tracker-above-live-news-v2';
const PANEL_ORDER_STORAGE_KEY = 'panel-order';
const UPSTREAM_PANEL_ORDER_MIGRATION_KEY = 'worldmonitor-panel-order-v1.9';
const UPSTREAM_LAYOUT_RESET_MIGRATION_KEY = 'worldmonitor-layout-reset-v2.5';

function migrateMonitorPanelOrder(): void {
  if (SITE_VARIANT !== 'full' || typeof window === 'undefined') return;

  try {
    if (window.localStorage.getItem(MONITOR_PANEL_ORDER_MIGRATION_KEY) === 'done') return;

    const rawOrder = window.localStorage.getItem(PANEL_ORDER_STORAGE_KEY);
    let order: string[] | null = null;

    if (rawOrder) {
      const parsed: unknown = JSON.parse(rawOrder);
      if (Array.isArray(parsed)) {
        order = parsed.filter((key): key is string => typeof key === 'string');
      }
    }

    if (!order || order.length === 0) {
      order = MONITOR_DEFAULT_PANEL_ORDER.filter(key => key !== 'map');
    } else {
      const liveNewsIndex = order.indexOf('live-news');
      if (liveNewsIndex >= 0) {
        const withoutTracker = order.filter(key => key !== 'escalation-correlation');
        const targetIndex = withoutTracker.indexOf('live-news');
        withoutTracker.splice(targetIndex, 0, 'escalation-correlation');
        order = withoutTracker;
      }
    }

    window.localStorage.setItem(PANEL_ORDER_STORAGE_KEY, JSON.stringify(order));
    window.localStorage.setItem(UPSTREAM_PANEL_ORDER_MIGRATION_KEY, 'done');
    window.localStorage.setItem(UPSTREAM_LAYOUT_RESET_MIGRATION_KEY, 'done');
    window.localStorage.setItem(MONITOR_PANEL_ORDER_MIGRATION_KEY, 'done');
  } catch {
    // If storage is unavailable or corrupt, normal default layout handling still applies.
  }
}

migrateMonitorPanelOrder();

// Introduce the new section once without moving any existing panels or
// overwriting their saved sizes, zones, or enabled/disabled preferences.
if (SITE_VARIANT === 'full' && typeof window !== 'undefined') {
  try {
    const migrationKey = 'monitor-market-heatmap-order-v1';
    if (window.localStorage.getItem(migrationKey) !== 'done') {
      const order: unknown = JSON.parse(window.localStorage.getItem(PANEL_ORDER_STORAGE_KEY) || 'null');
      if (Array.isArray(order) && order.every(key => typeof key === 'string') && !order.includes('market-heatmap')) {
        const trackerIndex = order.indexOf('escalation-correlation');
        order.splice(trackerIndex >= 0 ? trackerIndex + 1 : order.length, 0, 'market-heatmap');
        window.localStorage.setItem(PANEL_ORDER_STORAGE_KEY, JSON.stringify(order));
      }
      window.localStorage.setItem(migrationKey, 'done');
    }
  } catch { /* Normal defaults still apply if storage is unavailable. */ }
}

if (SITE_VARIANT === 'full' && typeof window !== 'undefined') {
  try { migrateMonitorMarketLayout(window.localStorage); } catch { /* Storage may be disabled. */ }
}

/**
 * Keep every non-full monitor exactly as upstream defines it. Only the full
 * variant is narrowed to the finished $MONITOR dashboard.
 *
 * Mutate the upstream registry in place as well as re-exporting it. A few
 * legacy modules import panel defaults directly from config/panels instead of
 * the config barrel (mission reset/new-tab paths are examples). They hold live
 * references to these objects, so aligning the registry here prevents those
 * paths from resurrecting the old World Monitor default panel set.
 */
UPSTREAM_VARIANT_DEFAULTS.full = [...MONITOR_DEFAULT_PANEL_ORDER];

if (SITE_VARIANT === 'full') {
  for (const key of Object.keys(UPSTREAM_DEFAULT_PANELS)) {
    delete UPSTREAM_DEFAULT_PANELS[key];
  }
  for (const key of MONITOR_DEFAULT_PANEL_ORDER) {
    UPSTREAM_DEFAULT_PANELS[key] = getEffectivePanelConfig(key, SITE_VARIANT);
  }
}

export const VARIANT_DEFAULTS: Record<string, string[]> = UPSTREAM_VARIANT_DEFAULTS;

/** Variant-aware default panel map used whenever no saved panel preferences exist. */
export const DEFAULT_PANELS: Record<string, PanelConfig> = UPSTREAM_DEFAULT_PANELS;

/**
 * Build first-visit panel settings while keeping the complete panel catalog
 * addressable. Only panels in the selected variant's default set start enabled.
 */
export function getInitialPanelSettingsForVariant(variant: string): Record<string, PanelConfig> {
  const variantDefaults = new Set(VARIANT_DEFAULTS[variant] ?? VARIANT_DEFAULTS.full ?? []);
  return Object.fromEntries(
    Object.keys(ALL_PANELS).map((key) => {
      const config = getEffectivePanelConfig(key, variant);
      return [key, { ...config, enabled: variantDefaults.has(key) && config.enabled }];
    }),
  );
}

const SITE_VARIANT_DEFAULTS = new Set(VARIANT_DEFAULTS[SITE_VARIANT] ?? []);

export function isPanelInVariantDefaults(key: string): boolean {
  return SITE_VARIANT_DEFAULTS.has(key);
}
