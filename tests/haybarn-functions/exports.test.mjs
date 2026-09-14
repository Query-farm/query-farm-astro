import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { signatureKey, overloadId, groupFunctions, compareSnapshots } from '../../scripts/haybarn-functions/catalog.mjs';
import { renderMachineResource } from '../../src/haybarn-functions/lib/machine-resources.ts';

const builtPath = url => resolve('dist', `.${url}`);
const readText = url => existsSync(builtPath(url))
  ? readFileSync(builtPath(url), 'utf8')
  : renderMachineResource(url)?.body ?? (() => { throw new Error(`Missing resource: ${url}`); })();
const readJson = url => JSON.parse(readText(url));
const resourceExists = url => existsSync(builtPath(url)) || renderMachineResource(url)?.status === 200;
const manifest = readJson('/products/haybarn/functions/api/v1/releases.json');
const schema = readJson('/products/haybarn/functions/api/v1/function.schema.json');
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const captured = new Map(manifest.snapshots.map(snapshot => [snapshot.id, JSON.parse(readFileSync(`src/haybarn-functions/data/snapshots/${snapshot.id}.json`, 'utf8'))]));

test('the published default and runnable examples identify the shipped WASM binary', () => {
  const snapshot = captured.get(manifest.defaultSnapshot);
  const build = readJson('/products/haybarn/functions/build-info.json');
  const examples = JSON.parse(readFileSync('src/haybarn-functions/data/runnable-examples.json', 'utf8'));
  assert.equal(snapshot.runtime.packageVersion, build.wasmVersion);
  assert.ok(build.wasm.some(asset => asset.sha256 === snapshot.binarySha256));
  assert.equal(examples.runtime.bundle, snapshot.runtime.bundle);
  for (const example of examples.examples) {
    assert.equal(example.verification.packageVersion, build.wasmVersion);
    assert.equal(example.verification.binarySha256, snapshot.binarySha256);
    assert.equal(example.verification.sourceId, snapshot.sourceId);
  }
});

