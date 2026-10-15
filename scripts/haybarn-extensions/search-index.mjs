import { readFile } from 'node:fs/promises';

export async function indexHaybarnExtensions(index) {
  const catalog = JSON.parse(await readFile('dist/products/haybarn/extensions/catalog.json', 'utf8'));
  // Pagefind merges records that share a URL. Extensions without a page of
  // their own link to their repository, and aliases (arrow, erpl_web) share
  // one, so a colliding href gets a #name fragment to keep each record.
  const seen = new Set();
  for (const extension of catalog.extensions) {
    const url = seen.has(extension.href) ? `${extension.href}#${extension.name}` : extension.href;
    seen.add(extension.href);
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
