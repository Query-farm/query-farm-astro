import { groupFunctions, compareSnapshots, signatureKey } from '../../../scripts/haybarn-functions/catalog.mjs';
import { defaultSnapshotId } from '../data/settings';
import { signatureParts } from './arguments';
import { operatorNotation } from '../../../scripts/haybarn-functions/notation.mjs';

export interface Overload {
  schema_name: string;
  function_name: string;
  function_type: string;
  description: string | null;
  comment: string | null;
  return_type: string | null;
  parameters: string[];
  parameter_types: (string | null)[];
  varargs: string | null;
  macro_definition: string | null;
  has_side_effects: boolean | null;
  internal: boolean | null;
  examples: string[];
  stability: string | null;
  categories: string[];
  alias_of: string | null;
}
export interface Snapshot {
  runtime?: { engine: 'haybarn-wasm'; packageVersion: string; bundle: string };
  schemaVersion: number;
  id: string;
  engine: 'haybarn' | 'duckdb';
  label: string;
  engineVersion: string;
  sourceId: string;
  source: string;
  binarySha256: string;
  capturedAt: string;
  scope: string;
  requestedExtensions: string[];
  loadedExtensions: { extension_name: string; extension_version: string; installed_from: string }[];
  functions: Overload[];
}
export interface FunctionDoc {
  name: string;
  slug: string;
  overloads: Overload[];
  description: string;
  category: string;
  kinds: string[];
  aliases: string[];
}
const modules = import.meta.glob<{ default: Snapshot }>('../data/snapshots/*.json', { eager: true });
export const snapshots: Snapshot[] = Object.values(modules).map(m => m.default).sort((a, b) =>
  a.id === defaultSnapshotId ? -1 : b.id === defaultSnapshotId ? 1 :
  a.engine === b.engine ? b.engineVersion.localeCompare(a.engineVersion, undefined, { numeric: true }) : a.engine === 'haybarn' ? -1 : 1);
export const defaultSnapshot = snapshots.find(s => s.id === defaultSnapshotId)!;
if (!defaultSnapshot) throw new Error(`Missing ${defaultSnapshotId}. Run npm run refresh:haybarn to capture the installed release before building.`);

export const categories = [
  { id: 'text', name: 'Text & patterns', icon: 'Aa', short: 'Clean, split, match, and reshape strings.', intent: 'Make messy text useful', color: 'clay' },
  { id: 'numeric', name: 'Numbers & math', icon: '∑', short: 'Calculate, round, and work with numbers.', intent: 'Find the right calculation', color: 'gold' },
  { id: 'dates', name: 'Dates & time', icon: '◷', short: 'Bucket timestamps and work across time.', intent: 'Put time in perspective', color: 'slate' },
  { id: 'lists', name: 'Lists & arrays', icon: '[ ]', short: 'Transform, filter, and explore collections.', intent: 'Think beyond a single value', color: 'field' },
  { id: 'json', name: 'JSON', icon: '{ }', short: 'Turn nested documents into useful data.', intent: 'Bring structure to JSON', color: 'plum' },
  { id: 'aggregate', name: 'Aggregates', icon: '▥', short: 'Summarize rows and discover patterns.', intent: 'See the bigger picture', color: 'gold' },
  { id: 'nested', name: 'Maps & structs', icon: '⊞', short: 'Build and unpack structured values.', intent: 'Give your data some shape', color: 'field' },
  { id: 'files', name: 'Files & tables', icon: '▤', short: 'Read files and generate rows.', intent: 'Start with the data', color: 'slate' },
  { id: 'system', name: 'Database & utility', icon: '⌘', short: 'Inspect, configure, and understand the engine.', intent: 'Look under the hood', color: 'clay' },
  { id: 'operators', name: 'Operators', icon: '±', short: 'The small symbols behind expressions.', intent: 'Know your operators', color: 'plum' },
] as const;

