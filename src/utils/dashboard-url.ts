/** Keep routine map movement out of the address bar. Explicit Share view links
 * still include the complete map state; country/chokepoint links stay addressable. */
export function cleanDashboardUrl(currentUrl: string, shareUrl: string): string {
  const url = new URL(currentUrl);
  const share = new URL(shareUrl);
  for (const key of ['lat', 'lon', 'zoom', 'view', 'timeRange', 'layers', 'country', 'expanded', 'chokepoint']) {
    url.searchParams.delete(key);
  }
  for (const key of ['country', 'expanded', 'chokepoint']) {
    const value = share.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
