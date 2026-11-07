import { tutorialCategoryIds, tutorialTechnologyIds } from '../data/tutorial-taxonomy';
export const PAGE_SIZE = 12;
export interface CatalogItem {
  id: string;
  title: string;
  outcome: string;
  category: string;
  technologies: string[];
  order?: number;
  keywords: string[];
}
export interface CatalogState { q: string; categories: string[]; tools: string[]; page: number }
export const defaultCatalogState: CatalogState = { q: '', categories: [], tools: [], page: 1 };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const allowedValues = (values: string[], allowed: readonly string[]) => [...new Set(values)].filter(value => allowed.includes(value));
export function parseCatalogState(params: URLSearchParams): CatalogState {
  const page = Number(params.get('page') ?? 1);
  return {
    q: (params.get('q') ?? '').trim().slice(0, 200),
    categories: allowedValues(params.getAll('category'), tutorialCategoryIds),
    tools: allowedValues(params.getAll('tool'), tutorialTechnologyIds),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function catalogQuery(state: CatalogState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  for (const category of state.categories) params.append('category', category);
  for (const tool of state.tools) params.append('tool', tool);
  if (state.page > 1) params.set('page', String(state.page));
  return params.toString();
}
function matchingTutorials(items: CatalogItem[], state: CatalogState) {
  const terms = normalize(state.q).split(/\s+/).filter(Boolean);
  return items.filter(item => {
    // Choices within a facet are alternatives; separate facets narrow together.
    if (state.categories.length && !state.categories.includes(item.category)) return false;
    if (state.tools.length && !state.tools.some(tool => item.technologies.includes(tool))) return false;
    const haystack = normalize([item.title, item.outcome, ...item.keywords, ...item.technologies].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}
/** Each option's count respects the query and the other facet. */
export function catalogFacetCounts(items: CatalogItem[], state: CatalogState) {
  const categories: Record<string, number> = {};
  const tools: Record<string, number> = {};
  for (const item of matchingTutorials(items, { ...state, categories: [] })) categories[item.category] = (categories[item.category] ?? 0) + 1;
  for (const item of matchingTutorials(items, { ...state, tools: [] })) {
    for (const tool of new Set(item.technologies)) tools[tool] = (tools[tool] ?? 0) + 1;
  }
  return { categories, tools };
}
export function selectTutorials(items: CatalogItem[], state: CatalogState) {
  const matches = matchingTutorials(items, state).sort((a, b) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title),
  );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  return { total: matches.length, pages, page, items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}
