import directory from '../../quick-reference/directory.json';

// The PDF build produces this directory. A Node-only prebuild check verifies
// all public entries, source fingerprints and PDF assets before Astro renders.
const quickReferences = new Map(directory.map(entry => [entry.slug, {
  href: `/quick-reference/${entry.slug}.pdf`,
  pages: entry.pages,
}]));

export function getExtensionQuickReference(slug: string) {
  return quickReferences.get(slug);
}
