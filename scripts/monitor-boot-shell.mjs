import { MONITOR_MOBILE_NAV } from '../src/config/monitor-mobile-nav.ts';

// Applied to the shipped HTML, before any app JavaScript can run.
const BOOT_STYLE = `<style data-monitor-boot>
  .monitor-boot{--boot-bg:#0a0a0a;--boot-panel:#141414;--boot-border:#2a2a2a;--boot-text:#e8e8e8;--boot-muted:#888;--boot-line:#222;--boot-accent:#78dda9;height:100vh;height:100dvh;background:var(--boot-bg);color:var(--boot-text)}
  [data-theme="light"] .monitor-boot{--boot-bg:#f8f9fa;--boot-panel:#fff;--boot-border:#d4d4d4;--boot-text:#171717;--boot-muted:#737373;--boot-line:#eee;--boot-accent:#167047;background:var(--boot-bg)}
  .monitor-boot .skeleton-header{height:54px;min-height:54px;padding:8px 16px;background:var(--boot-panel);border-color:var(--boot-border);gap:16px}
  .monitor-boot .skeleton-brand{color:var(--boot-text);font-size:14px;letter-spacing:2px;font-weight:700}
  .monitor-boot .skeleton-header-left{gap:12px;min-width:0}
  .monitor-boot-region{display:inline-flex;align-items:center;height:36px;min-width:130px;padding:0 12px;border:1px solid var(--boot-border);border-radius:6px;color:var(--boot-text);font-size:12px;background:var(--boot-bg)}
  .monitor-boot-status{display:flex;align-items:center;gap:7px;color:var(--boot-muted);font-size:11px;white-space:nowrap}
  .monitor-boot-status::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--boot-accent)}
  .monitor-boot .skeleton-main{display:grid;grid-template-columns:var(--monitor-boot-map-width,65%) minmax(0,1fr);gap:6px;min-height:0;background:var(--boot-bg)}
  .monitor-boot .skeleton-map{width:auto;height:auto;min-height:0;flex:1;background:var(--boot-bg);border-color:var(--boot-border)}
  .monitor-boot .skeleton-map-bar{height:55px;min-height:55px;padding:8px 12px;align-items:flex-start;background:var(--boot-panel);border-color:var(--boot-border)}
  .monitor-boot .skeleton-section-label,.monitor-boot .skeleton-panel-title{color:var(--boot-text);font-size:12px;letter-spacing:.055em;text-transform:uppercase}
  .monitor-boot .skeleton-map-body{display:grid;place-items:center}
  .monitor-boot .skeleton-map-body::after{display:none}
  .monitor-boot-map-loading{display:grid;justify-items:center;gap:14px;color:var(--boot-muted);font:12px system-ui,sans-serif}
  .monitor-boot-ring{width:42px;height:42px;border:1px solid var(--boot-border);border-top-color:var(--boot-accent);border-radius:50%;animation:monitor-boot-spin 1.8s linear infinite}
  .monitor-boot .skeleton-grid{display:flex;flex-direction:column;gap:4px;padding:4px 12px 4px 4px;overflow:hidden;min-width:0}
  .monitor-boot .skeleton-panel{height:324px;min-height:324px;flex-shrink:0;background:var(--boot-panel);border-color:var(--boot-border);border-radius:7px}
  .monitor-boot .skeleton-panel:first-child{height:488px;min-height:488px}
  .monitor-boot .skeleton-panel-header{height:47px;min-height:47px;padding:8px 16px;border-color:var(--boot-border)}
  .monitor-boot .skeleton-panel-body{padding:20px;gap:16px}
  .monitor-boot .skeleton-line{height:10px;background:var(--boot-line);animation:none;border-radius:3px}
  .monitor-boot-card{display:flex;flex-direction:column;gap:14px;padding:20px 14px;border:1px solid var(--boot-border);border-radius:7px;margin-top:12px}
  .monitor-boot-footer{height:59px;min-height:59px;display:flex;align-items:center;padding:12px 16px;border-top:1px solid var(--boot-border);background:var(--boot-panel);color:var(--boot-muted);font-size:11px}
  .monitor-boot-nav{display:none}
  .monitor-boot-categories{display:none}
  @keyframes monitor-boot-spin{to{transform:rotate(360deg)}}
  @media(min-width:769px){[data-monitor-map-side="right"] .monitor-boot .skeleton-main{grid-template-columns:minmax(0,1fr) var(--monitor-boot-map-width,65%)}[data-monitor-map-side="right"] .monitor-boot .skeleton-map{order:2}}
  @media(max-width:768px){
    .monitor-boot .skeleton-header{height:58px;min-height:58px;padding:6px 10px}
    .monitor-boot-region{display:none}
    .monitor-boot .skeleton-main{display:flex;flex-direction:column;gap:0;overflow:hidden;padding-bottom:calc(58px + env(safe-area-inset-bottom,0px))}
    .monitor-boot .skeleton-map{height:clamp(320px,62svh,560px);min-height:0;max-height:560px;flex:none}
    .monitor-boot .skeleton-map-bar{display:none}
    .monitor-boot .skeleton-grid{overflow:visible;padding:8px;gap:8px}
    .monitor-boot-categories{display:flex;flex:0 0 49px;align-items:center;gap:6px;padding:8px;border-bottom:1px solid var(--boot-border)}
    .monitor-boot-categories span{height:32px;width:62px;border:1px solid var(--boot-border);border-radius:999px;background:var(--boot-panel)}
    .monitor-boot .skeleton-panel:first-child{height:488px;min-height:488px}
    .monitor-boot-footer{display:none}
    .monitor-boot-nav{position:fixed;inset:auto 0 0;z-index:10003;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));min-height:58px;padding:4px 4px calc(4px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--boot-border);background:var(--boot-panel)}
    .monitor-boot-nav .mobile-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:50px;width:100%;padding:0;border:0;border-radius:8px;background:transparent;color:var(--boot-muted);font:600 10px/1 monospace;opacity:1}
    .monitor-boot-nav .mobile-tab.active{color:var(--boot-text);background:var(--boot-line)}
    .monitor-boot-nav svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  }
  @media(prefers-reduced-motion:reduce){.monitor-boot-ring{animation:none}}
</style>`;

