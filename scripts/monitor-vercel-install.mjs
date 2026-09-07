import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));

pkg.scripts ??= {};
pkg.scripts.postinstall =
  "node -e \"console.log('[monitor-vercel-install] Skipping upstream World Monitor postinstall on lean Vercel build.')\"";

writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log('[monitor-vercel-install] Running npm install with only the root postinstall disabled.');
const result = spawnSync('npm', ['install'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

console.log('[monitor-vercel-install] Dependencies installed successfully.');
console.log('[monitor-vercel-install] Root postinstall remains disabled in this Vercel workspace for function packaging.');
