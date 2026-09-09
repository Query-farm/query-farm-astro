import type { DuckDBBundles } from '@haybarn/haybarn-wasm';
import { wasmVersion } from '../../haybarn-functions/data/haybarn-release.mjs';

// Both the product demos and the function guide use the installed package pin.
// Keep large binaries off Cloudflare Pages. The capture server overrides the
// base with the installed package directory to verify the exact local bytes.
const configuredBase = import.meta.env.PUBLIC_HAYBARN_WASM_BASE_URL ||
  `https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/dist`;
// Blob workers need absolute module URLs, including on the capture server.
export const haybarnWasmBase = new URL(configuredBase, typeof location === 'undefined' ? 'https://query.farm' : location.origin).href.replace(/\/$/, '');

export const haybarnBundles: DuckDBBundles = {
  mvp: { mainModule: `${haybarnWasmBase}/duckdb-mvp.wasm`, mainWorker: `${haybarnWasmBase}/duckdb-browser-mvp.worker.js` },
  eh: { mainModule: `${haybarnWasmBase}/duckdb-eh.wasm`, mainWorker: `${haybarnWasmBase}/duckdb-browser-eh.worker.js` },
};
