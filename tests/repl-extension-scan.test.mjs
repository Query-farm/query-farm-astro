import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extensionsInSql, namesToPrefetch } from '../src/lib/repl/extension-scan.ts';

test('finds other extensions and leaves out the primary one', () => {
  const sql = `-- setup
INSTALL rapidfuzz FROM community;
LOAD rapidfuzz;
LOAD spatial;
SELECT 1;`;
  assert.deepEqual(extensionsInSql(sql, 'RapidFuzz'), [{ name: 'spatial', source: undefined }]);
});

test('keeps the repository from either statement', () => {
  assert.deepEqual(extensionsInSql('INSTALL foo FROM community; LOAD foo;', 'x'), [{ name: 'foo', source: 'community' }]);
  assert.deepEqual(extensionsInSql("INSTALL foo FROM 'http://localhost:8787';", 'x'), [
    { name: 'foo', source: 'http://localhost:8787' },
  ]);
});

test('loads Query.Farm extensions from community', () => {
  assert.deepEqual(extensionsInSql('LOAD a5 FROM query_farm;', 'x'), [{ name: 'a5', source: 'community' }]);
});

test('ignores comments, file paths and other statements', () => {
  const sql = `-- LOAD commented;
/* LOAD blocked; */
LOAD '/path/to/local.duckdb_extension';
SELECT 'LOAD inside_a_string';`;
  assert.deepEqual(extensionsInSql(sql, 'x'), []);
});

test('adds what a LOAD pulls in, once', () => {
  assert.deepEqual(namesToPrefetch([{ name: 'json' }, { name: 'iceberg' }, { name: 'parquet' }]), [
    'json',
    'iceberg',
    'avro',
    'parquet',
  ]);
});
