// Query Farm's Pagefind approach: crawl guide pages, then add one complete
// record per function and snapshot. Catalog listing pages are not duplicated.
import { isOperatorName, referenceName } from './notation.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const readJson = async path => JSON.parse(await readFile(resolve(dist, `.${path}`), 'utf8'));
const checked = result => {
  if (result.errors?.length) throw new Error(result.errors.join('\n'));
  return result;
};

export async function indexHaybarnFunctions(index) {
  const manifest = await readJson('/products/haybarn/functions/api/v1/releases.json');
  let functionCount = 0;
  const snapshots = [];
  for (const snapshot of manifest.snapshots) {
    const catalog = await readJson(snapshot.index);
    for (const entry of catalog.functions) {
      const fn = await readJson(entry.links.json);
      const content = new Set([isOperatorName(fn.name) ? 'operator operands' : null, fn.name, fn.name.replaceAll('_', ' '), fn.description, fn.category, ...fn.kinds, ...fn.aliasOf]);
      for (const { catalog: row, callingConvention } of fn.overloads) {
        for (const value of [row.description, row.comment, row.return_type, row.varargs, row.macro_definition,
          ...row.parameters, ...row.parameter_types, ...row.examples, ...row.categories]) content.add(value);
        if (row.varargs) content.add('variadic varargs variable arguments');
        if (callingConvention?.named?.length) content.add('named arguments ' + callingConvention.named.map(arg => `${arg.name} := ${arg.type}`).join('\n'));
      }
      for (const recipe of fn.editorial.recipes) {
        content.add(recipe.title); content.add(recipe.description); content.add(recipe.sql);
      }
      for (const example of fn.runnableExamples ?? []) content.add(example.sql);
      for (const documentation of fn.additionalDocumentation ?? []) content.add(documentation.title);
      for (const translation of fn.translations ?? []) {
        for (const value of [translation.scope, translation.source.engine, translation.source.dialect,
          translation.source.name, translation.source.sql, translation.target.sql]) content.add(value);
      }
      checked(await index.addCustomRecord({
        url: snapshot.id === manifest.defaultSnapshot ? fn.links.html.replace(`/releases/${snapshot.id}/`, '/') : fn.links.html, language: 'en',
        content: [...content].filter(value => typeof value === 'string' && value.length).join('\n').replaceAll('`', ''),
        meta: { title: referenceName(fn.name), name: fn.name, kind: 'Function', release: snapshot.label },
        filters: { scope: ['haybarn'], kind: ['Function'], snapshot: [snapshot.id] },
      }));
      functionCount++;
    }
    snapshots.push({ id: snapshot.id, functionCount: catalog.functions.length });
  }
  await writeFile(resolve(dist, 'products/haybarn/functions/search-manifest.json'), JSON.stringify({
    defaultSnapshot: manifest.defaultSnapshot, functionCount, snapshots,
  }, null, 2) + '\n');
  console.log(`[search] Added ${functionCount} Haybarn function references.`);
}
