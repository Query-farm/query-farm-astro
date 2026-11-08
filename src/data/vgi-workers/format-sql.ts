import { format } from 'sql-formatter';

// Display formatting for example queries. Short one-liners stay as written; longer ones
// are laid out over several lines. The catalog data keeps the original SQL.
const MAX_LINE = 72;
// sql-formatter puts a space before the parenthesis of calls it doesn't know (table
// functions in FROM, worker functions). Close it up unless the word is a keyword.
const KEYWORDS_BEFORE_PAREN = new Set([
  'in', 'as', 'values', 'and', 'or', 'not', 'on', 'over', 'filter', 'using', 'exists', 'from',
  'join', 'select', 'where', 'when', 'then', 'else', 'with', 'by', 'any', 'all', 'is', 'lateral',
]);
const cache = new Map<string, string>();

export function formatExampleSql(sql: string): string {
  const src = sql.trim();
  if (cache.has(src)) return cache.get(src)!;
  let out = src;
  const tooLong = src.split('\n').some(l => l.length > MAX_LINE);
  if (tooLong && !src.includes('\n')) {
    try {
      out = format(src, { language: 'duckdb', tabWidth: 2, expressionWidth: 60, keywordCase: 'preserve' })
        .replace(/([A-Za-z_][\w$]*) \(/g, (m, word: string) => (KEYWORDS_BEFORE_PAREN.has(word.toLowerCase()) ? m : `${word}(`));
    } catch {
      out = src; // syntax the formatter doesn't know yet: show it as written
    }
  }
  cache.set(src, out);
  return out;
}
