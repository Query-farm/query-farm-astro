/** Stable, human-readable anchors for named extension objects.
 *
 * Keep underscores because DuckDB identifiers commonly use them and authored
 * documentation naturally links to `#function_name`. Spaces and punctuation
 * become hyphens. Signature-specific IDs remain untouched elsewhere.
 */
export function extensionNameAnchor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Previous setting-anchor format, retained as an alias for old deep links. */
export function legacyExtensionAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
