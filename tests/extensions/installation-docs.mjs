import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';

export const dist = resolve(process.env.EXTENSION_DOCS_DIST ?? 'dist');
export const readPage = path => readFileSync(resolve(dist, path), 'utf8');
export const attribute = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;

export function* elements(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield* elements(child);
}

export function text(node) {
  return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
}

export function codeText(code) {
  const lines = (code.childNodes ?? []).filter(node =>
    (attribute(node, 'class') ?? '').split(/\s+/).includes('ec-line'));
  return (lines.length ? lines.map(text).join('\n') : text(code)).trim();
}

function hasAncestor(node, predicate) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (predicate(parent)) return true;
  }
  return false;
}

function isLegacy(node) {
  return hasAncestor(node, parent => parent.tagName === 'details'
    && parent.childNodes.some(child => child.tagName === 'summary'
      && text(child).trim() === 'DuckDB versions before 2.0'));
}

// Discover coverage from the published catalog, including extensions with no
// WASM runner. Missing pages and missing catalog data must fail, not skip.
export function publicExtensions() {
  const nodes = [...elements(parse(readPage('products/extensions/index.html')))];
  const data = nodes.filter(node => node.tagName === 'script'
    && attribute(node, 'type') === 'application/ld+json').flatMap(node => JSON.parse(text(node)));
  const items = data.find(item => item['@type'] === 'CollectionPage')?.mainEntity?.itemListElement;
  assert.ok(items?.length, 'Built extension catalog must list its public extensions. Run npm run build first.');
  return items.map(item => {
    const slug = new URL(item.url).pathname.match(/^\/products\/extensions\/([a-z0-9_]+)\/?$/)?.[1];
    assert.ok(slug, `Invalid extension link: ${item.url}`);
    const { name } = JSON.parse(readFileSync(`src/data/extensions/${slug}/augment/metadata.json`, 'utf8'));
    assert.match(name, /^[a-z0-9_]+$/i);
    return { slug, name, path: `products/extensions/${slug}/index.html` };
  });
}

export function checkInstallation(html, name, { catalog = false } = {}) {
  const nodes = [...elements(parse(html))];
  const section = catalog ? nodes.find(node => node.tagName === 'main')
    : nodes.find(node => attribute(node, 'id') === 'quick-install');
  assert.ok(section, `${name}: missing installation section`);
  const codes = [...elements(section)].filter(node => node.tagName === 'code');
  const blocks = codes.filter(node => hasAncestor(node, parent => parent.tagName === 'pre'));
  const installSql = codeText(blocks.find(node => !isLegacy(node)) ?? { childNodes: [] });
  const required = [
    /SET\s+allow_extension_repositories\s*=\s*'allowed'\s*;/i,
    /CREATE\s+EXTENSION\s+REPOSITORY\s+IF\s+NOT\s+EXISTS\s+query_farm\s+WITH\s+PREFIX\s+'https:\/\/duckdb-extensions\.query\.farm'\s*;/i,
    new RegExp(`INSTALL\\s+${name}\\s+FROM\\s+query_farm\\s*;`, 'i'),
    new RegExp(`LOAD\\s+${name}\\s+FROM\\s+query_farm\\s*;`, 'i'),
  ];
  let previous = -1;
  for (const pattern of required) {
    const match = pattern.exec(installSql);
    assert.ok(match, `${name}: native installation is missing ${pattern}`);
    assert.ok(match.index > previous, `${name}: repository setup must precede INSTALL and LOAD`);
    previous = match.index;
  }
  const reload = codes.find(node => !hasAncestor(node, parent => parent.tagName === 'pre')
    && new RegExp(`^LOAD\\s+${name}\\s+FROM\\s+query_farm\\s*;$`, 'i').test(codeText(node)));
  assert.ok(reload, `${name}: missing later-session LOAD command`);
  // Haybarn verifies its own signing key, so it must never get DuckDB's host.
  const haybarnSql = blocks.filter(node => hasAncestor(node, parent => parent.tagName === 'details'
    && parent.childNodes.some(child => child.tagName === 'summary' && text(child).trim() === 'Haybarn'))).map(codeText).join('\n');
  if (haybarnSql) assert.match(haybarnSql, /WITH\s+PREFIX\s+'https:\/\/haybarn-extensions\.query\.farm'\s*;/i, `${name}: Haybarn must use its own host`);
  const legacySql = blocks.filter(isLegacy).map(codeText).join('\n');
  assert.match(legacySql, new RegExp(`INSTALL\\s+${name}\\s+FROM\\s+community\\s*;`, 'i'));
  assert.match(legacySql, new RegExp(`LOAD\\s+${name}\\s*;`, 'i'));
  return { installSql, reloadSql: codeText(reload) };
}

export function checkExampleRepositories(html, names, path) {
  const commands = new RegExp(`\\b(INSTALL|LOAD)\\s+["']?(${names.join('|')})["']?(?:\\s+FROM\\s+([^;]+?))?\\s*;`, 'gi');
  for (const node of elements(parse(html))) {
    if (node.tagName !== 'code' || isLegacy(node)) continue;
    for (const match of codeText(node).matchAll(commands)) {
      assert.equal(match[3]?.trim().toLowerCase(), 'query_farm',
        `${path}: current examples must use query_farm: ${match[0]}`);
    }
  }
}
