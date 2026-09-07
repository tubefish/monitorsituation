import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VITE_CONFIG = resolve(process.cwd(), 'vite.config.ts');
const ASSIGNMENT = "MonitorMarket: 'panels-markets'";

let source = await readFile(VITE_CONFIG, 'utf8');

if (!source.includes(ASSIGNMENT)) {
  const anchor = "MacroSignals: 'panels-markets', Market: 'panels-markets',";
  if (!source.includes(anchor)) {
    throw new Error('[monitor-vite-prebuild] Could not find the markets panel chunk anchor in vite.config.ts');
  }

  source = source.replace(
    anchor,
    `${anchor}\n  ${ASSIGNMENT},`,
  );
  await writeFile(VITE_CONFIG, source, 'utf8');
}

if (!source.includes(ASSIGNMENT)) {
  throw new Error('[monitor-vite-prebuild] MonitorMarket chunk assignment was not applied');
}

console.log('[monitor-vite-prebuild] MonitorMarket assigned to panels-markets.');