const lines = '<div class="skeleton-line w75"></div><div class="skeleton-line"></div><div class="skeleton-line w60"></div>';
const BOOT_SHELL = `<div id="app">
  <div class="skeleton-shell monitor-boot" aria-busy="true" aria-label="$MONITOR dashboard loading">
    <div class="skeleton-header">
      <div class="skeleton-header-left"><div class="skeleton-brand">$MONITOR</div><span class="monitor-boot-region" aria-hidden="true">Global</span></div>
      <span class="monitor-boot-status" role="status">Connecting…</span>
    </div>
    <div class="skeleton-main">
      <div class="skeleton-map">
        <div class="skeleton-map-bar"><span class="skeleton-section-label">Global Situation</span></div>
        <div class="skeleton-map-body"><div class="monitor-boot-map-loading"><span class="monitor-boot-ring" aria-hidden="true"></span><span>Loading the situation…</span></div></div>
      </div>
      <div class="monitor-boot-categories" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="skeleton-grid" aria-hidden="true">
        <section class="skeleton-panel"><div class="skeleton-panel-header"><h2 class="skeleton-panel-title">X Tracker</h2></div><div class="skeleton-panel-body"><div class="skeleton-line w40"></div><div class="monitor-boot-card">${lines}</div><div class="monitor-boot-card">${lines}</div></div></section>
        <section class="skeleton-panel"><div class="skeleton-panel-header"><h2 class="skeleton-panel-title">Market Heatmap</h2></div><div class="skeleton-panel-body">${lines}</div></section>
        <section class="skeleton-panel"><div class="skeleton-panel-header"><h2 class="skeleton-panel-title">Commodities</h2></div><div class="skeleton-panel-body">${lines}</div></section>
      </div>
    </div>
    <div class="monitor-boot-footer">$MONITOR · Monitor the Situation</div>
    <div class="monitor-boot-nav" aria-hidden="true">${MONITOR_MOBILE_NAV.replaceAll('<button ', '<button disabled ')}</div>
  </div>
</div>`;

export function prepareMonitorBootShell(html) {
  // Preserve upstream theme/variant setup, but resolve the same preference as
  // applyStoredTheme() before paint. No writes to the user's stored settings.
  const theme = "document.documentElement.dataset.theme='light';";
  if (!html.includes(theme)) throw new Error('[monitor-boot] Prepaint theme anchor missing');
  html = html.replace(theme, `var t=localStorage.getItem('worldmonitor-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light';var w=parseFloat(localStorage.getItem('map-col-width'));if(isFinite(w)&&w>=10&&w<=75)document.documentElement.style.setProperty('--monitor-boot-map-width',w+'%');if(localStorage.getItem('map-side')==='right')document.documentElement.dataset.monitorMapSide='right';`);
  // MONITOR lands on Map, even if the last session used Today. The upstream
  // collapsed-map preference must not shrink the skeleton before hydration.
  const mapPrepaint = /(<script\b[^>]*\bdata-wm-map-prepaint(?:="")?[^>]*>)[\s\S]*?<\/script>/;
  if (!mapPrepaint.test(html)) throw new Error('[monitor-boot] Map prepaint anchor missing');
  // Vite adds an empty attribute value and a CSP nonce; retain both.
  html = html.replace(mapPrepaint, '$1document.documentElement.classList.remove("wm-map-collapsed");</script>');
  // Default to light even when the localStorage getter itself throws.
  html = html.replace('<html lang="en">', '<html lang="en" data-theme="light">');
  const app = /<div id="app">[\s\S]*?(?=\s*<aside id="country-deep-dive-panel")/;
  if (!app.test(html)) throw new Error('[monitor-boot] Dashboard boot shell anchor missing');
  html = html.replace(app, BOOT_SHELL + '\n');
  html = html.replace(/<h1 class="app-heading">[\s\S]*?<\/h1>/, '<h1 class="app-heading">$MONITOR — Monitor the Situation</h1>');
  html = html.replace(/<section class="app-seo-summary">[\s\S]*?<\/section>/, '<section class="app-seo-summary"><p>$MONITOR brings global news, OSINT, markets, and commodities into one customizable situation dashboard.</p></section>');
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, '<noscript><main class="dashboard-noscript"><h2>$MONITOR</h2><p>Enable JavaScript to load the live map, news, and markets.</p><p><a href="https://x.com/monitoringmeme">Follow @monitoringmeme</a></p></main></noscript>');
  return html.replace('</head>', `${BOOT_STYLE}\n</head>`);
}
