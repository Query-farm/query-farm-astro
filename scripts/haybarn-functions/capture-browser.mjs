import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wasmVersion } from '../../src/haybarn-functions/data/haybarn-release.mjs';

// A private capture server loads only the engine module. It can start before
// a new release has a catalog or verified examples, when Astro pages cannot.
export async function createCaptureBrowser() {
  const installed = JSON.parse(readFileSync(new URL('../../node_modules/@haybarn/haybarn-wasm/package.json', import.meta.url))).version;
  if (installed !== wasmVersion) throw new Error(`Installed Haybarn ${installed} does not match package.json (${wasmVersion}). Run npm install first.`);
  const server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
    define: { 'import.meta.env.PUBLIC_HAYBARN_WASM_BASE_URL': JSON.stringify('/haybarn-wasm') },
    cacheDir: '.cache/haybarn-capture-vite', appType: 'custom', logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, exclude: ['@haybarn/haybarn-wasm'] },
    plugins: [{ name: 'capture-shell', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.match(/^\/haybarn-wasm\/(duckdb-(?:eh|mvp)\.wasm|duckdb-browser-(?:eh|mvp)\.worker\.js)$/)?.[1];
        if (name) {
          response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
          response.end(readFileSync(new URL(`../../node_modules/@haybarn/haybarn-wasm/dist/${name}`, import.meta.url)));
          return;
        }
        if (request.url !== '/') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><title>Haybarn capture</title></head><body></body></html>');
      });
    } }],
  });
  let browser;
  const close = async () => { try { await browser?.close(); } finally { await server.close(); } };
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    return { page, close };
  } catch (error) { await close(); throw error; }
}
