import { writeFile } from 'node:fs/promises';
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
    description: fn.description,
    url: functionUrl(snapshot, fn, snapshot.id !== defaultSnapshot.id),
    content: [...strings].join('\n').toLocaleLowerCase('en-US'),
  };
}));

await writeFile('src/haybarn-functions/data/search.generated.json', `${JSON.stringify(records)}\n`);
console.log(`[search] Generated ${records.length} compact Pages Function records.`);
