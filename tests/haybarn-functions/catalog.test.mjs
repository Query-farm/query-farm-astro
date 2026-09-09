import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { groupFunctions, normalizeRows, compareSnapshots, signatureKey, functionSlug, overloadId } from '../../scripts/haybarn-functions/catalog.mjs';
import { parseBinding } from '../../scripts/haybarn-functions/bindings.mjs';
import { operatorNotation } from '../../scripts/haybarn-functions/notation.mjs';
import { comparisonSource } from '../../src/haybarn-functions/data/release-selection.mjs';

const snapshots = readdirSync(new URL('../../src/haybarn-functions/data/snapshots/', import.meta.url)).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(new URL(`../../src/haybarn-functions/data/snapshots/${f}`, import.meta.url), 'utf8')));

test('comparison defaults follow published Haybarn package versions across release candidates and final releases', () => {
  const haybarn = version => ({ engine: 'haybarn', engineVersion: 'v99.0.0-dev', runtime: { packageVersion: version } });
  const rc2 = haybarn('1.5.5-rc2'), rc10 = haybarn('1.5.5-rc10'), stable = haybarn('1.5.5');
  const older = haybarn('1.4.9'), future = haybarn('1.6.0');
  const duckdb = { engine: 'duckdb', engineVersion: 'v1.5.5' };
  const captures = [rc2, future, stable, older, rc10, duckdb];
  assert.equal(comparisonSource(captures, stable), rc10);
  assert.equal(comparisonSource(captures, rc10), rc2);
  assert.equal(comparisonSource(captures, future), stable);
  assert.equal(comparisonSource([rc2, duckdb, { engine: 'duckdb', engineVersion: 'v1.4.4' }], rc2), duckdb);
  assert.equal(comparisonSource([rc2], rc2), undefined);
});

test('named argument evidence matches the exact engine and captured overloads', () => {
  for (const snapshot of snapshots) {
    const capture = JSON.parse(readFileSync(new URL(`../../src/haybarn-functions/data/bindings/${snapshot.id}.json`, import.meta.url), 'utf8'));
    assert.equal(capture.binarySha256, snapshot.binarySha256);
    assert.deepEqual(capture.unresolved, []);
    for (const row of snapshot.functions.filter(row => row.function_type === 'table')) {
      const binding = capture.overloads[overloadId(row)];
      assert.ok(binding, row.function_name);
      assert.deepEqual(parseBinding(row, binding.diagnostic), { positional: binding.positional, named: binding.named });
      assert.match(binding.query, /^EXPLAIN SELECT/);
    }
  }
});

test('binding parser leaves ambiguous or unrelated diagnostics unknown', () => {
  const row = { parameters: ['col0', 'header'], parameter_types: ['VARCHAR', 'BOOLEAN'] };
  assert.equal(parseBinding(row, 'IO Error: could not open file'), null);
  const diagnostic = 'Binder Error: Invalid named parameter "__guide_invalid_named_parameter__" for function read_csv\nCandidates:\n    header BOOLEAN';
  assert.deepEqual(parseBinding(row, diagnostic), { positional: ['col0'], named: ['header'] });
  assert.equal(parseBinding({ ...row, parameter_types: ['VARCHAR', 'INTEGER'] }, diagnostic), null);
  assert.equal(parseBinding({ ...row, parameters: ['filename', 'header'] }, diagnostic), null);
});

test('operator notation distinguishes binary, unary and postfix forms without inventing variadic syntax', () => {
  const row = { function_name: '*', parameters: ['col0', 'col1'], parameter_types: ['INTEGER', 'INTEGER'], varargs: null };
  assert.equal(operatorNotation(row).expression, 'left * right');
  assert.equal(operatorNotation({ ...row, function_name: '-', parameters: ['col0'] }).expression, '-operand');
  assert.equal(operatorNotation({ ...row, function_name: '!__postfix', parameters: ['x'] }).expression, 'x!');
  assert.equal(operatorNotation({ ...row, function_name: '+', parameters: [], varargs: 'ANY[]' }), null);
  assert.equal(operatorNotation({ ...row, function_name: 'multiply' }), null);
});

