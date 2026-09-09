// Serve the latest production search index on the Astro development origin.
// Pagefind's build output is deliberately outside public/ to avoid copying an
// old index into a new build. Run npm run build to refresh it during development.
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

export function searchDevPlugin() {
  return {
    name: 'haybarn-search-dev',
    configureServer(server) {
      const directory = resolve('dist/pagefind');
      server.middlewares.use('/pagefind', async (request, response) => {
        try {
          const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
          const path = resolve(directory, `.${pathname}`);
          if (!path.startsWith(directory + sep)) { response.statusCode = 404; response.end(); return; }
          const content = await readFile(path);
          response.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' }[extname(path)] ?? 'application/octet-stream');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end(content);
        } catch {
          response.statusCode = 404;
          response.end('Search index unavailable. Run npm run build.');
        }
      });
    },
  };
}