export function categoryFor(name: string, rows: Overload[]): string {
  const tags = rows.flatMap(r => r.categories);
  if (!/^[a-z_]/i.test(name)) return 'operators';
  if (/json/i.test(name) || tags.includes('json')) return 'json';
  if (/^(list_|array_)/.test(name) || tags.some(t => ['list', 'array', 'lambda'].includes(t))) return 'lists';
  if (/^(map|struct|union)_/.test(name) || tags.some(t => ['map', 'struct', 'union'].includes(t))) return 'nested';
  if (rows.some(r => r.function_type === 'aggregate')) return 'aggregate';
  if (/^(read_|parquet_|glob$|range$|generate_series$|unnest$|sniff_csv)/.test(name)) return 'files';
  // These comparisons span strings, numbers and dates. A date tag is not
  // a primary category; older catalogs omit their category tags entirely.
  if (/^(greatest|least)$/.test(name)) return 'system';
  if (tags.some(t => ['date', 'timestamp', 'interval', 'time'].includes(t)) ||
    /date|time|epoch|^str[fp]time|day|month|year|week|^age$|^quarter$|^hour$|^minute$|^second$/.test(name)) return 'dates';
  if (tags.some(t => ['string', 'text', 'regex'].includes(t)) ||
    /^(regexp|str|text|char|unicode|ascii|concat|contains|starts_|ends_|left$|right$|length|lower$|upper$|lpad|rpad|trim|ltrim|rtrim|replace|split|substr|format|printf|md5|sha|encode|decode|base64|hex$|unhex|nfc_|levenshtein|jaccard|jaro|hamming|translate|repeat|reverse)/.test(name)) return 'text';
  if (tags.some(t => ['numeric', 'math', 'random', 'trigonometric'].includes(t)) ||
    /^(abs$|acos|asin|atan|cos|sin|tan|ceil|floor|round|trunc|sqrt|cbrt|pow|exp|log|ln$|pi$|factorial|gcd|lcm|sign|isfinite|isinf|isnan|random|setseed|even|greatest_common_divisor|least_common_multiple|bit_|fmod|mod$|multiply|divide|add$|subtract|degrees|radians)/.test(name)) return 'numeric';
  return 'system';
}

const catalogCache = new Map<string, FunctionDoc[]>();
export function getFunctions(snapshot: Snapshot): FunctionDoc[] {
  if (catalogCache.has(snapshot.id)) return catalogCache.get(snapshot.id)!;
  const grouped = groupFunctions(snapshot.functions) as { name: string; slug: string; overloads: Overload[] }[];
  const docs = grouped.map(f => ({ ...f,
    description: f.overloads.find(r => r.description)?.description ?? '',
    category: categoryFor(f.name, f.overloads),
    kinds: [...new Set(f.overloads.map(r => r.function_type))],
    aliases: [...new Set(f.overloads.map(r => r.alias_of).filter((s): s is string => Boolean(s)))],
  }));
  catalogCache.set(snapshot.id, docs);
  return docs;
}
export function getFunction(snapshot: Snapshot, name: string) { return getFunctions(snapshot).find(f => f.name === name); }
export function functionUrl(snapshot: Snapshot, fn: { slug: string }, pinned = false) { return snapshot.id === defaultSnapshotId && !pinned ? `/products/haybarn/functions/${fn.slug}/` : `/products/haybarn/functions/releases/${snapshot.id}/${fn.slug}/`; }
export function catalogUrl(snapshot = defaultSnapshot) { return snapshot.id === defaultSnapshotId ? `/products/haybarn/functions/catalog/` : `/products/haybarn/functions/releases/${snapshot.id}/`; }
export function categoryUrl(id: string, snapshot = defaultSnapshot) { return `${catalogUrl(snapshot)}?category=${id}`; }
export function categoryInfo(id: string) { return categories.find(c => c.id === id)!; }
export function formatSignature(row: Overload, snapshot?: Snapshot): string {
  const args = signatureParts(row, snapshot);
  const notation = operatorNotation(row, true);
  return `${notation?.expression ?? `${row.function_name}(${args.join(', ')})`} → ${row.return_type ?? (row.function_type.includes('table') ? 'TABLE' : 'not specified')}`;
}
export { compareSnapshots, signatureKey };
