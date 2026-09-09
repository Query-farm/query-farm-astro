import translations from '../data/translations.json';

const byFunction = new Map<string, typeof translations>();
for (const translation of translations) {
  const entries = byFunction.get(translation.function) ?? [];
  entries.push(translation);
  byFunction.set(translation.function, entries);
}

export function translationsFor(name: string) {
  return byFunction.get(name) ?? [];
}

export function usesSameFunction(translation: typeof translations[number]) {
  // Matching names alone is insufficient: argument order or casts may change.
  return translation.relation === 'direct'
    && translation.source.name.toLowerCase() === translation.function.toLowerCase()
    && translation.source.sql.trim() === translation.target.sql.trim();
}

export function translationSearchTerms(name: string) {
  return [...new Set(translationsFor(name).filter(translation => translation.relation === 'direct').flatMap(translation => [translation.source.engine, translation.source.dialect, ...translation.source.names]))];
}
