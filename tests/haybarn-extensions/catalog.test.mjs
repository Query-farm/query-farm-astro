import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBinding } from '../../scripts/haybarn-functions/bindings.mjs';
import { readFileSync } from 'node:fs';
import { categories, categoryIds } from '../../src/data/haybarn-extensions/taxonomy.mjs';
import { categoryGuides } from '../../src/data/haybarn-extensions/guides.mjs';
import { maintainerExample, overviewParagraphs, documentationLinks, exampleContext } from '../../src/data/haybarn-extensions/details.mjs';
import { supportsBrowserSession, browserSessionIssue } from '../../src/data/haybarn-extensions/browser.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../../src/data/haybarn-extensions/${name}`, import.meta.url)));
const catalog = read('catalog.generated.json');

test('browser sessions require an artifact matching the pinned engine and its non-threaded WASM platform', () => {
  assert.equal(supportsBrowserSession([{ version: '2.0.0', platform: 'wasm_eh' }], '2.0.0-rc11'), true);
  for (const platform of ['wasm_threads', 'wasm_mvp', 'linux_amd64']) {
    assert.equal(supportsBrowserSession([{ version: '2.0.0', platform }], '2.0.0-rc11'), false);
  }
  assert.equal(supportsBrowserSession([{ version: '1.5.4', platform: 'wasm_eh' }], '2.0.0-rc11'), false);
  assert.equal(supportsBrowserSession([{ version: '2.0.0', platform: 'wasm_eh' }], '2.1.0'), false);
  assert.equal(supportsBrowserSession([], '2.0.0'), false);
});

test('confirmed load failures only restrict the tested engine and exact published artifact', () => {
  const extension = { name: 'sitemap', availability: [{ version: '2.0.0', platform: 'wasm_eh', etag: 'W/"16d7c81014269657e39142c634ba26be"' }] };
  assert.match(browserSessionIssue(extension, '2.0.0-rc11'), /cannot load/);
  assert.match(browserSessionIssue({ ...extension, availability: [{ ...extension.availability[0], etag: '"16d7c81014269657e39142c634ba26be"' }] }, '2.0.0-rc11'), /cannot load/);
  assert.equal(browserSessionIssue(extension, '2.0.0-rc12'), undefined);
  assert.equal(browserSessionIssue({ ...extension, availability: [{ ...extension.availability[0], etag: 'new-build' }] }, '2.0.0-rc11'), undefined);
  assert.equal(browserSessionIssue({ ...extension, name: 'webbed' }, '2.0.0-rc11'), undefined);
});

test('the directory partitions the complete descriptor census by published artifact evidence', () => {
  assert.deepEqual(catalog.releases.map(release => release.version), [catalog.latestVersion]);
  const available = catalog.extensions.map(extension => extension.name);
  assert.equal(new Set([...available, ...catalog.unavailable]).size, catalog.scanned);
  assert.equal(available.length + catalog.unavailable.length, catalog.scanned);
  for (const extension of catalog.extensions) {
    assert.ok(extension.availability.length, extension.name);
    assert.ok(!catalog.unavailable.includes(extension.name));
    const pairs = new Set();
    for (const artifact of extension.availability) {
      assert.equal(artifact.version, catalog.latestVersion);
      assert.ok(catalog.releases.some(release => release.version === artifact.version && release.publishedAt));
      assert.ok(catalog.platforms.includes(artifact.platform));
      assert.ok(artifact.bytes >= 512 && artifact.etag && artifact.modifiedAt);
      const key = `${artifact.version}/${artifact.platform}`;
      assert.ok(!pairs.has(key), `${extension.name}: duplicate ${key}`);
      pairs.add(key);
    }
  }
});

test('reviewed categories only reference real descriptors', () => {
  const names = new Set([...catalog.extensions.map(extension => extension.name), ...catalog.unavailable]);
  assert.ok(categoryIds('sheetreader').includes('files'));
  assert.deepEqual(categoryIds('new_uncategorized_extension'), []);
  for (const category of categories) for (const member of category.members) assert.ok(names.has(member), `${category.id}: ${member}`);
});

test('category guidance points to extensions in that category', () => {
  for (const category of categories) {
    const guide = categoryGuides[category.id];
    assert.ok(guide?.intro && guide.considerations.length, category.id);
    for (const name of guide.examples) assert.ok(category.members.includes(name), `${category.id}: ${name}`);
  }
});

