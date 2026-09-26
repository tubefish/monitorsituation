import { pathToFileURL } from 'node:url';

/** Fail before bundling if an account release would ship unusable login/sync. */
export function validateAccountEnvironment(env) {
  if (env.VERCEL_ENV !== 'production') return [];
  const errors = [];
  const required = [
    'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_JWT_ISSUER_DOMAIN',
    'VITE_CONVEX_URL', 'CONVEX_URL',
  ];
  for (const name of required) {
    if (!env[name]?.trim()) errors.push(`${name} must be configured for Production.`);
  }
  const key = env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (key && !key.startsWith('pk_live_')) {
    errors.push('VITE_CLERK_PUBLISHABLE_KEY must use the production Clerk instance (pk_live_).');
  }
  if (env.VITE_CLOUD_PREFS_ENABLED !== 'true') {
    errors.push('VITE_CLOUD_PREFS_ENABLED must be true to save account preferences.');
  }
  if (env.CONVEX_URL?.trim() && env.VITE_CONVEX_URL?.trim()
    && env.CONVEX_URL.trim().replace(/\/$/, '') !== env.VITE_CONVEX_URL.trim().replace(/\/$/, '')) {
    errors.push('CONVEX_URL and VITE_CONVEX_URL must point to the same account backend.');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateAccountEnvironment(process.env);
  if (errors.length) {
    // Only variable names and guidance: never print keys, tokens, or values.
    console.error('[monitor-accounts] Production configuration is incomplete:\n' + errors.map(e => `- ${e}`).join('\n'));
    process.exitCode = 1;
  }
}
