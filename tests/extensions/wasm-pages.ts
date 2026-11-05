import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

function* elements(node: Node): Generator<Element> {
  if ('tagName' in node) yield node;
  if ('childNodes' in node) for (const child of node.childNodes) yield* elements(child);
}

const attribute = (node: Element, name: string) => node.attrs.find(attr => attr.name === name)?.value;
function text(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return 'childNodes' in node ? node.childNodes.map(text).join('') : '';
}

function sqlText(pre: Element): string {
  const code = [...elements(pre)].find(node => node.tagName === 'code');
  if (!code) return text(pre).trim();
  const lines = code.childNodes.filter((node): node is Element => 'tagName' in node
    && (attribute(node, 'class') ?? '').split(/\s+/).includes('ec-line'));
  return (lines.length ? lines.map(text).join('\n') : text(code)).trim();
}

export interface WasmPage {
  path: string;
  extension: string;
  source: string;
  selector: string;
  sql: string[];
}

// Discover the published promise, not just the artifacts that happen to exist.
// This includes article/product demos as well as extension reference pages.
// Reading Astro's rendered island props also avoids duplicating its visibility
// rules (hidden extensions, draft posts, and compatibility metadata).
export function wasmPages(): WasmPage[] {
  const dist = resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'dist');
  const pages: WasmPage[] = [];
  for (const file of readdirSync(dist, { recursive: true }) as string[]) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(resolve(dist, file), 'utf8');
    if (!html.includes('ExampleShellMounter.')) continue;
    const nodes = [...elements(parse(html))];
    for (const island of nodes.filter(node => node.tagName === 'astro-island'
      && attribute(node, 'component-url')?.includes('ExampleShellMounter.'))) {
      // Astro serializes primitive props as [type, value].
      const props = JSON.parse(attribute(island, 'props') ?? '{}');
      const extension = props.extensionName?.[1];
      const source = props.installSource?.[1];
      if (typeof extension !== 'string' || typeof source !== 'string') {
        throw new Error(`Cannot identify the WASM runner on ${file}; update coverage discovery.`);
      }
      pages.push({
        path: `/${file.replace(/index\.html$/, '')}`,
        extension: extension.toLowerCase(),
        source,
        selector: props.codeBlockSelector?.[1] ?? 'pre[data-language="sql"]',
        // Used only to locate the supplemental result-oracle smoke queries.
        // Exhaustive coverage selects target.selector in the hydrated browser.
        sql: nodes.filter(node => node.tagName === 'pre' && attribute(node, 'data-language') === 'sql').map(sqlText),
      });
    }
  }
  if (!pages.length) throw new Error('No WASM runners found in dist. Run npm run build before browser tests.');
  return pages;
}
