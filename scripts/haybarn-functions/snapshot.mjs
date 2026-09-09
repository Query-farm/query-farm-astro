import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeRows, groupFunctions } from './catalog.mjs';
import { captureBindings } from './bindings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: {
  binary: { type: 'string' }, engine: { type: 'string' }, id: { type: 'string' },
  label: { type: 'string' }, source: { type: 'string' },
  extensions: { type: 'string', default: 'core_functions,json,icu,parquet' },
} });
if (!values.binary || !['haybarn', 'duckdb'].includes(values.engine) || !values.id || !values.label || !values.source) {
  throw new Error('Usage: npm run snapshot -- --binary /path/to/cli --engine haybarn|duckdb --id release-id --label "Published release name" --source https://... [--extensions core_functions,json,icu,parquet]');
}
if (!/^[a-z0-9][a-z0-9.-]*$/.test(values.id)) throw new Error('Snapshot id must be a lowercase URL-safe identifier.');
const binary = resolve(values.binary);
const extensions = values.extensions.split(',').filter(Boolean).sort();
if (extensions.some(n => !/^[a-z_]+$/.test(n))) throw new Error('Invalid extension name');
const binarySha256 = createHash('sha256').update(readFileSync(binary)).digest('hex');
const extensionDirectory = resolve(root, '.cache/extensions', `${values.engine}-${binarySha256.slice(0, 16)}`);
mkdirSync(extensionDirectory, { recursive: true });
const initFile = resolve(root, '.cache/snapshot-init.sql');
writeFileSync(initFile, '');
const prelude = `SET extension_directory = '${extensionDirectory.replaceAll("'", "''")}';\n` +
  extensions.map(n => `INSTALL ${n}; LOAD ${n};`).join('\n');
// JSON serialization happens inside SQL: CLI -json renders LISTs as SQL in
// some builds. An empty init file keeps personal startup macros out of docs.
const output = execFileSync(binary, ['-init', initFile, '-batch', '-bail', '-noheader', '-list', ':memory:', '-c',
  `${prelude}\nSELECT to_json(struct_pack(
    version := (SELECT list(v) FROM pragma_version() v),
    functions := (SELECT list(f) FROM duckdb_functions() f),
    loadedExtensions := (SELECT list(e) FROM (SELECT extension_name, extension_version, installed_from FROM duckdb_extensions() WHERE loaded ORDER BY extension_name) e)
  ));`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
const captured = JSON.parse(output.trim());
const version = captured.version[0];
const functions = normalizeRows(captured.functions);
const loadedExtensions = captured.loadedExtensions;
const snapshot = {
  schemaVersion: 1, id: values.id, engine: values.engine, label: values.label,
  engineVersion: version.library_version, sourceId: version.source_id,
  source: values.source, binarySha256,
  capturedAt: new Date().toISOString(), requestedExtensions: extensions, loadedExtensions,
  scope: 'Built-in functions in the main schema, with the requested extensions loaded. Catalog visibility is not a guarantee of browser support.',
  functions,
};
const path = resolve(root, 'src/haybarn-functions/data/snapshots', `${values.id}.json`);
mkdirSync(dirname(path), { recursive: true });
// Preserve capture date on an identical re-run; avoid meaningless diffs.
try {
  const previous = JSON.parse(readFileSync(path, 'utf8'));
  if (JSON.stringify({ ...previous, capturedAt: null }) === JSON.stringify({ ...snapshot, capturedAt: null })) {
    console.log(`${values.id}: unchanged`);
    captureBindings({ binary, snapshot: previous, root });
    process.exit(0);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`${values.id}: ${groupFunctions(functions).length} functions, ${functions.length} overloads (${version.library_version}, ${version.source_id})`);
captureBindings({ binary, snapshot, root });
