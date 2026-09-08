// Exact first-party origins for this deployment; never trust arbitrary *.vercel.app.
export function isMonitorOrigin(origin) {
  const configured = [
    'https://monitorsituation.xyz',
    'https://www.monitorsituation.xyz',
    ...(process.env.MONITOR_ALLOWED_ORIGINS || '').split(','),
    ...['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
      .map(name => process.env[name])
      .filter(Boolean)
      .map(host => `https://${host}`),
  ];
  return configured.some(value => {
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && url.origin === origin;
    } catch {
      return false;
    }
  });
}
