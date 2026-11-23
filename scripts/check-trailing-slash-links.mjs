#!/usr/bin/env node
// Fail the build when an internal link omits the trailing slash of a page.
//
// Pages are emitted as dist/<path>/index.html, so Cloudflare answers /<path>
// with a 308 to /<path>/. Every slash-less link costs visitors a redirect and
// lets Google discover and report a second URL for the same page. Links to
// files (/x.pdf), to the root and to non-page paths are left alone.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const HREF = /href="(\/[^"#?]*)(?:[?#][^"]*)?"/g;

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

const pageCache = new Map();
async function isPage(urlPath) {
  if (!pageCache.has(urlPath)) {
    pageCache.set(urlPath, stat(path.join(dist, urlPath, 'index.html')).then(s => s.isFile(), () => false));
  }
  return pageCache.get(urlPath);
}

const offenders = new Map(); // target -> Set of source pages
for await (const file of htmlFiles(dist)) {
  const html = await readFile(file, 'utf8');
  for (const [, target] of html.matchAll(HREF)) {
    if (target.endsWith('/') || target.startsWith('//') || /\.[a-z0-9]+$/i.test(target)) continue;
    if (!(await isPage(target))) continue;
    if (!offenders.has(target)) offenders.set(target, new Set());
    offenders.get(target).add('/' + path.relative(dist, file));
  }
}

if (offenders.size) {
  console.error(`[links] ${offenders.size} internal link target(s) are missing a trailing slash (each one is a 308 redirect):`);
  for (const [target, pages] of [...offenders].sort((a, b) => b[1].size - a[1].size).slice(0, 25)) {
    const sample = [...pages].slice(0, 2).join(', ');
    console.error(`  ${target}  ->  ${target}/   (${pages.size} page${pages.size === 1 ? '' : 's'}, e.g. ${sample})`);
  }
  process.exit(1);
}
console.log('[links] every internal page link ends in a trailing slash');
