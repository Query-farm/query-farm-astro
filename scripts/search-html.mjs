import { parse, serialize } from 'parse5';

function* elements(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield* elements(child);
}

const attribute = (element, name) => element.attrs.find(attr => attr.name === name)?.value;

// Pagefind drops unmarked pages as soon as ANY page has data-pagefind-body.
// Company pages need a body marker; Starlight supplies that marker but needs
// our kind:page filter. Preserve the scoped Haybarn guide pages as authored.
export function prepareSearchHTML(content) {
  const document = parse(content);
  const nodes = [...elements(document)];
  // Redirects, archives, and function category pages should not compete with
  // canonical pages. Functions are added separately as opt-in custom records.
  if (nodes.some(node => node.tagName === 'meta' && (
    (attribute(node, 'name')?.toLowerCase() === 'robots' && /\bnoindex\b/i.test(attribute(node, 'content') ?? ''))
    || attribute(node, 'http-equiv')?.toLowerCase() === 'refresh'
  ))) return null;
  const body = nodes.find(node => attribute(node, 'data-pagefind-body') !== undefined);
  const target = body ?? nodes.find(node => node.tagName === 'main');
  if (!target) return null;
  const hasKind = nodes.some(node => /(^|,)\s*kind\s*(:|$)/.test(attribute(node, 'data-pagefind-filter') ?? ''));
  if (body && hasKind) return content;
  if (!body) target.attrs.push({ name: 'data-pagefind-body', value: '' });
  if (!hasKind) {
    const filter = target.attrs.find(attr => attr.name === 'data-pagefind-filter');
    if (filter) filter.value += ', kind:page';
    else target.attrs.push({ name: 'data-pagefind-filter', value: 'kind:page' });
  }
  return serialize(document);
}
