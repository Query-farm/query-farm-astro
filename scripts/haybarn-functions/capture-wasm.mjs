import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeRows, groupFunctions, overloadId } from './catalog.mjs';
import { bindingQuery, parseBinding } from './bindings.mjs';
import { createCaptureBrowser } from './capture-browser.mjs';
import { defaultSnapshotId as id, wasmVersion as version } from '../../src/haybarn-functions/data/haybarn-release.mjs';

const { page, close } = await createCaptureBrowser();
try {
  const captured = await page.evaluate(async () => {
    const { createConnection, ensureEngine } = await import('/src/haybarn-functions/lib/engine.ts');
    const session = await createConnection();
    window.captureConnection = session.conn;
    for (const extension of ['core_functions', 'json', 'icu', 'parquet']) await session.conn.query(`LOAD ${extension};`);
    const result = await session.conn.query(`SELECT to_json(struct_pack(
      version := (SELECT list(v) FROM pragma_version() v),
      functions := (SELECT list(f) FROM duckdb_functions() f),
      loadedExtensions := (SELECT list(e) FROM (SELECT extension_name, extension_version, installed_from FROM duckdb_extensions() WHERE loaded ORDER BY extension_name) e)
    )) AS capture;`);
    return { data: JSON.parse(result.get(0).capture), bundle: (await ensureEngine()).bundle };
  });
  const bundle = captured.bundle;
  const hash = createHash('sha256').update(readFileSync(`node_modules/@haybarn/haybarn-wasm/dist/duckdb-${bundle}.wasm`)).digest('hex');
  const data = captured.data;
  const snapshot = {
    schemaVersion: 1, id, engine: 'haybarn', label: `Haybarn WASM ${version}`,
    engineVersion: data.version[0].library_version, sourceId: data.version[0].source_id,
    source: `https://www.npmjs.com/package/@haybarn/haybarn-wasm/v/${version}`, binarySha256: hash,
    capturedAt: new Date().toISOString(), requestedExtensions: ['core_functions', 'icu', 'json', 'parquet'], loadedExtensions: data.loadedExtensions,
    scope: 'Built-in functions in the main schema captured from the published Haybarn WASM package, with core_functions, ICU, JSON and Parquet loaded.',
    runtime: { engine: 'haybarn-wasm', packageVersion: version, bundle },
    functions: normalizeRows(data.functions),
  };
  const path = `src/haybarn-functions/data/snapshots/${id}.json`;
  try {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    if (JSON.stringify({ ...previous, capturedAt: null }) === JSON.stringify({ ...snapshot, capturedAt: null })) snapshot.capturedAt = previous.capturedAt;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const overloads = {}, unresolved = [];
  for (const row of snapshot.functions.filter(row => row.function_type === 'table')) {
    const key = overloadId(row), query = bindingQuery(row);
    if (!query) { unresolved.push(key); continue; }
    const diagnostic = await page.evaluate(async query => {
      try { await window.captureConnection.query(query); return ''; }
      catch (error) { return error.message.trim(); }
    }, query);
    const binding = parseBinding(row, diagnostic);
    if (binding) overloads[key] = { ...binding, query, diagnostic };
    else unresolved.push(key);
  }
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n');
  writeFileSync(`src/haybarn-functions/data/bindings/${id}.json`, JSON.stringify({ schemaVersion: 1, snapshot: id, binarySha256: hash, source: 'engine-binder', overloads, unresolved }, null, 2) + '\n');
  console.log(`${id}: ${groupFunctions(snapshot.functions).length} functions; ${snapshot.functions.length} overloads; ${Object.keys(overloads).length} table bindings (${unresolved.length} unresolved).`);
} finally { await close(); }
