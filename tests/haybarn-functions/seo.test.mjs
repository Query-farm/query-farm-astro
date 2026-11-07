import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { snapshots, defaultSnapshot, canonicalSnapshot, categories, getFunction, functionUrl, catalogUrl, categoryUrl } from '../../src/haybarn-functions/lib/catalog.ts';
import { usageGuides } from '../../src/haybarn-functions/data/usage-guides.ts';
import { categoryGuides } from '../../src/haybarn-functions/data/category-guides.ts';
import { exportFunction, functionMarkdown } from '../../src/haybarn-functions/lib/agent-docs.ts';

const html = path => readFileSync(`dist${path}index.html`, 'utf8');
const sitemap = readdirSync('dist').filter(name => /^sitemap-\d+\.xml$/.test(name)).map(name => readFileSync(`dist/${name}`, 'utf8')).join('');

test('rendered canonicals and sitemap agree for equivalent and distinct releases', () => {
  const titles = new Set();
  for (const snapshot of snapshots) {
    const canonical = canonicalSnapshot(snapshot);
    const archive = `/products/haybarn/functions/releases/${snapshot.id}/`;
    const doc = html(archive);
    assert.ok(doc.includes(`rel="canonical" href="https://query.farm${catalogUrl(canonical)}"`), archive);
    const fn = getFunction(snapshot, 'strftime');
    assert.ok(html(functionUrl(snapshot, fn, true)).includes(`rel="canonical" href="https://query.farm${functionUrl(canonical, fn)}"`));
    assert.equal(sitemap.includes(`<loc>https://query.farm${archive}`), canonical !== defaultSnapshot, archive);
    titles.add(doc.match(/<title>(.*?)<\/title>/s)[1]);
    assert.ok(!doc.includes('name="robots" content="noindex'));
  }
  assert.equal(titles.size, snapshots.length, 'Each release catalog has its own descriptive title');
  assert.ok(sitemap.includes(`<loc>https://query.farm${catalogUrl()}</loc>`));
});

test('category guides are indexable, complete, and link to existing function references', () => {
  for (const category of categories) {
    const guide = categoryGuides[category.id];
    const path = categoryUrl(category.id);
    const doc = html(path);
    assert.ok(sitemap.includes(`<loc>https://query.farm${path}</loc>`));
    assert.ok(doc.includes(`rel="canonical" href="https://query.farm${path}"`));
    assert.ok(doc.includes(guide.approach));
    for (const [name] of guide.choices) {
      const fn = getFunction(defaultSnapshot, name);
      assert.ok(fn, `Missing category function: ${name}`);
      assert.ok(doc.includes(`href="${functionUrl(defaultSnapshot, fn)}"`));
    }
  }
});

test('authored usage, expected results and missing descriptions reach HTML and machine exports', () => {
  for (const [name, guide] of Object.entries(usageGuides)) {
    const fn = getFunction(defaultSnapshot, name);
    assert.ok(fn, name);
    const doc = html(functionUrl(defaultSnapshot, fn));
    assert.ok(doc.includes('id="usage"'), name);
    assert.match(doc, /<caption\b[^>]*>Expected result<\/caption>/, name);
    assert.ok(doc.includes(guide.purpose), name);
    const exported = exportFunction(defaultSnapshot, fn);
    assert.equal(exported.description, fn.description || null, 'Raw descriptions remain unchanged');
    assert.deepEqual(exported.editorial.usage.rows, guide.rows);
    assert.ok(functionMarkdown(defaultSnapshot, fn).includes(guide.sql));
  }
  const historical = snapshots.find(snapshot => snapshot.id === 'duckdb-1.4.4');
  assert.equal(exportFunction(historical, getFunction(historical, 'read_csv')).editorial.usage, null);
});
