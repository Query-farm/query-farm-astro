import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { renderMachineResource } from '../../src/haybarn-functions/lib/machine-resources.ts';

const DIST = resolve('dist');
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';
const types = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function insideDist(path) {
  return path === DIST || path.startsWith(`${DIST}${sep}`);
}

async function assetPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const base = resolve(DIST, `.${decoded}`);
  if (!insideDist(base)) return null;
  const candidates = decoded.endsWith('/')
    ? [resolve(base, 'index.html')]
    : extname(decoded) ? [base] : [resolve(base, 'index.html'), `${base}.html`];
  for (const candidate of candidates) {
    if (!insideDist(candidate)) continue;
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch { /* try the next clean-URL form */ }
  }
  return null;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4323');
    const machine = renderMachineResource(url);
    if (machine) {
      response.writeHead(machine.status, machine.headers);
      response.end(request.method === 'HEAD' ? undefined : machine.body);
      return;
    }
    const path = await assetPath(url.pathname);
    if (path) {
      const body = await readFile(path);
      response.writeHead(200, {
        'Content-Length': String(body.length),
        'Content-Signal': CONTENT_SIGNAL,
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const body = await readFile(resolve(DIST, '404.html'));
    response.writeHead(404, {
      'Content-Length': String(body.length),
      'Content-Signal': CONTENT_SIGNAL,
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal preview server error');
  }
}).listen(4323, '127.0.0.1', () => console.log('[preview] http://127.0.0.1:4323'));
