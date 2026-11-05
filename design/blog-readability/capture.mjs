import { mkdir, writeFile } from 'node:fs/promises';
import { parse, serialize } from 'parse5';

const root = new URL('./', import.meta.url);
const source = 'https://query.farm/blog/why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0/';
const response = await fetch(source);
if (!response.ok) throw new Error(`Article: ${response.status}`);
const document = parse(await response.text());
const downloads = [];
let stylesheetIndex = 0;

function walk(node) {
  if (node.childNodes) {
    node.childNodes = node.childNodes.filter(child => child.tagName !== 'script' && child.tagName !== 'astro-island');
    for (const child of node.childNodes) walk(child);
  }
  if (!node.attrs) return;
  const get = name => node.attrs.find(attr => attr.name === name);
  node.attrs = node.attrs.filter(attr => !attr.name.startsWith('on'));
  if (node.tagName === 'link' && get('rel')?.value === 'stylesheet') {
    const href = get('href');
    const url = new URL(href.value, source);
    const path = `assets/article-${stylesheetIndex++}.css`;
    href.value = path;
    downloads.push((async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Stylesheet: ${response.status}`);
      const css = (await response.text()).replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (match, quote, value) => {
        if (/^(data:|#)/.test(value)) return match;
        return `url("${new URL(value, url).href}")`;
      });
      await writeFile(new URL(path, root), css);
    })());
  } else {
    for (const name of ['href', 'src', 'poster']) {
      const attr = get(name);
      if (attr && !/^(#|data:|mailto:|tel:)/.test(attr.value)) attr.value = new URL(attr.value, source).href;
    }
  }
  const srcset = get('srcset');
  if (srcset) srcset.value = srcset.value.replace(/(^|,\s*)(\S+)/g, (_, separator, url) => separator + new URL(url, source).href);
  if (node.tagName === 'a' && !get('href')?.value.startsWith('#')) {
    node.attrs = node.attrs.filter(attr => !['target', 'rel'].includes(attr.name));
    node.attrs.push({ name: 'target', value: '_blank' }, { name: 'rel', value: 'noopener noreferrer' });
  }
}

await mkdir(new URL('assets/', root), { recursive: true });
walk(document);
await Promise.all(downloads);
let html = serialize(document);
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="treatments.css"></head>');
await writeFile(new URL('article.html', root), html);
console.log(`Captured article and ${stylesheetIndex} stylesheets. Production scripts removed; article links open separately.`);
