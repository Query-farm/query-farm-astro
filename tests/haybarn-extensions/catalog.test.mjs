import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categories, categoryIds } from '../../src/data/haybarn-extensions/taxonomy.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../../src/data/haybarn-extensions/${name}`, import.meta.url)));
const catalog = read('catalog.generated.json');

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

test('prototypes use a published native build and arguments confirmed by the binder', () => {
  for (const name of ['sheetreader', 'gsheets']) {
    const inventory = read(`inventories/${name}.json`);
    const entry = catalog.extensions.find(extension => extension.name === name);
    const version = inventory.engine.library_version.replace(/^v/, '');
    assert.ok(entry.availability.some(artifact => artifact.version === version && artifact.platform === inventory.engine.platform));
    assert.match(inventory.artifactSHA256, /^[a-f0-9]{64}$/);
    assert.ok(inventory.artifactURL.includes(`/v${version}/${inventory.engine.platform}/${name}.`));
    for (const fn of inventory.functions) {
      assert.equal(fn.parameters.length, fn.parameter_types.length);
      for (const name of fn.named_parameters) {
        assert.ok(fn.parameters.includes(name));
        assert.ok(fn.binding_evidence.includes(name + ' :'));
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
