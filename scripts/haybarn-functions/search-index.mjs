// Function records are searched by a Pages Function directly from the captured
// catalogs. Pagefind remains responsible for guide prose only, avoiding about
// one generated search fragment per function and release.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const readJson = async path => JSON.parse(await readFile(resolve(dist, `.${path}`), 'utf8'));
export async function indexHaybarnFunctions() {
  const manifest = await readJson('/products/haybarn/functions/api/v1/releases.json');
  const snapshots = manifest.snapshots.map(snapshot => ({ id: snapshot.id, functionCount: snapshot.functionCount }));
  const functionCount = snapshots.reduce((count, snapshot) => count + snapshot.functionCount, 0);
  await writeFile(resolve(dist, 'products/haybarn/functions/search-manifest.json'), JSON.stringify({
    defaultSnapshot: manifest.defaultSnapshot,
    functionCount,
    pagefindFunctionCount: 0,
    searchEndpoint: '/products/haybarn/functions/api/v1/search.json',
    snapshots,
  }, null, 2) + '\n');
  console.log(`[search] Routed ${functionCount} Haybarn function references through Pages Function search.`);
}
