import type { PanelConfig } from '@/types';
import { SITE_VARIANT } from './variant';
import {
  ALL_PANELS,
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
 * - monitor-market: 2 wide x 3 tall
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
  'live-news',
  'monitor-market',
  'threat-timeline',
  'intel',
  'fear-greed',
  'gdelt-intel',
  'escalation-correlation',
  'politics',
  'economic-correlation',
  'cascade',
  'finance',
] as const;

/**
 * Keep every non-full monitor exactly as upstream defines it. Only the full
 * variant is narrowed to the finished $MONITOR dashboard.
 */
export const VARIANT_DEFAULTS: Record<string, string[]> = {
  ...UPSTREAM_VARIANT_DEFAULTS,
  full: [...MONITOR_DEFAULT_PANEL_ORDER],
};

/** Variant-aware default panel map used whenever no saved panel preferences exist. */
export const DEFAULT_PANELS: Record<string, PanelConfig> = Object.fromEntries(
  (VARIANT_DEFAULTS[SITE_VARIANT] ?? VARIANT_DEFAULTS.full ?? []).map((key) => [
    key,
    getEffectivePanelConfig(key, SITE_VARIANT),
  ]),
);

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
