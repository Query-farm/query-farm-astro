// Build the Pagefind search index over the static site, then augment it with a
// custom record per extension function. The function reference progressively
// loads category detail from server-rendered pages (and is marked
// data-pagefind-ignore in the HTML), so without these custom records the deep
// content of large extensions (stochastic, datasketches, …) would be missing.
//
// A shared index serves separate company and Haybarn search scopes. A failed
// index is a build failure so deployment cannot silently drop documentation.
import * as pagefind from 'pagefind';
import { indexHaybarnFunctions } from './haybarn-functions/search-index.mjs';
import { indexHaybarnExtensions } from './haybarn-extensions/search-index.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const EXT_DIST = join(DIST, 'products', 'extensions');
const EXT_SRC = join('src', 'data', 'extensions');

function text(v) {
  return typeof v === 'string' ? v : '';
}

function routeAnchor(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Flatten a function entry into a searchable plain-text blob.
function functionContent(fn) {
  const parts = [fn.name, text(fn.description)];
  for (const p of fn.parameters ?? []) parts.push(text(p.name), text(p.description));
  for (const c of fn.returnsTable ?? []) parts.push(text(c.name), text(c.description));
  for (const ex of fn.examples ?? []) parts.push(text(ex.description), text(ex.code));
  if (Array.isArray(fn.categories)) parts.push(...fn.categories);
  return parts.filter(Boolean).join(' — ').replace(/`/g, '');
}

async function displayName(slug) {
  try {
    const m = JSON.parse(await readFile(join(EXT_SRC, slug, 'augment', 'metadata.json'), 'utf8'));
    return m.displayName || slug;
  } catch {
    return slug;
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.warn('[search] no dist/ — run after `astro build`. Skipping.');
    return;
  }
  const { index } = await pagefind.createIndex();

  // 1) Crawl the built HTML (everything except data-pagefind-ignore'd regions:
  //    nav, footer, and the function reference — those come from custom records).
  // References are indexed from their structured exports, once per release.
  // Guide pages carry their own search scope; the landing page also belongs
  // to general site search. Avoid indexing archive copies or catalog lists.
  for (const path of await readdir(DIST, { recursive: true })) {
    if (!path.endsWith('.html')) continue;
    const content = await readFile(join(DIST, path), 'utf8');
    if (content.includes('data-haybarn-guide')) {
      if (!content.includes('data-haybarn-search-page')) continue;
    }
    const result = await index.addHTMLFile({ url: '/' + path.replace(/index\.html$/, ''), content });
    if (result.errors?.length) throw new Error(result.errors.join('\n'));
  }

  // 2) One custom record per (extension, function name).
  let recordCount = 0;
  let extSlugs = [];
  try {
    extSlugs = (await readdir(EXT_DIST, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { /* no extensions built */ }

  for (const slug of extSlugs) {
    const fnFile = join(EXT_DIST, slug, 'functions.json');
    if (!existsSync(fnFile)) continue;
    let data;
    try {
      data = JSON.parse(await readFile(fnFile, 'utf8'));
    } catch { continue; }
    const entries = data?.entries && typeof data.entries === 'object' ? Object.values(data.entries) : [];
    if (!entries.length) continue;
    const ext = await displayName(slug);

    // Merge overloads that share a name into one record.
    const byName = new Map();
    for (const fn of entries) {
      if (!fn?.name) continue;
      (byName.get(fn.name) ?? byName.set(fn.name, []).get(fn.name)).push(fn);
    }
    for (const [name, fns] of byName) {
      const content = fns.map(functionContent).join(' — ');
      const category = fns[0].categories?.[0] || 'Functions';
      await index.addCustomRecord({
        url: `/products/extensions/${slug}/functions/category/${routeAnchor(category)}#${encodeURIComponent(routeAnchor(name))}`,
        content: `${name} — ${content}`,
        language: 'en',
        // `kind` filter lets the search widget hide functions by default
        // (they outnumber pages ~25:1) and include them only on opt-in.
        filters: { kind: ['function'] },
        meta: { title: `${name}()`, extension: ext, kind: 'Function' },
      });
      recordCount++;
    }
  }

  await indexHaybarnFunctions(index);
  await indexHaybarnExtensions(index);
  const result = await index.writeFiles({ outputPath: join(DIST, 'pagefind') });
  if (result.errors?.length) throw new Error(result.errors.join('\n'));
  console.log(`[search] indexed dist/ + ${recordCount} function records across ${extSlugs.length} extensions`);
}

try {
  await main();
} catch (err) {
  console.error(`[search] index build failed: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  try { await pagefind.close(); } catch { /* ignore */ }
}
