import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON = new URL('../package.json', import.meta.url);
const original = readFileSync(PACKAGE_JSON, 'utf8');
const pkg = JSON.parse(original);

pkg.scripts ??= {};
pkg.scripts.postinstall =
  "node -e \"console.log('[monitor-vercel-install] Skipping upstream World Monitor postinstall on lean Vercel build.')\"";

writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

let status = 1;
try {
  console.log('[monitor-vercel-install] Running npm install with only the root postinstall disabled.');
  const result = spawnSync('npm', ['install'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  writeFileSync(PACKAGE_JSON, original, 'utf8');
}

if (status !== 0) process.exit(status);
console.log('[monitor-vercel-install] Dependencies installed successfully.');
