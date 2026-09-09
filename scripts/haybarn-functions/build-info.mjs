import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { wasmVersion } from '../../src/haybarn-functions/data/haybarn-release.mjs';

const base = process.env.PUBLIC_HAYBARN_WASM_BASE_URL || `https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/dist`;
const wasm = [];
for (const bundle of ['eh', 'mvp']) {
  const name = `duckdb-${bundle}.wasm`;
  const bytes = await readFile(`node_modules/@haybarn/haybarn-wasm/dist/${name}`);
  wasm.push({ path: `${base}/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('dist/products/haybarn/functions/build-info.json', JSON.stringify({ site: 'https://query.farm', wasmVersion, wasm }, null, 2) + '\n');

// Catch accidental bundling of the large runtime before a Pages deployment.
for (const path of await readdir('dist/_astro')) {
  if ((await stat(`dist/_astro/${path}`)).size > 25 * 1024 * 1024) throw new Error(`Asset exceeds the Cloudflare Pages file limit: ${path}`);
}
console.log(`[haybarn] Browser runtime pinned to ${wasmVersion}; large binaries served from ${base}.`);
