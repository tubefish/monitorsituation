import { ALL_PANELS } from '@/config/panels';

// Panels that remain implemented in the product but should not be exposed in
// Settings -> Panels. Keep this list label-based so it continues to work when
// panel keys are reorganized; ALL_PANELS resolves the labels to stable keys.
const HIDDEN_SETTINGS_PANEL_NAMES = new Set([
  'Global Debt Clock',
  'X News Accounts',
  'Telegram Intel',
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
  'COT Positioning',
  'Earnings Calendar',
  'Yield Curve',
  'Financial Stress Indicator',
  'Financial Stress',
  'Macro Indicators',
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

function hideConfiguredPanelItems(root: Element): void {
  const candidates: HTMLElement[] = [];

  if (root instanceof HTMLElement && root.matches('.panel-toggle-item[data-panel]')) {
    candidates.push(root);
  }

  root.querySelectorAll<HTMLElement>('.panel-toggle-item[data-panel]').forEach((item) => {
    candidates.push(item);
  });

  for (const item of candidates) {
    const key = item.dataset.panel;
    if (!key || !HIDDEN_SETTINGS_PANEL_KEYS.has(key)) continue;
    item.closest<HTMLElement>('.panel-settings-item')?.setAttribute('hidden', '');
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
