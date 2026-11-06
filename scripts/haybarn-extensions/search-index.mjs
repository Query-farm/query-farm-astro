import { readFile } from 'node:fs/promises';

export async function indexHaybarnExtensions(index) {
  const catalog = JSON.parse(await readFile('dist/products/haybarn/extensions/catalog.json', 'utf8'));
  // Match the built page's canonical trailing slash so HTML and custom
  // records describe the same local document.
  for (const extension of catalog.extensions) {
    const url = `${extension.href.replace(/\/+$/, '')}/`;
    const result = await index.addCustomRecord({
      url,
      content: `${extension.name} ${extension.displayName} ${extension.searchContent}`,
      language: 'en',
      filters: { kind: ['haybarn-extension'] },
      meta: { title: extension.displayName, extension_slug: extension.name, description: extension.description },
    });
    if (result.errors?.length) throw new Error(result.errors.join('\n'));
  }
  console.log(`[search] ${catalog.extensions.length} Haybarn community extensions`);
}
