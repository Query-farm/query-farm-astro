// Display formatting for example queries: compact, the way a person writes SQL. Short
// one-liners stay as written; longer ones break before each top-level clause (FROM,
// WHERE, GROUP BY, ORDER BY, LIMIT, JOIN…) and between FROM items, and a select list
// wraps only when its line is too long. Text inside quotes and parentheses is never
// touched. The catalog data keeps the original SQL.
//
// (sql-formatter put every column on its own line, so a three-column query became a
// fourteen-line panel and pushed its result off the screen.)
const MAX_LINE = 76;
const CLAUSES = [
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
  'INNER JOIN', 'CROSS JOIN', 'POSITIONAL JOIN', 'ASOF JOIN', 'JOIN',
  'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'QUALIFY', 'WINDOW', 'ORDER BY', 'LIMIT', 'OFFSET',
  'UNION ALL', 'UNION', 'EXCEPT', 'INTERSECT',
];
const cache = new Map<string, string>();

/** Top-level positions (outside quotes and parentheses) of a regex's matches. */
function topLevel(src: string): boolean[] {
  const top: boolean[] = new Array(src.length).fill(false);
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) top[i] = true;
  }
  return top;
}

/** Split at top-level commas, keeping the commas. */
function splitTopCommas(s: string): string[] {
  const top = topLevel(s);
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ',' && top[i]) {
      parts.push(s.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts.filter(Boolean);
}

/** Wrap a comma list into lines no longer than MAX_LINE, continuation lines indented. */
function wrapList(head: string, body: string, indent: string): string {
  const items = splitTopCommas(body);
  const lines: string[] = [];
  let line = head;
  for (const item of items) {
    const next = `${line} ${item}`;
    if (line !== head && next.length > MAX_LINE) {
      lines.push(line);
      line = `${indent}${item}`;
    } else line = next;
  }
  lines.push(line);
  return lines.join('\n');
}

export function formatExampleSql(sql: string): string {
  const src = sql.trim().replace(/\s+/g, (m) => (m.includes('\n') ? m : ' '));
  if (cache.has(src)) return cache.get(src)!;
  let out = src;
  if (!src.includes('\n') && src.length > MAX_LINE) {
    try {
      // 1. Break before each top-level clause keyword.
      const top = topLevel(src);
      const re = new RegExp(`\\s(${CLAUSES.map(c => c.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');
      const breaks: number[] = [];
      for (const m of src.matchAll(re)) {
        // `x IS [NOT] DISTINCT FROM y` is a comparison, not a FROM clause.
        if (/^from$/i.test(m[1]) && /\bdistinct\s*$/i.test(src.slice(0, m.index!))) continue;
        if (top[m.index!] && top[m.index! + 1]) breaks.push(m.index!);
      }
      const pieces: string[] = [];
      let start = 0;
      for (const b of breaks) {
        pieces.push(src.slice(start, b).trim());
        start = b + 1;
      }
      pieces.push(src.slice(start).trim());
      // 2. Long SELECT lists wrap; FROM lists put each item on its own line.
      out = pieces
        .map(p => {
          const sel = p.match(/^(SELECT(?:\s+DISTINCT)?)\s+([\s\S]*)$/i);
          if (sel && p.length > MAX_LINE) return wrapList(sel[1], sel[2], '  ');
          const from = p.match(/^(FROM)\s+([\s\S]*)$/i);
          if (from) {
            const items = splitTopCommas(from[2]);
            if (items.length > 1) return `${from[1]} ${items.join('\n     ')}`;
          }
          return p;
        })
        .join('\n');
    } catch {
      out = src; // anything unexpected: show it as written
    }
  }
  cache.set(src, out);
  return out;
}
