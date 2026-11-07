import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentReference, currentReferenceIds } from '../../scripts/haybarn-functions/canonicals.mjs';

const current = { id: 'current', engine: 'haybarn', engineVersion: 'v2.0.0', sourceId: 'source', binarySha256: 'binary',
  scope: 'browser base', runtime: { engine: 'haybarn-wasm', bundle: 'base', packageVersion: '2.0.0' },
  requestedExtensions: ['json'], loadedExtensions: [{ extension_name: 'json', extension_version: '2.0.0' }],
  functions: [{ function_name: 'example', description: 'Original description', parameter_types: ['VARCHAR'] }] };

test('package-only releases can consolidate; binary, catalog, profile and engine differences cannot', () => {
  const previous = { ...current, id: 'previous', capturedAt: 'earlier', runtime: { ...current.runtime, packageVersion: '2.0.0-rc1' } };
  assert.equal(equivalentReference(previous, current), true);
  assert.deepEqual([...currentReferenceIds([previous, current], current.id)], ['previous', 'current']);
  for (const change of [
    { binarySha256: 'different' }, { binarySha256: '' }, { engine: 'duckdb' }, { engineVersion: 'v1.5.6' },
    { sourceId: 'different' }, { scope: 'different' }, { runtime: undefined },
    { runtime: { ...current.runtime, bundle: 'different' } },
    { requestedExtensions: ['json', 'spatial'] }, { loadedExtensions: [] },
    { functions: [{ ...current.functions[0], description: 'Corrected description' }] },
    { functions: [{ ...current.functions[0], parameter_types: ['INTEGER'] }] },
  ]) assert.equal(equivalentReference({ ...current, ...change }, current), false, JSON.stringify(change));
});