test('SQLGlot examples cover all 176 catalog names in HTML, Markdown and JSON', () => {
  const translations = JSON.parse(readFileSync('src/haybarn-functions/data/translations.json', 'utf8'));
  const names = new Set(translations.map(row => row.function));
  assert.equal(names.size, 176);
  const index = readJson(`/products/haybarn/functions/api/v1/${manifest.defaultSnapshot}/functions.json`);
  for (const name of names) {
    const fn = index.functions.find(fn => fn.name === name);
    assert.ok(fn, `Missing catalog function ${name}`);
    const expected = translations.filter(row => row.function === name);
    const doc = readJson(fn.links.json);
    assert.deepEqual(doc.translations, expected);
    assert.ok(readText(`${fn.links.html}index.html`).includes('id="other-engines"'));
    const markdown = readText(fn.links.markdown);
    assert.ok(markdown.includes('## In other engines'));
    assert.equal(new Set(expected.map(row => row.source.dialect)).size, expected.length, 'One example per engine');
    for (const example of expected) {
      assert.ok(markdown.includes(example.source.sql));
      assert.ok(markdown.includes(example.target.sql));
      assert.equal(example.executionVerified, false);
      assert.match(example.provenance.url, /^https:\/\/github.com\/tobymao\/sqlglot\/blob\/[a-f0-9]{40}\//);
    }
  }
});

test('every exported function validates and preserves every captured overload exactly', () => {
  let total = 0;
  for (const snapshot of manifest.snapshots) {
    const index = readJson(snapshot.index);
    const source = captured.get(snapshot.id);
    const sourceFunctions = new Map(groupFunctions(source.functions).map(fn => [fn.name, fn]));
    assert.equal(index.functions.length, sourceFunctions.size);
    assert.deepEqual(index.snapshot.loadedExtensions, source.loadedExtensions);
    for (const fn of index.functions) {
      const doc = readJson(fn.links.json);
      assert.ok(validate(doc), `${fn.links.json}: ${JSON.stringify(validate.errors)}`);
      assert.equal(doc.name, fn.name);
      assert.equal(doc.snapshot.id, snapshot.id);
      assert.equal(doc.overloads.length, sourceFunctions.get(fn.name).overloads.length);
      const raw = new Map(sourceFunctions.get(fn.name).overloads.map(row => [signatureKey(row), row]));
      const html = readText(`${fn.links.html}index.html`);
      const markdown = readText(fn.links.markdown);
      assert.deepEqual(doc.editorial.argumentNotes, [], 'Argument guidance must come from captured descriptions');
      const descriptions = [...new Set(doc.overloads.map(overload => overload.catalog.description).filter(Boolean))];
      assert.equal((html.match(/data-catalog-description/g) ?? []).length, descriptions.length, 'Display every distinct engine description once');
      for (const overload of doc.overloads) {
        assert.deepEqual(overload.catalog, raw.get(signatureKey(overload.catalog)));
        assert.equal(overload.id, overloadId(overload.catalog));
        assert.ok(html.includes(`id="${overload.id}"`), `Missing HTML anchor: ${overload.url}`);
        assert.ok(markdown.includes(overload.id), `Missing Markdown overload: ${fn.links.markdown}`);
      }
      total++;
    }
  }
  assert.ok(total > 3500);
});

test('discovery and all snapshot indexes link to generated resources', () => {
  const discovery = readText('/products/haybarn/functions/llms.txt');
  assert.ok(discovery.length < 6000, 'Discovery should remain a small starting point');
  assert.ok(discovery.includes('/products/haybarn/functions/api/v1/releases.json'));
  assert.ok(discovery.includes('/products/haybarn/functions/agents/index.md'));
  for (const snapshot of manifest.snapshots) {
    assert.ok(discovery.includes(snapshot.markdownIndex));
    assert.ok(resourceExists(snapshot.markdownIndex));
    const index = readJson(snapshot.index);
    for (const fn of index.functions) {
      assert.ok(Array.isArray(fn.inputTypes));
      assert.ok(Array.isArray(fn.returnTypes));
      for (const path of [fn.links.json, fn.links.markdown, `${fn.links.html}index.html`]) assert.ok(resourceExists(path), path);
    }
  }
});

test('high-cardinality machine routes are rendered by Pages Functions rather than static assets', () => {
  const snapshot = manifest.snapshots.find(item => item.id === manifest.defaultSnapshot);
  const index = readJson(snapshot.index);
  const fn = index.functions.find(item => item.name === 'regexp_extract');
  assert.equal(existsSync(builtPath(snapshot.index)), false);
  assert.equal(existsSync(builtPath(fn.links.json)), false);
  assert.equal(existsSync(builtPath(fn.links.markdown)), false);
  assert.equal(renderMachineResource(fn.links.json).status, 200);
  assert.equal(renderMachineResource(fn.links.markdown).headers['Content-Signal'], 'search=yes, ai-input=yes, ai-train=no');
  const search = JSON.parse(renderMachineResource('/products/haybarn/functions/api/v1/search.json?q=name_list').body);
  assert.ok(search.results.some(result => result.meta.title === 'regexp_extract'));
  assert.equal(renderMachineResource('/products/haybarn/functions/api/v1/not-a-release/functions.json').status, 404);
});

test('site discovery covers VGI and publishes the explicit AI usage policy', () => {
  const root = readText('/llms.txt');
  assert.ok(root.includes('https://query.farm/vgi/llms.txt'));
  assert.ok(root.includes('https://query.farm/products/haybarn/extensions/catalog.json'));
  const vgi = readText('/vgi/llms.txt');
  for (const section of ['Concepts', 'C#', 'Go', 'Java', 'Python', 'Rust', 'TypeScript']) assert.ok(vgi.includes(`## ${section}`));
  assert.ok(readText('/robots.txt').includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'));
  assert.ok(readText('/_headers').includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'));
});

test('Pages invokes Functions only for machine-resource routes', () => {
  const routes = readJson('/_routes.json');
  assert.deepEqual(routes.exclude, []);
  assert.ok(routes.include.includes('/products/haybarn/functions/api/v1/*/functions/*.json'));
  assert.ok(routes.include.includes('/products/haybarn/functions/releases/*/*/index.md'));
  assert.ok(!routes.include.includes('/*'));
  assert.ok(!routes.include.includes('/products/haybarn/functions/releases/*'));
});

test('general comparisons have a utility category across releases with different catalog tags', () => {
  for (const snapshot of manifest.snapshots) {
    const index = readJson(snapshot.index);
    for (const name of ['greatest', 'least']) {
      const fn = index.functions.find(fn => fn.name === name);
      assert.equal(fn.category, 'system', `${name} in ${snapshot.id}`);
      const doc = readJson(fn.links.json);
      assert.equal(doc.category, 'system');
      assert.deepEqual(doc.kinds, ['scalar']);
    }
    assert.equal(index.functions.find(fn => fn.name === 'date_trunc').category, 'dates');
    assert.equal(index.functions.find(fn => fn.name === 'greatest_common_divisor').category, 'numeric');
  }
});

test('exported comparisons agree with captured catalogs in both directions', () => {
  for (const entry of manifest.comparisons) {
    const doc = readJson(entry.json);
    const diff = compareSnapshots(captured.get(entry.from), captured.get(entry.to));
    assert.equal(doc.from.id, entry.from);
    assert.equal(doc.to.id, entry.to);
    for (const field of ['added', 'removed', 'changed']) assert.deepEqual(doc[field].map(fn => fn.name), diff[field].map(fn => fn.name));
    for (const fn of doc.changed) {
      const expected = diff.changed.find(candidate => candidate.name === fn.name);
      assert.deepEqual(fn.addedSignatures.map(overload => overload.catalog), expected.addedSignatures);
      assert.deepEqual(fn.removedSignatures.map(overload => overload.catalog), expected.removedSignatures);
    }
  }
});

test('unknowns remain null and catalog examples are not marked as execution verified', () => {
  const base = `/products/haybarn/functions/api/v1/${manifest.defaultSnapshot}/functions`;
  const table = readJson(`${base}/read_csv.json`);
  for (const overload of table.overloads) {
    assert.equal(overload.parameterOrder, 'alphabetical-not-call-order');
    assert.equal(overload.catalog.return_type, null);
    assert.equal(overload.catalog.description, null);
    assert.equal(overload.callingConvention.source, 'engine-binder');
    assert.deepEqual(overload.callingConvention.positional.map(arg => arg.name), ['col0']);
    assert.ok(overload.callingConvention.named.some(arg => arg.name === 'header' && arg.type === 'BOOLEAN'));
    assert.ok(overload.signature.startsWith('read_csv(col0: VARCHAR'));
    assert.ok(overload.signature.includes('header := BOOLEAN'));
  }
  const repeated = readJson(`${base}/repeat_row.json`).overloads[0];
  assert.equal(repeated.catalog.varargs, 'ANY');
  assert.equal(repeated.callingConvention.variadic.type, 'ANY');
  assert.equal(repeated.callingConvention.variadic.minimumCount, null);
  assert.deepEqual(repeated.callingConvention.positional, []);
  assert.deepEqual(repeated.callingConvention.named.map(arg => arg.name), ['num_rows']);
  assert.equal(repeated.signature, 'repeat_row(…: ANY, num_rows := BIGINT) → TABLE');
  const pack = readJson(`${base}/struct_pack.json`).overloads[0];
  assert.equal(pack.callingConvention.variadic.namedArgumentMode, null);
  assert.equal(pack.callingConvention.named, null);
  assert.ok(pack.signature.includes('…: ANY'));
  for (const overload of readJson(`${base}/operator-2a.json`).overloads) {
    assert.equal(overload.catalog.function_type, 'scalar');
    assert.equal(overload.syntax.kind, 'operator');
    assert.equal(overload.syntax.operator.expression, 'left * right');
    assert.ok(!overload.signature.startsWith('*('));
  }
  const transform = readJson(`${base}/list_transform.json`);
  for (const example of [...transform.examples, ...transform.editorial.recipes]) assert.equal(example.verification, null);
  assert.notEqual(transform.examples[0].source, transform.editorial.recipes[0].source);
});
