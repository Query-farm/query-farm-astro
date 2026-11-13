// DuckDB type strings as the catalog reports them, parsed just enough to show
// nested types legibly: a UNION's branches and a STRUCT's fields each get their
// own row instead of one 4 KB line (vgi-scikit-learn's grid_search `estimator`
// is a UNION of a dozen STRUCTs of lists).

export type TypeNode =
  | { kind: 'simple'; raw: string }
  | { kind: 'list'; raw: string; of: TypeNode; suffix: string }
  | { kind: 'union' | 'struct'; raw: string; fields: { name: string; type: TypeNode }[] };

/** Split on commas at nesting depth 0, respecting parentheses and double quotes. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

/** `name TYPE` → [name, TYPE]; the name may be double-quoted. */
function splitField(s: string): [string, string] {
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    if (end > 0) return [s.slice(1, end), s.slice(end + 1).trim()];
  }
  const sp = s.search(/\s/);
  return sp < 0 ? [s, ''] : [s.slice(0, sp), s.slice(sp + 1).trim()];
}

export function parseType(raw: string | null | undefined): TypeNode {
  const s = (raw ?? '').trim();
  // Trailing list / array suffixes: T[] or T[3], possibly repeated.
  const list = s.match(/^(.*?)((?:\[\d*\])+)$/s);
  if (list && list[1] && balanced(list[1])) {
    return { kind: 'list', raw: s, of: parseType(list[1]), suffix: list[2] };
  }
  const m = s.match(/^(UNION|STRUCT)\s*\((.*)\)$/is);
  if (m && balanced(m[2])) {
    const fields = splitTop(m[2]).map(f => {
      const [name, type] = splitField(f);
      return { name, type: parseType(type) };
    });
    return { kind: m[1].toUpperCase() === 'UNION' ? 'union' : 'struct', raw: s, fields };
  }
  return { kind: 'simple', raw: s };
}

function balanced(s: string): boolean {
  let d = 0;
  let quoted = false;
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (d < 0) return false;
  }
  return d === 0 && !quoted;
}

const SHORT = 56;

/** True when the type reads better broken out than on one line. */
export function isComplexType(raw: string | null | undefined): boolean {
  const n = parseType(raw);
  const inner = n.kind === 'list' ? innermost(n) : n;
  if (inner.kind === 'union') return true;
  return inner.kind === 'struct' && (raw ?? '').length > SHORT;
}

function innermost(n: TypeNode): TypeNode {
  return n.kind === 'list' ? innermost(n.of) : n;
}

/** One-line label for a type: short types verbatim, long nested ones summarised. */
export function typeLabel(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!isComplexType(s) && s.length <= SHORT * 2) return s;
  const n = parseType(s);
  return label(n);
}

function label(n: TypeNode): string {
  if (n.kind === 'list') return label(n.of) + n.suffix;
  if (n.kind === 'union') return `UNION of ${n.fields.length} ${n.fields.length === 1 ? 'branch' : 'branches'}`;
  if (n.kind === 'struct') return `STRUCT of ${n.fields.length} ${n.fields.length === 1 ? 'field' : 'fields'}`;
  return n.raw.length > SHORT * 2 ? n.raw.slice(0, SHORT * 2 - 1) + '…' : n.raw;
}

// ── vgi.result_dynamic_columns_md ──────────────────────────────────────────
// Same contract as vgi-lint-check's tags._extract_column_tables: every
// `Name | Type | Description` pipe table is one result-schema variant, captioned
// by the nearest Markdown heading above it. Tolerant; never throws.

export interface ResultColumn {
  name: string;
  type: string;
  description: string;
}
export interface ResultVariant {
  caption: string | null;
  columns: ResultColumn[];
}

const pipeRow = (line: string): string[] | null => {
  const s = line.trim();
  if (!s.includes('|')) return null;
  return s.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
};
const isSep = (cells: string[]) => cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c.replace(/\s/g, '')));
const clean = (s: string) => s.trim().replace(/^`+|`+$/g, '').trim();

export function parseResultVariants(md: unknown): ResultVariant[] {
  if (typeof md !== 'string' || !md.trim()) return [];
  const lines = md.split(/\r?\n/);
  const out: ResultVariant[] = [];
  let caption: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const header = pipeRow(lines[i]);
    const sep = i + 1 < lines.length ? pipeRow(lines[i + 1]) : null;
    if (header && sep && isSep(sep)) {
      const lower = header.map(h => h.toLowerCase());
      const idx = { name: lower.indexOf('name'), type: lower.indexOf('type'), description: lower.indexOf('description') };
      if (idx.name >= 0 && idx.type >= 0 && idx.description >= 0) {
        const columns: ResultColumn[] = [];
        let j = i + 2;
        for (; j < lines.length; j++) {
          const cells = pipeRow(lines[j]);
          if (!cells) break;
          columns.push({
            name: clean(cells[idx.name] ?? ''),
            type: clean(cells[idx.type] ?? ''),
            description: (cells[idx.description] ?? '').trim(),
          });
        }
        out.push({ caption, columns });
        caption = null;
        i = j;
        continue;
      }
    }
    const t = lines[i].trim();
    if (t.startsWith('#')) caption = t.replace(/^#+/, '').trim() || null;
    i++;
  }
  return out;
}
