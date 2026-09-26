import { ALL_PANELS } from '@/config/panels';

// Panels that remain implemented in the product but should not be exposed in
// Settings -> Panels. Keep both canonical and UI-facing names here because a
// few panels use different labels between the config and the settings screen.
const HIDDEN_SETTINGS_PANEL_NAMES = new Set([
  'National Debt Clock',
  'Global Debt Clock',
  'X News Accounts',
  'Telegram Intel',
  'Cross-Source Signal Aggregator',
  'Cross-Source Signals',
  'Radiation Watch',
  'Thermal Escalation',
  'Israel Sirens',
  'Toronto Safety',
  'R&D Signal',
  'Population Exposure',
  'Social Velocity',
  'Security Advisories',
  'UNHCR Displacement',
  'Climate News',
  'Real Big Mac Index',
  'Big Mac Index',
  'FAO Food Price Index',
  'Fires',
  'Disease Outbreaks',
  'Grocery Index',
  'Disaster Cascade',
  'Country Instability',
  'Force Posture',
  'Strategic Risk Overview',
  'AI Forecasts',
  'Armed Conflict Events',
  'UCDP Conflict Events',
  'NQ Pulse',
  'NQ Catalysts',
  'Economic Calendar',
  'CFTC Cot Positioning',
  'COT Positioning',
  'Earnings Calendar',
  'Yield Curve & Rates',
  'Yield Curve',
  'Financial Stress Indicator',
  'Financial Stress',
  'Macro Indicators',
  'AAII Investor Sentiment',
  'AAII Sentiment',
  'Market Breadth',
  'ALT Tokens',
  'Crypto Sectors',
  'DEFI Tokens',
  'AI Tokens',
  'FX Rates',
  'AI Regulation Dashboard',
  'Service Status',
  'Tech Readiness Index',
  'BTC ETF Tracker',
  'Stable Coins',
  'Stablecoins',
  'Internet Disruptions',
  'Tech Events',
  'Crypto',
  'Windy Live Webcam',
  'Climate Anomalies',
  'Energy Crisis Tracker',
  'Hormuz Trade Tracker',
  'Fuel Prices',
  'Energy Disruptions Log',
  'Global Fuel Shortage Registry',
  'Strategic Storage Atlas',
  'Chokepoint Status',
  'Predictions',
  'Global Energy Risk Overview',
  'Airline Intelligence',
  'Macro Stress',
  'Gulf Economies',
  'Sanctions & Designations',
  'Sanctions Pressure',
  'BTC Regime',
  'China Activity Nowcast',
  'Sector Heatmap',
  'China Logistics Corridors',
  'Gold Intelligence',
  'Oil Inventories',
  'Markets',
  'News Markets',
  'News ↔ Markets',
  'Oil & Gas Pipeline Status',
  'Energy Complex',
  'Metals and Materials',
  'Metals & Materials',
  'Supply Chain',
  '24/7 Positioning',
  'Liquidity Shifts',
  'AI Insights',
  'Global Giving benchmarks',
  'Global Giving',
  'Renewable Energy',
  'Consumer Prices',
  'Strategic Posture',
  'AI Strategic Posture',
]);

const HIDDEN_SETTINGS_PANEL_KEYS = new Set(
  Object.entries(ALL_PANELS)
    .filter(([, panel]) => HIDDEN_SETTINGS_PANEL_NAMES.has(panel.name))
    .map(([key]) => key),
);

function shouldHidePanelItem(item: HTMLElement): boolean {
  const key = item.dataset.panel;
  if (key && HIDDEN_SETTINGS_PANEL_KEYS.has(key)) return true;

  // Fall back to the exact rendered label. This catches variant/local config
  // naming differences without hiding unrelated panels through fuzzy matches.
  const label = item.querySelector<HTMLElement>('.panel-toggle-label')?.textContent?.trim();
  return Boolean(label && HIDDEN_SETTINGS_PANEL_NAMES.has(label));
}

function hideConfiguredPanelItems(root: Element): void {
  const candidates: HTMLElement[] = [];

  if (root instanceof HTMLElement && root.matches('.panel-toggle-item[data-panel]')) {
    candidates.push(root);
  }

  root.querySelectorAll<HTMLElement>('.panel-toggle-item[data-panel]').forEach((item) => {
    candidates.push(item);
  });

  for (const item of candidates) {
    if (!shouldHidePanelItem(item)) continue;

    // Remove the complete settings row instead of relying on the HTML `hidden`
    // attribute. The settings stylesheet gives these rows an explicit display
    // value, which can override `hidden` and make the row visible again.
    item.closest<HTMLElement>('.panel-settings-item')?.remove();
  }
}

function installSettingsPanelVisibilityGuard(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  hideConfiguredPanelItems(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) hideConfiguredPanelItems(node);
      });
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installSettingsPanelVisibilityGuard();
