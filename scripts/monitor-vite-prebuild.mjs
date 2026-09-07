import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VITE_CONFIG = resolve(process.cwd(), 'vite.config.ts');
const MARKET_ASSIGNMENT = "MonitorMarket: 'panels-markets'";
const RSS_INTEL_CHUNK_MARKER = "return 'gdelt-intel'; // $MONITOR: keep RSS intelligence cycle in one chunk";

let source = await readFile(VITE_CONFIG, 'utf8');
let changed = false;

if (!source.includes(MARKET_ASSIGNMENT)) {
  const anchor = "MacroSignals: 'panels-markets', Market: 'panels-markets',";
  if (!source.includes(anchor)) {
    throw new Error('[monitor-vite-prebuild] Could not find the markets panel chunk anchor in vite.config.ts');
  }

  source = source.replace(
    anchor,
    `${anchor}\n  ${MARKET_ASSIGNMENT},`,
  );
  changed = true;
}

if (!source.includes(RSS_INTEL_CHUNK_MARKER)) {
  const rssChunkAnchor = `            if (id.endsWith('/src/services/rss.ts')) {\n              return 'rss';\n            }\n            if (id.endsWith('/src/services/trending-keywords.ts')) {\n              return 'trending-keywords';\n            }`;

  if (!source.includes(rssChunkAnchor)) {
    throw new Error('[monitor-vite-prebuild] Could not find the RSS/trending manual chunk anchor in vite.config.ts');
  }

  source = source.replace(
    rssChunkAnchor,
    `            if (\n              id.endsWith('/src/services/gdelt-intel.ts') ||\n              id.endsWith('/src/services/rss.ts') ||\n              id.endsWith('/src/services/trending-keywords.ts')\n            ) {\n              ${RSS_INTEL_CHUNK_MARKER}\n            }`,
  );
  changed = true;
}

if (changed) {
  await writeFile(VITE_CONFIG, source, 'utf8');
}

if (!source.includes(MARKET_ASSIGNMENT)) {
  throw new Error('[monitor-vite-prebuild] MonitorMarket chunk assignment was not applied');
}
if (!source.includes(RSS_INTEL_CHUNK_MARKER)) {
  throw new Error('[monitor-vite-prebuild] RSS intelligence chunk co-location was not applied');
}

console.log('[monitor-vite-prebuild] MonitorMarket assigned to panels-markets.');
console.log('[monitor-vite-prebuild] gdelt-intel, rss, and trending-keywords co-located in one chunk.');
