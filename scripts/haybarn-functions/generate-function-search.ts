import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FUNCTION_DATA_PUBLIC_DIR, FUNCTION_DATA_ROOT, SEARCH_ASSET_PATH } from '../../src/haybarn-functions/data/function-data-paths.mjs';
import { snapshots, defaultSnapshot, getFunctions, functionUrl } from '../../src/haybarn-functions/lib/catalog';
import { exportFunction } from '../../src/haybarn-functions/lib/agent-docs';

function collectStrings(value: unknown, output: Set<string>) {
  if (typeof value === 'string') {
    if (value.trim()) output.add(value.replaceAll('`', ''));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

const records = snapshots.flatMap(snapshot => getFunctions(snapshot).map(fn => {
  const doc = exportFunction(snapshot, fn);
  const strings = new Set<string>();
  collectStrings({
    name: doc.name,
    description: doc.description,
    category: doc.category,
    kinds: doc.kinds,
    aliasOf: doc.aliasOf,
    overloads: doc.overloads,
    editorial: doc.editorial,
    examples: doc.examples,
    translations: doc.translations,
    runnableExamples: doc.runnableExamples,
    additionalDocumentation: doc.additionalDocumentation,
  }, strings);
  return {
    snapshotId: snapshot.id,
    release: snapshot.label,
    name: fn.name,
    description: fn.description || doc.editorial.usage?.summary || '',
    url: functionUrl(snapshot, fn, snapshot.id !== defaultSnapshot.id),
    content: [...strings].join('\n').toLocaleLowerCase('en-US'),
  };
}));

const json = `${JSON.stringify(records)}\n`;
await writeFile('src/haybarn-functions/data/search.generated.json', json);
// The Pages Function fetches this static copy instead of bundling 12 MB of
// records. See src/haybarn-functions/data/function-data-paths.mjs.
const staticCopy = `${FUNCTION_DATA_PUBLIC_DIR}${SEARCH_ASSET_PATH.slice(FUNCTION_DATA_ROOT.length - 1)}`;
await mkdir(dirname(staticCopy), { recursive: true });
await writeFile(staticCopy, json);
console.log(`[search] Generated ${records.length} compact Pages Function records.`);
