// Build the Pagefind search index over the static site, then augment it with a
// custom record per extension function. The function reference lazy-loads its
// detail from /products/extensions/<slug>/functions.json (and is marked
// data-pagefind-ignore in the HTML), so without these custom records the deep
// content of large extensions (stochastic, datasketches, …) would be missing.
//
// Best-effort: any failure warns and exits 0 so a deploy still ships the site
// (search just degrades — the widget handles a missing index gracefully).
import * as pagefind from 'pagefind';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const EXT_DIST = join(DIST, 'products', 'extensions');
const EXT_SRC = join('src', 'data', 'extensions');

function text(v) {
  return typeof v === 'string' ? v : '';
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
  await index.addDirectory({ path: DIST });

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
      await index.addCustomRecord({
        url: `/products/extensions/${slug}/#${name}`,
        content: `${name} — ${content}`,
        language: 'en',
        meta: { title: `${name}()`, extension: ext, kind: 'Function' },
      });
      recordCount++;
    }
  }

  await index.writeFiles({ outputPath: join(DIST, 'pagefind') });
  console.log(`[search] indexed dist/ + ${recordCount} function records across ${extSlugs.length} extensions`);
}

try {
  await main();
} catch (err) {
  console.warn(`[search] index build failed (${err?.message ?? err}); site ships without search`);
} finally {
  try { await pagefind.close(); } catch { /* ignore */ }
}
