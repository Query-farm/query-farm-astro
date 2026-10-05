import { DOCS_ROOT, rootOf, sectionFor } from './vgi-docs';

// Real navigation destinations only: URL segments such as /company, /legal,
// /blog/tags, and /functions/releases are not landing pages.
const destinations = [
  { name: 'Products', href: '/products' },
  { name: 'DuckDB Extensions', href: '/products/extensions' },
  { name: 'Haybarn', href: '/products/haybarn' },
  { name: 'Functions', href: '/products/haybarn/functions/' },
  { name: 'Extensions', href: '/products/haybarn/extensions' },
  { name: 'Compatibility status', href: '/products/haybarn/status' },
  { name: 'Orchard', href: '/products/orchard' },
  { name: 'Blog', href: '/blog' },
  { name: 'VGI', href: '/vgi' },
  { name: 'VGI Docs', href: DOCS_ROOT },
];

const pathKey = (path: string) => path.replace(/\/+$/, '') || '/';

/** Supply breadcrumbs for pages that do not already declare their own trail. */
export function breadcrumbData(canonicalURL: URL, title: string) {
  const path = pathKey(canonicalURL.pathname);
  if (path === '/' || path === '/404' || path === '/404.html') return undefined;

  const parents = destinations.filter(({ href }) => path.startsWith(`${pathKey(href)}/`));
  const section = sectionFor(canonicalURL.pathname);
  if (section && path !== pathKey(rootOf(section))) {
    parents.push({ name: section.name, href: rootOf(section) });
  }

  const crumbs = [
    { name: 'Home', href: '/' },
    ...parents,
    { name: title, href: canonicalURL.href },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(({ name, href }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: new URL(href, canonicalURL).href,
    })),
  };
}

function hasBreadcrumbs(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasBreadcrumbs);
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.includes('BreadcrumbList') || Object.values(node).some(hasBreadcrumbs);
}

/** Preserve page-specific schemas and trails, including schemas in @graph. */
export function withBreadcrumbs(jsonLd: unknown, canonicalURL: URL, title: string, noindex = false) {
  if (noindex || hasBreadcrumbs(jsonLd)) return jsonLd;
  const breadcrumb = breadcrumbData(canonicalURL, title);
  if (!breadcrumb) return jsonLd;
  if (!jsonLd) return breadcrumb;
  return [...(Array.isArray(jsonLd) ? jsonLd : [jsonLd]), breadcrumb];
}

/** JSON-LD is embedded as script text; prevent content from closing the tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
