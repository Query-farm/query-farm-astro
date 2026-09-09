import { readFile } from 'node:fs/promises';

export async function indexHaybarnExtensions(index) {
  const catalog = JSON.parse(await readFile('dist/products/haybarn/extensions/catalog.json', 'utf8'));
  for (const extension of catalog.extensions) {
    const result = await index.addCustomRecord({
      url: extension.href,
      content: `${extension.name} ${extension.displayName} ${extension.searchContent}`,
      language: 'en',
      filters: { kind: ['haybarn-extension'] },
      meta: { title: extension.displayName, extension_slug: extension.name, description: extension.description },
    });
    if (result.errors?.length) throw new Error(result.errors.join('\n'));
  }
  console.log(`[search] ${catalog.extensions.length} Haybarn community extensions`);
}
