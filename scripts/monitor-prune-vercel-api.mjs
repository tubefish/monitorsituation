import { readdir, readFile, rename, rm, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const API_DIR = resolve(ROOT, 'api');
const LIB_DIR = resolve(ROOT, 'monitor-api-lib');

const KEEP_ENTRYPOINTS = new Set([
  'bootstrap.js',
  'rss-proxy.js',
  'wm-session.js',
  'health.js',
  'youtube/live.js',
  'intelligence/v1/[rpc].ts',
  'infrastructure/v1/[rpc].ts',
  'unrest/v1/[rpc].ts',
  'conflict/v1/[rpc].ts',
  'military/v1/[rpc].ts',
  'radiation/v1/[rpc].ts',
  'economic/v1/[rpc].ts',
]);

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx?)$/i;

function posixPath(value) {
  return value.split(sep).join('/');
}

function relativeImport(fromDir, targetPath) {
  let specifier = posixPath(relative(fromDir, targetPath));
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function removeEmptyDirs(dir) {
  if (!(await exists(dir))) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = resolve(dir, entry.name);
    await removeEmptyDirs(full);
    if ((await readdir(full)).length === 0) await rm(full, { recursive: true, force: true });
  }
}

function helperTargetForSpecifier(sourcePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const originalTarget = resolve(dirname(sourcePath), specifier);
  const rel = relative(API_DIR, originalTarget);
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) return null;
  const firstSegment = rel.split(sep)[0];
  if (!firstSegment?.startsWith('_')) return null;
  return resolve(LIB_DIR, rel);
}

async function rewriteApiHelperImports(sourcePath) {
  if (!SOURCE_EXTENSIONS.test(sourcePath)) return false;
  let text = await readFile(sourcePath, 'utf8');
  let changed = false;

  // Rewrite only relative quoted strings that resolve to api/_* helpers. This
  // catches static imports, dynamic imports, and require() without touching
  // unrelated module specifiers or ordinary strings.
  text = text.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g, (full, quote, specifier) => {
    const target = helperTargetForSpecifier(sourcePath, specifier);
    if (!target) return full;
    changed = true;
    return `${quote}${relativeImport(dirname(sourcePath), target)}${quote}`;
  });

  if (changed) await writeFile(sourcePath, text, 'utf8');
  return changed;
}

for (const relPath of KEEP_ENTRYPOINTS) {
  const full = resolve(API_DIR, relPath);
  if (!(await exists(full))) {
    throw new Error(`[monitor-api-prune] Missing required API entrypoint: api/${relPath}`);
  }
}

await rm(LIB_DIR, { recursive: true, force: true });
await mkdir(LIB_DIR, { recursive: true });

let movedHelpers = 0;
for (const entry of await readdir(API_DIR, { withFileTypes: true })) {
  if (!entry.name.startsWith('_')) continue;
  if (/\.test\.[cm]?[jt]s$/i.test(entry.name)) {
    await rm(resolve(API_DIR, entry.name), { recursive: true, force: true });
    continue;
  }
  await rename(resolve(API_DIR, entry.name), resolve(LIB_DIR, entry.name));
  movedHelpers += 1;
}

const rewriteRoots = [
  API_DIR,
  resolve(ROOT, 'server'),
  resolve(ROOT, 'src'),
  resolve(ROOT, 'shared'),
];
let rewrittenFiles = 0;
for (const root of rewriteRoots) {
  for (const file of await walkFiles(root)) {
    if (await rewriteApiHelperImports(file)) rewrittenFiles += 1;
  }
}

let removedEntrypoints = 0;
for (const file of await walkFiles(API_DIR)) {
  const relPath = posixPath(relative(API_DIR, file));
  if (KEEP_ENTRYPOINTS.has(relPath)) continue;
  await rm(file, { force: true });
  removedEntrypoints += 1;
}
await removeEmptyDirs(API_DIR);

const remaining = (await walkFiles(API_DIR))
  .map((file) => posixPath(relative(API_DIR, file)))
  .sort();
const expected = [...KEEP_ENTRYPOINTS].sort();
if (remaining.length !== expected.length || remaining.some((value, index) => value !== expected[index])) {
  throw new Error(
    `[monitor-api-prune] API surface mismatch. Expected ${expected.join(', ')}; found ${remaining.join(', ')}`,
  );
}

console.log(`[monitor-api-prune] Moved ${movedHelpers} shared api/_* helper entries outside the Vercel route directory.`);
console.log(`[monitor-api-prune] Rewrote helper imports in ${rewrittenFiles} source files.`);
console.log(`[monitor-api-prune] Removed ${removedEntrypoints} unused API route files from the Vercel build workspace.`);
console.log(`[monitor-api-prune] Kept ${remaining.length} Vercel API entrypoints:`);
for (const relPath of remaining) console.log(`  api/${relPath}`);
