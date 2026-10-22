export interface SearchExtension {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  categoryId?: string;
  icon: string;
  usageCount?: number;
  usagePeriod?: string;
}

export interface SearchDocument {
  url: string;
  excerpt: string;
  meta: Record<string, string>;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function nameMatch(extension: SearchExtension, query: string): number {
  const names = [normalize(extension.id), normalize(extension.name)];
  if (names.includes(query)) return 3;
  // Avoid filling the result list with loosely related one-letter matches.
  if (query.length < 2) return 0;
  if (names.some(name => name.startsWith(query))) return 2;
  const words = names.join(' ').split(' ');
  return query.split(' ').every(term => words.some(word => word.startsWith(term))) ? 1 : 0;
}

export function matchingExtensions(extensions: SearchExtension[], query: string): SearchExtension[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  // Name relevance always wins; observed usage only breaks equally good matches.
  return extensions.map(extension => ({ extension, rank: nameMatch(extension, normalized) }))
    .filter(match => match.rank > 0)
    .sort((a, b) => b.rank - a.rank || (b.extension.usageCount ?? 0) - (a.extension.usageCount ?? 0)
      || a.extension.name.localeCompare(b.extension.name))
    .map(match => match.extension);
}

export function popularExtensions(extensions: SearchExtension[]): SearchExtension[] {
  return extensions.filter(extension => (extension.usageCount ?? 0) > 0)
    .sort((a, b) => b.usageCount! - a.usageCount! || a.name.localeCompare(b.name))
    .slice(0, 6);
}

export function extensionDocument(extension: SearchExtension): SearchDocument {
  return { url: extension.url, excerpt: '', meta: { title: extension.name, kind: 'Extension' } };
}

export function resultKey(url: string): string {
  // Pagefind and Astro may disagree about trailing slashes. Keep anchors so
  // different functions on the same reference page remain separate results.
  const parsed = new URL(url, 'https://query.farm');
  return parsed.pathname.replace(/\/$/, '') + parsed.search + parsed.hash;
}

export function mergeSearchResults(named: SearchExtension[], documents: SearchDocument[], limit = 8): SearchDocument[] {
  const seen = new Set<string>();
  return [...named.map(extensionDocument), ...documents].filter(document => {
    const key = resultKey(document.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
