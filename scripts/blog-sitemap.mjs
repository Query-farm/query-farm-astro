// Use the rendered pages as the source of truth for blog dates and indexing.
// This keeps the sitemap aligned with content validation, draft previews, and
// the tag archive's noindex rule without parsing frontmatter a second time.
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'parse5';

export function blogSitemapMetadata() {
  /** @type {Map<string, { noindex: boolean, lastmod?: string }>} */
  const pages = new Map();
  /** @param {string} url */
  const pathname = url => new URL(url).pathname.replace(/\/$/, '');

  /** @type {import('astro').AstroIntegration} */
  const integration = {
    name: 'query-farm/blog-sitemap-metadata',
    hooks: {
      'astro:build:generated': async ({ dir }) => {
        pages.clear();
        const blogDir = new URL('blog/', dir);
        for (const file of await readdir(blogDir, { recursive: true })) {
          if (!file.endsWith('.html')) continue;
          const document = parse(await readFile(new URL(file, blogDir), 'utf8'));
          const html = document.childNodes.find(node => 'tagName' in node && node.tagName === 'html');
          const head = html && 'childNodes' in html
            ? html.childNodes.find(node => 'tagName' in node && node.tagName === 'head')
            : undefined;
          const metadata = new Map();
          let canonical;
          for (const node of head && 'childNodes' in head ? head.childNodes : []) {
            if (!('tagName' in node)) continue;
            const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
            if (node.tagName === 'meta') {
              metadata.set(attrs.get('name') ?? attrs.get('property'), attrs.get('content'));
            }
            if (node.tagName === 'link' && attrs.get('rel') === 'canonical') {
              canonical = attrs.get('href');
            }
          }
          if (!canonical) throw new Error(`Blog page has no canonical URL: ${file}`);
          const noindex = /\b(noindex|none)\b/i.test(metadata.get('robots') ?? '');
          // Authored update dates take precedence; never use the build clock.
          const date = metadata.get('article:modified_time') ?? metadata.get('article:published_time');
          if (!noindex && metadata.get('og:type') === 'article' && !date) {
            throw new Error(`Blog article has no publication date: ${file}`);
          }
          pages.set(pathname(canonical), {
            noindex,
            ...(date ? { lastmod: new Date(date).toISOString() } : {}),
          });
        }
      },
    },
  };

  /** @param {import('@astrojs/sitemap').SitemapItem} item */
  function serialize(item) {
    const metadata = pages.get(pathname(item.url));
    if (metadata?.noindex) return undefined;
    return metadata?.lastmod ? { ...item, lastmod: metadata.lastmod } : item;
  }

  return { integration, serialize };
}
