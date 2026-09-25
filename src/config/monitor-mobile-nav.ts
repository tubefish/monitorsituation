/** Render the final navigation in the shell, before event handlers initialize. */
export const MONITOR_MOBILE_NAV = `
  <button class="mobile-tab active" type="button" data-mobile-tab="map" aria-current="page">
    <span class="mobile-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18M12 3c-5 5-5 13 0 18"/></svg></span><span>Map</span>
  </button>
  <button class="mobile-tab" type="button" data-mobile-tab="today">
    <span class="mobile-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 20h18M5 17a7 7 0 0 1 14 0M12 2v3M3 7l2 2M21 7l-2 2"/></svg></span><span>Today</span>
  </button>
  <button class="mobile-tab" type="button" data-mobile-tab="markets">
    <span class="mobile-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3v18h18M6 15l5-5 4 3 6-8M16 5h5v5"/></svg></span><span>Markets</span>
  </button>
  <button class="mobile-tab" type="button" data-mobile-tab="more">
    <span class="mobile-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></span><span>More</span>
  </button>`;
