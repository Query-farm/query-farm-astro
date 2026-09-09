import { readFileSync, writeFileSync } from 'node:fs';
import { createCaptureBrowser } from './capture-browser.mjs';
import { defaultSnapshotId, wasmVersion as version } from '../../src/haybarn-functions/data/haybarn-release.mjs';

const snapshot = JSON.parse(readFileSync(`src/haybarn-functions/data/snapshots/${defaultSnapshotId}.json`, 'utf8'));
const candidates = JSON.parse(readFileSync('.cache/example-candidates.json', 'utf8'));
const names = new Set(snapshot.functions.map(row => row.function_name));
const { page, close } = await createCaptureBrowser();
const examples = [], failures = [];
try {
  const bundle = await page.evaluate(async () => { const engine = await import('/src/haybarn-functions/lib/engine.ts'); window.exampleConnection = (await engine.createConnection()).conn; return (await engine.ensureEngine()).bundle; });
  if (bundle !== snapshot.runtime.bundle) throw new Error('Example verification must use the catalog capture bundle. Recapture the catalog for this browser.');
  for (const candidate of candidates) {
    if (!names.has(candidate.function)) continue;
    // A literal catalog example that already works takes precedence over its adaptation.
    if (examples.some(row => row.function === candidate.function && row.original === candidate.original)) continue;
    const result = await page.evaluate(async sql => {
      try {
        const result = await window.exampleConnection.query(sql);
        return { ok: true, rowCount: result.numRows };
      } catch (error) { return { ok: false, error: error.message }; }
    }, candidate.sql);
    if (result.ok) examples.push({ ...candidate, verification: { engine: 'haybarn-wasm', packageVersion: version, sourceId: snapshot.sourceId, binarySha256: snapshot.binarySha256, rowCount: result.rowCount } });
    else failures.push({ ...candidate, error: result.error });
  }
} finally { await close(); }
writeFileSync('src/haybarn-functions/data/runnable-examples.json', JSON.stringify({ runtime: snapshot.runtime, examples }, null, 2) + '\n');
writeFileSync('.cache/example-failures.json', JSON.stringify(failures, null, 2) + '\n');
console.log(`${examples.length} examples verified in Haybarn WASM ${version}, covering ${new Set(examples.map(row => row.function)).size} functions; ${failures.length} candidates need additional setup.`);
