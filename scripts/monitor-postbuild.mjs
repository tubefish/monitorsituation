import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DIST_DIR = resolve(process.cwd(), 'dist');
const INDEX_FILE = resolve(DIST_DIR, 'index.html');

const SITE_URL = 'https://monitorsituation.xyz/';
const TITLE = '$MONITOR - Monitor the Situation';
const DESCRIPTION =
  'Real-time global situation dashboard tracking breaking news, conflicts, markets, military activity, infrastructure, and OSINT signals in one view.';
const KEYWORDS =
  '$MONITOR, Monitor the Situation, global situation dashboard, breaking news, geopolitical intelligence, OSINT, conflict tracking, military activity, infrastructure monitoring, market sentiment, real-time news, situation awareness';
const X_HANDLE = '@monitoringmeme';
const X_URL = 'https://x.com/monitoringmeme';
const SOURCE_URL = 'https://github.com/tubefish/monitorsituation';
const LICENSE_URL = 'https://github.com/tubefish/monitorsituation/blob/monitor-redesign/LICENSE';
const OG_IMAGE = `${SITE_URL}favico/og-image.png`;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function insertBeforeHeadClose(html, markup) {
  return html.replace('</head>', `${markup}\n  </head>`);
}

function upsertMeta(html, attribute, key, content) {
  const pattern = new RegExp(
    `<meta\\s+[^>]*\\b${attribute}=["']${escapeRegex(key)}["'][^>]*>`,
    'i',
  );
  const tag = `    <meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag.trimStart()) : insertBeforeHeadClose(html, tag);
}

function upsertCanonical(html) {
  const pattern = /<link\s+[^>]*\brel=["']canonical["'][^>]*>/i;
  const tag = `    <link rel="canonical" href="${SITE_URL}" />`;
  return pattern.test(html) ? html.replace(pattern, tag.trimStart()) : insertBeforeHeadClose(html, tag);
}

function replaceTitle(html) {
  const pattern = /<title>[\s\S]*?<\/title>/i;
  const tag = `<title>${TITLE}</title>`;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadClose(html, `    ${tag}`);
}

function replaceStructuredData(html) {
  const clean = html.replace(
    /\s*<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    '',
  );

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        name: '$MONITOR',
        alternateName: 'Monitor the Situation',
        url: SITE_URL,
        description: DESCRIPTION,
        sameAs: [X_URL, SOURCE_URL],
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}#app`,
        name: '$MONITOR',
        alternateName: 'Monitor the Situation',
        url: SITE_URL,
        description: DESCRIPTION,
        applicationCategory: 'NewsApplication',
        operatingSystem: 'Web',
        isPartOf: { '@id': `${SITE_URL}#website` },
        sameAs: [X_URL, SOURCE_URL],
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        codeRepository: SOURCE_URL,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          'Global situation map',
          'Live news video',
          '$MONITOR market tracking',
          'Threat timeline',
          'Intel feed',
          'Fear & Greed market sentiment',
          'Live intelligence signals',
          'Escalation correlation',
          'Political news monitoring',
          'Economic correlation',
          'Cascade risk monitoring',
          'Financial news',
        ],
      },
    ],
  };

  const markup = `    <script type="application/ld+json">\n${JSON.stringify(graph, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n    </script>`;

  return insertBeforeHeadClose(clean, markup);
}

async function prepareIndex() {
  let html = await readFile(INDEX_FILE, 'utf8');

  html = replaceTitle(html);
  html = upsertMeta(html, 'name', 'title', TITLE);
  html = upsertMeta(html, 'name', 'description', DESCRIPTION);
  html = upsertMeta(html, 'name', 'keywords', KEYWORDS);
  html = upsertMeta(html, 'name', 'author', '$MONITOR');
  html = upsertMeta(html, 'name', 'application-name', '$MONITOR');
  html = upsertMeta(html, 'name', 'subject', 'Real-Time Global Situation Awareness');
  html = upsertMeta(html, 'name', 'classification', 'Global Intelligence Dashboard, OSINT Tool, News Aggregator');

  html = upsertMeta(html, 'property', 'og:type', 'website');
  html = upsertMeta(html, 'property', 'og:url', SITE_URL);
  html = upsertMeta(html, 'property', 'og:title', TITLE);
  html = upsertMeta(html, 'property', 'og:description', DESCRIPTION);
  html = upsertMeta(html, 'property', 'og:image', OG_IMAGE);
  html = upsertMeta(html, 'property', 'og:image:alt', '$MONITOR - Monitor the Situation');
  html = upsertMeta(html, 'property', 'og:site_name', '$MONITOR');

  html = upsertMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = upsertMeta(html, 'name', 'twitter:url', SITE_URL);
  html = upsertMeta(html, 'name', 'twitter:title', TITLE);
  html = upsertMeta(html, 'name', 'twitter:description', DESCRIPTION);
  html = upsertMeta(html, 'name', 'twitter:image', OG_IMAGE);
  html = upsertMeta(html, 'name', 'twitter:site', X_HANDLE);
  html = upsertMeta(html, 'name', 'twitter:creator', X_HANDLE);

  html = upsertCanonical(html);

  html = html.replace(/\s*<link\s+[^>]*\brel=["']alternate["'][^>]*>/gi, '');
  html = insertBeforeHeadClose(
    html,
    `    <link rel="alternate" hreflang="x-default" href="${SITE_URL}" />\n` +
      `    <link rel="alternate" hreflang="en" href="${SITE_URL}" />\n` +
      `    <link rel="license" href="${LICENSE_URL}" />`,
  );

  html = html.replaceAll('https://x.com/worldmonitorai', X_URL);
  html = html.replaceAll('@worldmonitorai', X_HANDLE);
  html = html.replaceAll('https://www.worldmonitor.app/favico/og-image.png', OG_IMAGE);

  html = replaceStructuredData(html);

  await writeFile(INDEX_FILE, html, 'utf8');
}

async function writeCrawlerFiles() {
  const robots = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /docs/\nDisallow: /blog/\nDisallow: /pro\nDisallow: /countries/\nDisallow: /research/\nDisallow: /reference/\nDisallow: /sources/\nDisallow: /tools/\nDisallow: /compare/\nDisallow: /crises/\nDisallow: /use-cases/\n\nSitemap: ${SITE_URL}sitemap.xml\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE_URL}</loc>\n    <changefreq>hourly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;

  await Promise.all([
    writeFile(resolve(DIST_DIR, 'robots.txt'), robots, 'utf8'),
    writeFile(resolve(DIST_DIR, 'sitemap.xml'), sitemap, 'utf8'),
  ]);
}

await prepareIndex();
await writeCrawlerFiles();

console.log('[monitor-postbuild] Prepared monitorsituation.xyz production output.');