test('committed catalogs contain real provenance, valid arguments and unique routes', () => {
  assert.ok(snapshots.some(s => s.engine === 'haybarn'));
  assert.ok(snapshots.filter(s => s.engine === 'duckdb').length >= 2);
  for (const snapshot of snapshots) {
    assert.match(snapshot.sourceId, /^[a-f0-9]{10,40}$/);
    assert.match(snapshot.binarySha256, /^[a-f0-9]{64}$/);
    assert.ok(snapshot.functions.length > 2000);
    const functions = groupFunctions(snapshot.functions);
    assert.equal(new Set(functions.map(f => f.slug)).size, functions.length);
    for (const row of snapshot.functions) {
      assert.equal(row.parameters.length, row.parameter_types.length, row.function_name);
      assert.equal(row.schema_name, 'main');
      assert.notEqual(row.internal, false);
    }
  }
});

test('comparing a snapshot with itself has no differences', () => {
  for (const snapshot of snapshots) assert.deepEqual(compareSnapshots(snapshot, snapshot), { added: [], removed: [], changed: [] });
});

test('comparison distinguishes addition, omission, and changed overloads', () => {
  const base = { ...snapshots[0].functions.find(f => f.function_name === 'abs'), parameters: ['x'], parameter_types: ['INTEGER'], return_type: 'INTEGER' };
  const from = { functions: [base, { ...base, function_name: 'gone' }] };
  const to = { functions: [base, { ...base, parameter_types: ['DOUBLE'], return_type: 'DOUBLE' }, { ...base, function_name: 'new' }] };
  const result = compareSnapshots(from, to);
  assert.deepEqual(result.added.map(f => f.name), ['new']);
  assert.deepEqual(result.removed.map(f => f.name), ['gone']);
  assert.equal(result.changed[0].name, 'abs');
  assert.equal(result.changed[0].addedSignatures.length, 1);
  assert.equal(result.changed[0].removedSignatures.length, 0);
});

test('table argument iteration order does not produce spurious release changes', () => {
  const base = { ...snapshots[0].functions.find(f => f.function_name === 'read_csv'), parameters: ['col0', 'header'], parameter_types: ['VARCHAR', 'BOOLEAN'] };
  const reversed = { ...base, parameters: ['header', 'col0'], parameter_types: ['BOOLEAN', 'VARCHAR'] };
  assert.equal(signatureKey(base), signatureKey(reversed));
  assert.notEqual(signatureKey({ ...base, function_type: 'scalar' }), signatureKey({ ...reversed, function_type: 'scalar' }));
});

test('normalization tolerates older missing fields and excludes user schemas', () => {
  const row = { schema_name: 'main', function_name: 'example', function_type: 'scalar', internal: true, parameters: [], parameter_types: [] };
  const rows = normalizeRows([row, row, { ...row, schema_name: 'pg_catalog' }, { ...row, internal: false }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].examples, []);
  assert.equal(rows[0].alias_of, null);
  assert.deepEqual(rows[0].categories, []);
});

test('operator slugs cannot introduce path traversal or collide with ordinary names', () => {
  const names = ['/', '//', '+', '-', '%', '~~', 'abs', 'foo_bar', '"<script>'];
  const slugs = names.map(functionSlug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9_-]+$/);
});

test('overload links survive metadata edits and table ordering changes but change with the signature', () => {
  const row = { ...snapshots[0].functions.find(f => f.function_name === 'read_csv'), parameters: ['col0', 'header'], parameter_types: ['VARCHAR', 'BOOLEAN'] };
  assert.equal(overloadId(row), overloadId({ ...row, description: 'Reworded documentation', examples: ['new example'] }));
  assert.equal(overloadId(row), overloadId({ ...row, parameters: ['header', 'col0'], parameter_types: ['BOOLEAN', 'VARCHAR'] }));
  assert.notEqual(overloadId(row), overloadId({ ...row, return_type: 'VARCHAR' }));
  assert.notEqual(overloadId(row), overloadId({ ...row, function_name: 'another_function' }));
});