test('maintainer examples preserve setup and SQL while removing only their own installation', () => {
  const source = "INSTALL zarr FROM community;\nLOAD zarr;\nINSTALL httpfs;\nLOAD httpfs;\nSELECT 'LOAD zarr;' AS text;\nFROM read_zarr('sample.zarr');";
  const example = maintainerExample('zarr', source);
  assert.equal(example.code, "INSTALL httpfs;\nLOAD httpfs;\nSELECT 'LOAD zarr;' AS text;\nFROM read_zarr('sample.zarr');");
  assert.equal(maintainerExample('zarr', 'INSTALL zarr FROM community;\nLOAD zarr;'), null);
  assert.equal(maintainerExample('zarr', 'x'.repeat(12_001)), null);
  assert.equal(maintainerExample('adbc', 'D SELECT 1;\n│ 1 │').lang, 'text');
});

test('maintainer overview text excludes raw markup and preserves readable link labels', () => {
  const paragraphs = overviewParagraphs('Query [Zarr stores](https://zarr.dev) as **SQL tables** and combine scientific arrays with your existing data.\n\n<script>alert(1)</script>\n\n```sql\nSELECT 1;\n```');
  assert.deepEqual(paragraphs, ['Query Zarr stores as SQL tables and combine scientific arrays with your existing data.']);
});

test('analyst references preserve contributor links without accepting executable or unrelated URLs', () => {
  assert.deepEqual(documentationLinks('[Scalar **functions**](https://example.com/functions) [API reference](https://example.com/functions) [API docs](javascript:alert) [Guide](./guide.md) [Logo](https://example.com/logo.png)'), [
    { href: 'https://example.com/functions', label: 'Scalar functions' },
  ]);
  assert.deepEqual(exampleContext('-- Count games\nSELECT count(*) FROM games;\n-- Result: 3496'), { purpose: 'Count games', result: '3496' });
  assert.equal(exampleContext('SELECT 1;\n-- A later, different query\nSELECT 2;').purpose, undefined);
  assert.equal(exampleContext('-- Result: 1\nSELECT 2;\n-- Result: 2').result, undefined);
});

test('prototypes use a published native build and arguments confirmed by the binder', () => {
  for (const name of ['sheetreader', 'gsheets']) {
    const inventory = read(`inventories/${name}.json`);
    const entry = [...catalog.extensions, ...read('reference-releases.generated.json').extensions].find(extension => extension.name === name && extension.availability.some(artifact => `v${artifact.version}` === inventory.engine.library_version));
    const version = inventory.engine.library_version.replace(/^v/, '');
    assert.ok(entry.availability.some(artifact => artifact.version === version && artifact.platform === inventory.engine.platform));
    assert.match(inventory.artifactSHA256, /^[a-f0-9]{64}$/);
    assert.ok(inventory.artifactURL.includes(`/v${version}/${inventory.engine.platform}/${name}.`));
    for (const fn of inventory.functions) {
      assert.equal(fn.parameters.length, fn.parameter_types.length);
      for (const name of fn.named_parameters) {
        assert.ok(fn.parameters.includes(name));
        if (version.startsWith('2.')) assert.ok(parseBinding(fn, fn.binding_evidence)?.named.includes(name));
        else assert.ok(fn.binding_evidence.includes(name + ' :'));
      }
    }
  }
});

test('the published Google Sheets signature keeps header and excludes the stale headers spelling', () => {
  const inventory = read('inventories/gsheets.json');
  const fn = inventory.functions.find(fn => fn.function_name === 'read_gsheet');
  assert.ok(fn.named_parameters.includes('header'));
  assert.ok(!fn.named_parameters.includes('headers'));
  assert.deepEqual(inventory.secret_types.map(secret => secret.type), ['gsheet']);
});

test('developer documentation matches the source version of each captured build', () => {
  const docs = read('docs.generated.json');
  for (const [name, documentation] of Object.entries(docs)) {
    const inventory = read(`inventories/${name}.json`);
    assert.ok(documentation.ref.startsWith(inventory.extensionVersion));
    for (const parameter of Object.keys(documentation.parameters)) assert.ok(inventory.functions.some(fn => fn.parameters.includes(parameter)));
  }
  assert.match(docs.gsheets.sections.Read[0], /header=false/);
  assert.doesNotMatch(docs.gsheets.sections.Read[0], /headers=false/);
});
