// Orchard worker directory data: the harvested catalog file, validated, with
// facets, install recipes and search documents derived at build time.
//
// The generated file is optional on disk (import.meta.glob), so a checkout
// without a harvest still builds and lists nothing rather than failing.

import { catalogFileSchema, type WorkerRecord, type WorkerFunction, type WorkerTable, type WorkerSchema } from './schema';
import { categories, categoriesFor, families, familyFor, groups, searchAliases, tintClasses } from './taxonomy.mjs';
import { workerIcons } from './icons.mjs';
import { formatExampleSql } from './format-sql';
import showcaseFile from './showcase.json';
import descriptionOverrides from './descriptions.json';
// The repo list the harvest works from; read here only to check every worker it includes has a category.
import inventoryToml from '../../../scripts/vgi-workers/inventory.toml?raw';

// Falls back to a two-worker fixture so the pages render before a harvest exists.
const files = import.meta.glob(['./catalog.generated.json', './catalog.fixture.json'], { eager: true, import: 'default' });
const raw = files['./catalog.generated.json'] ?? files['./catalog.fixture.json'] ?? { generated_at: '', workers: [] };
const parsed = catalogFileSchema.parse(raw);

// Captured sample results (scripts/vgi-workers/capture-results.py), keyed by repo then
// normalised SQL. Optional: a page without one just shows the query.
const resultFiles = import.meta.glob('./results.generated.json', { eager: true, import: 'default' });
type RawResult = { columns: string[]; types: string[]; rows: unknown[][]; more: boolean };
const rawResults = (resultFiles['./results.generated.json'] ?? { workers: {} }) as {
  workers: Record<string, { captured_at: string; results: Record<string, RawResult> }>;
};
export type SampleResult = RawResult & { capturedAt: string };

// COPY ... FROM / COPY ... TO formats each worker registers (scripts/vgi-workers/copy-formats.py,
// read from vgi_copy_formats()), keyed by repo. The fleet dump doesn't record them.
const copyFiles = import.meta.glob('./copy-formats.generated.json', { eager: true, import: 'default' });
type RawCopyFormat = {
  name: string;
  direction: 'from' | 'to' | 'both';
  ordered: boolean;
  description: string;
  comment: string;
  tags: Record<string, string>;
  handler: string;
  options: { name: string; type: string; description: string }[];
};
const rawCopy = (copyFiles['./copy-formats.generated.json'] ?? { workers: {} }) as {
  workers: Record<string, { catalog?: string; formats?: RawCopyFormat[]; error?: string }>;
};
export interface CopyFormat {
  /** As advertised by the worker, e.g. `pmtiles`. */
  name: string;
  /** What to type in FORMAT: scoped by the ATTACH alias the page uses (the catalog name). */
  format: string;
  reads: boolean;
  writes: boolean;
  title: string;
  summary: string;
  docMd: string;
  options: { name: string; type: string; description: string }[];
  examples: { description: string; sql: string }[];
  anchor: string;
}

function copyFormatsFor(repo: string, catalog: string): CopyFormat[] {
  return (rawCopy.workers[repo]?.formats ?? []).map(f => {
    let examples: { description: string; sql: string }[] = [];
    try {
      const ex = JSON.parse(f.tags['vgi.example_queries'] ?? '[]');
      if (Array.isArray(ex)) examples = ex.filter(e => e && typeof e.sql === 'string').map(e => ({ description: String(e.description ?? ''), sql: e.sql }));
    } catch { /* malformed tag: show the generated skeleton instead */ }
    return {
      name: f.name,
      format: `${catalog}.${f.name}`,
      reads: f.direction === 'from' || f.direction === 'both',
      writes: f.direction === 'to' || f.direction === 'both',
      title: f.tags['vgi.title'] ?? '',
      summary: f.comment || f.description,
      docMd: f.tags['vgi.doc_md'] ?? '',
      options: f.options,
      examples,
      anchor: `copy-${f.name}`,
    };
  });
}
// Hand-picked "what you get" queries (showcase.json), keyed by slug.
const SHOWCASE = showcaseFile as unknown as Record<string, { title: string; sql: string } | string>;

export const generatedAt = parsed.generated_at;

export type Category = (typeof categories)[number];
export type Platform = 'osx_arm64' | 'linux_amd64' | 'linux_arm64' | 'windows_amd64' | 'wasm';

export interface InstallStep {
  title: string;
  description?: string;
  code: string;
  lang: string;
}
export interface InstallMethod {
  id: string;
  label: string;
  icon: string;
  steps: InstallStep[];
}

export interface CatalogObject {
  worker: string;
  schema: string;
  name: string;
  kind: 'table' | 'view' | WorkerFunction['kind'];
  comment: string;
  anchor: string;
  /** Short signature: `name(a VARCHAR, b INT) → DOUBLE` or column list. */
  signature: string;
  /** Searchable column / argument names and descriptions. */
  fields: string;
}

export interface CredentialParam {
  name: string;
  type: string | null;
  required: boolean;
  redact: boolean;
  description: string | null;
}

/** One secret type the worker declares, ready to render as a credentials block. */
export interface Credential {
  type: string;
  description: string | null;
  docUrl: string | null;
  params: CredentialParam[];
  /** Functions declaring a requirement on this type, linked into the catalog explorer. */
  neededBy: { name: string; anchor: string | null }[];
  /** A ready-to-fill CREATE SECRET; redacted keys read from the environment. */
  createSql: string;
}

export interface Worker extends WorkerRecord {
  name: string;
  displayTitle: string;
  /** Card/hero icon: icons.mjs, else the primary category's icon. */
  icon: string;
  blurb: string;
  /** Upstream libraries named in the GitHub description, e.g. librosa. */
  builtOn: string[];
  categoryIds: string[];
  primaryCategory: Category | undefined;
  tint: { tile: string; ink: string };
  platforms: Platform[];
  installMethods: InstallMethod[];
  attachSql: string;
  objects: CatalogObject[];
  totals: { tables: number; functions: number; tableFunctions: number; macros: number };
  facets: {
    surfaces: string[];
    needsCredentials: boolean;
    secretTypes: string[];
    indexed: boolean;
  };
  /** Full secret-type declarations; empty when the worker needs none or none were harvested. */
  credentials: Credential[];
  /** Custom COPY formats (readers and writers) the worker registers on ATTACH. */
  copyFormats: CopyFormat[];
}

const PLATFORM_LABEL: Record<Platform, string> = {
  osx_arm64: 'macOS (Apple silicon)',
  linux_amd64: 'Linux x86-64',
  linux_arm64: 'Linux ARM64',
  windows_amd64: 'Windows x86-64',
  wasm: 'WebAssembly',
};
export const platformLabel = (p: string) => PLATFORM_LABEL[p as Platform] ?? p;

/** The site's standard platform marks (same as the Haybarn install picker and extension pages). */
const PLATFORM_ICON: Record<Platform, string> = {
  osx_arm64: 'simple-icons:apple',
  linux_amd64: 'simple-icons:linux',
  linux_arm64: 'simple-icons:linux',
  windows_amd64: 'simple-icons:windows',
  wasm: 'simple-icons:webassembly',
};
export const platformIcon = (p: string) => PLATFORM_ICON[p as Platform] ?? 'ph:cpu';
const PLATFORM_ORDER: string[] = ['linux_amd64', 'linux_arm64', 'osx_arm64', 'windows_amd64'];
export const platformOrder = (a: string, b: string) =>
  (PLATFORM_ORDER.indexOf(a) + 1 || 99) - (PLATFORM_ORDER.indexOf(b) + 1 || 99);

export const LANGUAGE_ICON: Record<string, string> = {
  Rust: 'simple-icons:rust',
  Python: 'simple-icons:python',
  Go: 'simple-icons:go',
  TypeScript: 'simple-icons:typescript',
  TS: 'simple-icons:typescript',
  Java: 'simple-icons:openjdk',
};

// Readable worker names: "Trading calendar", not "vgi-trading-calendar" (the repo keeps that).
// Sentence case; acronyms and product names as their owners write them.
const NAME_OVERRIDES: Record<string, string> = {
  asn1: 'ASN.1', bgp: 'BGP', bson: 'BSON', cbor: 'CBOR', cve: 'CVE', disasm: 'Disassembler',
  evtx: 'Windows event logs (EVTX)', fhir: 'FHIR', fixedformat: 'Fixed-width files', hl7: 'HL7', ical: 'iCalendar',
  ioc: 'Indicators of compromise', iso20022: 'ISO 20022', libpostal: 'libpostal', llm: 'LLM', mft: 'NTFS MFT',
  netflow: 'NetFlow', nlp: 'NLP', odata: 'OData', ortools: 'OR-Tools', pdf: 'PDF', pe: 'PE executables',
  pii: 'PII detection', poi: 'Excel (Apache POI)', pprof: 'pprof', proj: 'PROJ', reghive: 'Registry hives',
  saml: 'SAML', secretscan: 'Secret scanning', sourcemap: 'Source maps', statsmodels: 'statsmodels',
  sympy: 'SymPy', threatintel: 'Threat intel', tiktoken: 'tiktoken', tlsfp: 'TLS fingerprints',
  useragent: 'User agents', x12: 'X12 EDI', x509: 'X.509', xslt: 'XSLT', yara: 'YARA', yfinance: 'Yahoo Finance',
  'azure-loganalytics': 'Azure Log Analytics', 'azure-resourcegraph': 'Azure Resource Graph',
  'etf-first-trust': 'First Trust ETFs', 'etf-globalx': 'Global X ETFs', 'etf-invesco': 'Invesco ETFs',
  'etf-ishares': 'iShares ETFs', 'etf-jpmorgan': 'J.P. Morgan ETFs', 'etf-schwab': 'Schwab ETFs',
  'etf-spdr': 'SPDR ETFs', 'etf-vanguard': 'Vanguard ETFs', 'etf-wisdomtree': 'WisdomTree ETFs',
  github: 'GitHub', mlb: 'MLB',
  // Azure: Microsoft's product names are title case ("Log Analytics"), so the family is too.
  'azure-cost': 'Azure Cost', 'azure-defender': 'Azure Defender', 'azure-directory': 'Azure Directory',
  'azure-files': 'Azure Files', 'azure-governance': 'Azure Governance', 'azure-risk': 'Azure Risk',
  'azure-signins': 'Azure Sign-ins',
  arcgis: 'ArcGIS', hackernews: 'Hacker News', 'open-meteo': 'Open-Meteo', typesafe: 'TypeSafe',
  'scikit-bio': 'scikit-bio', 'scikit-learn': 'scikit-learn',
  nba: 'NBA', nfl: 'NFL', nhl: 'NHL', ufc: 'UFC', nascar: 'NASCAR', f1: 'Formula 1',
  'ncaa-basketball': 'NCAA basketball', 'ncaa-football': 'NCAA football', 'us-soccer': 'US soccer',
  // Workers in inventory.toml not yet listed (private or unreleased), named ahead of time.
  mvt: 'Vector tiles (MVT)', cdc: 'Postgres CDC', graphql: 'GraphQL', grpc: 'gRPC',
  ldap: 'LDAP', scim: 'SCIM', soap: 'SOAP', opa: 'OPA', fsm: 'State machines', kinesis: 'Kinesis',
};
export function workerName(slug: string): string {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  const words = slug.split('-');
  if (words[0] === 'azure') return ['Azure', ...words.slice(1)].join(' ');
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const anchorFor = (schema: string, name: string) =>
  `obj-${schema}-${name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

/** Environment variable a redacted secret key is read from in the CREATE SECRET template. */
function envVarFor(type: string, param: string): string {
  const p = param.toLowerCase();
  // `anthropic_api_key` already names its service; `api_key` / `key` borrow the type's.
  if (/_(api_key|token|key)$/.test(p) && p !== 'api_key') return p.toUpperCase();
  return `${type}_${p}`.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
}

function createSecretSql(type: string, params: CredentialParam[]): string {
  if (!params.length) return `CREATE SECRET ${type} (TYPE ${type});`;
  const width = Math.max(...params.map(p => p.name.length));
  const lines = params.map((p, i) => {
    const value = p.redact ? `getenv('${envVarFor(type, p.name)}')` : `'<${p.name}>'`;
    const sep = i < params.length - 1 ? ',' : '';
    const notes = [p.required ? 'required' : '', p.redact ? 'secret' : ''].filter(Boolean).join(', ');
    return `    ${p.name.padEnd(width)} ${value}${sep}${notes ? `  -- ${notes}` : ''}`;
  });
  return `CREATE SECRET ${type} (\n    TYPE ${type},\n${lines.join('\n')}\n);`;
}

function credentialsFor(w: WorkerRecord): Credential[] {
  const fnAnchors = new Map<string, string>();
  for (const s of w.schemas) {
    for (const name of groupOverloads(s.functions).keys()) fnAnchors.set(`${s.name}.${name}`.toLowerCase(), anchorFor(s.name, name));
  }
  return (w.secret_type_details ?? []).map(st => {
    const params: CredentialParam[] = st.parameters.map(p => ({
      name: p.name,
      type: p.type ?? null,
      required: Boolean(p.required),
      redact: Boolean(p.redact),
      description: p.description ?? null,
    }));
    return {
      type: st.name,
      description: st.description ?? null,
      docUrl: st.doc_url ?? null,
      params,
      neededBy: st.required_by.map(q => ({ name: q.split('.').pop() ?? q, anchor: fnAnchors.get(q.toLowerCase()) ?? null })),
      createSql: createSecretSql(st.name, params),
    };
  });
}

const fnSignature = (f: WorkerFunction) => {
  const args = f.arguments
    .map(a => [a.name, a.type].filter(Boolean).join(' '))
    .join(', ');
  return `${f.name}(${args})${f.return_type ? ` → ${f.return_type}` : ''}`;
};
const tableSignature = (t: WorkerTable) =>
  `${t.name}(${t.columns.slice(0, 6).map(c => c.name).join(', ')}${t.columns.length > 6 ? ', …' : ''})`;

/** Group a schema's functions by name, preserving first-seen order. */
export function groupOverloads(fns: WorkerFunction[]): Map<string, WorkerFunction[]> {
  const m = new Map<string, WorkerFunction[]>();
  for (const f of fns) (m.get(f.name) ?? m.set(f.name, []).get(f.name)!).push(f);
  return m;
}

// ── Examples ────────────────────────────────────────────────────────────────
export interface ObjectExample {
  description: string | null;
  sql: string;
}
export const normSql = (q: string) => q.trim().replace(/;\s*$/, '').replace(/\s+/g, ' ').toLowerCase();
const tagExamples = (v: unknown): ObjectExample[] =>
  Array.isArray(v)
    ? v.flatMap(e =>
        e && typeof e === 'object' && typeof (e as { sql?: unknown }).sql === 'string'
          ? [{ description: ((e as { description?: string }).description ?? null) || null, sql: (e as { sql: string }).sql }]
          : [],
      )
    : [];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `sql` calls function `name` (bare or qualified): `name(`. */
const callsFn = (sql: string, name: string) => new RegExp(`(^|[^\\w])"?${esc(name)}"?\\s*\\(`, 'i').test(sql);
/** `sql` reads table `name`: `FROM|JOIN [cat.][schema.]name`. */
const readsTable = (sql: string, name: string) =>
  new RegExp(`\\b(from|join)\\s+(("?\\w+"?)\\.){0,2}"?${esc(name)}"?(?![\\w(])`, 'i').test(sql);
const mentions = (sql: string, name: string) => callsFn(sql, name) || readsTable(sql, name);

/**
 * The examples an object (table, function overload group or schema) declares, deduped.
 * `vgi.example_queries` is the author's list for this object. `vgi.executable_examples` is
 * often inherited from the catalog, so for a table or function it only counts when the SQL
 * actually uses the object.
 */
export function objectExamples(
  objs: { name?: string; tags?: Record<string, unknown> | null; examples?: string[] }[],
  opts: { requireMention?: boolean } = {},
): ObjectExample[] {
  const seen = new Set<string>();
  const out: ObjectExample[] = [];
  const add = (e: ObjectExample) => {
    const k = normSql(e.sql);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ ...e, sql: e.sql.trim().replace(/;?\s*$/, ';') });
  };
  for (const o of objs) {
    const tags = o.tags ?? {};
    for (const e of tagExamples(tags['vgi.example_queries'])) add(e);
    for (const sql of o.examples ?? []) add({ description: null, sql });
    for (const e of tagExamples(tags['vgi.executable_examples'])) {
      if (opts.requireMention === false || (o.name && mentions(e.sql, o.name))) add(e);
    }
  }
  return out;
}

/**
 * The agent test tasks a person would actually ask: `vgi.agent_test_tasks` are written to
 * test an AI agent, so many carry fixture data (hex/BLOB literals, JSON, XML, test-file
 * paths) or output rules. Keep short, literal-free ones, drop the "Using the attached
 * 'x' worker," preamble, and cap the list.
 */
const FIXTURE = [
  /\n/,
  /from_hex|\bBLOB\b|\\x[0-9a-f]{2}/i,
  /'[0-9a-f]{16,}'/i, // hex literal
  /[A-Za-z0-9+/]{32,}={0,2}/, // base64 run
  /[{[]\s*"/, // JSON
  /<[a-z][\w:-]*[\s>/]/i, // XML/HTML markup
  /\btest\/|\/data\/|\.(?:exe|dll|so|bin|pcap|evtx|dat)\b/i, // fixture files
  /'[^']{48,}'/, // long quoted payload
  /\bcolumn(?:s)? named\b|\breturn (?:one|a single|the count as) (?:column|value)/i, // grading instructions
];
export function readableQuestions(tasks: string[], max = 6): string[] {
  const out: string[] = [];
  for (const raw of tasks) {
    let q = raw.trim().replace(/^Using (?:only )?the attached (?:'[^']+'|\S+) worker,\s*/i, '');
    q = q.charAt(0).toUpperCase() + q.slice(1);
    if (q.length > 160 || FIXTURE.some(re => re.test(q))) continue;
    if (!out.includes(q)) out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

/** Normalised SQL of every example the Catalog explorer shows (schema blocks, tables, function groups). */
export function catalogViewSql(w: { schemas: WorkerSchema[] }): Set<string> {
  const out = new Set<string>();
  const add = (xs: ObjectExample[]) => xs.forEach(e => out.add(normSql(e.sql)));
  for (const s of w.schemas) {
    add(objectExamples([s], { requireMention: false }));
    for (const t of s.tables) add(objectExamples([t]));
    for (const group of groupOverloads(s.functions).values()) add(objectExamples(group));
  }
  return out;
}

/** Catalog objects an example query uses, as {name, anchor} for linking into the explorer. */
export function exampleObjects(w: { schemas: WorkerSchema[] }, sql: string): { name: string; anchor: string }[] {
  const out: { name: string; anchor: string }[] = [];
  for (const s of w.schemas) {
    for (const t of s.tables) if (readsTable(sql, t.name)) out.push({ name: t.name, anchor: anchorFor(s.name, t.name) });
    for (const name of groupOverloads(s.functions).keys()) if (callsFn(sql, name)) out.push({ name, anchor: anchorFor(s.name, name) });
  }
  // In order of first use in the query.
  const at = (n: string) => sql.toLowerCase().search(new RegExp(`[^\\w]"?${esc(n.toLowerCase())}"?([^\\w]|$)`));
  return out.sort((a, b) => at(a.name) - at(b.name)).slice(0, 5);
}

function quote(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}

const imageTag = (w: WorkerRecord) => (w.release?.tag ? w.release.tag.replace(/^v/, '') : 'latest');

/**
 * `github-auto://` picks the release asset for the host platform by name. With no `@tag` the
 * extension resolves the repo's latest release at ATTACH time (vgi e9115c4) and pins that tag
 * for the session, so the published snippet never goes stale. The harvest-verified tag stays
 * as the pin hint.
 */
const githubAuto = (w: WorkerRecord) => {
  const loc = w.run?.github_auto ?? `github-auto://Query-farm/${w.repo}`;
  return loc.replace(/@v?\d+\.\d+\.\d+[^/'\s]*/, '');
};
/** Python workers aren't on PyPI; uvx installs them straight from the release tag. */
const uvxLocation = (w: WorkerRecord) =>
  w.run?.uvx ?? `uvx --from git+${w.repo_url}@${w.release?.tag ?? 'main'} ${w.run?.script ?? `${w.repo}-worker`}`;

/**
 * Installing the vgi extension differs by engine. Stock DuckDB 2.0 needs the Query Farm
 * repository registered (and `LOAD … FROM query_farm`: DuckDB keeps repository installs
 * separately). Haybarn ships vgi in its community channel.
 */
export const VGI_SETUP = {
  duckdb: [
    "SET allow_extension_repositories = 'allowed';",
    '',
    'CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm',
    "    WITH PREFIX 'https://duckdb-extensions.query.farm';",
    '',
    'INSTALL vgi FROM query_farm;',
    'LOAD vgi FROM query_farm;',
  ].join('\n'),
  haybarn: ['INSTALL vgi FROM community;', 'LOAD vgi;'].join('\n'),
} as const;

/** The ATTACH (plus first example query). The extension setup is shown separately, per engine. */
function attachSql(w: WorkerRecord, location: string, comment?: string) {
  const required = w.attach_options.filter(o => o.required);
  const opts = [`TYPE vgi`, `LOCATION ${quote(location)}`, ...required.map(o => `${o.name.toUpperCase()} '…'`)];
  const starter = starterQuery(w)?.trim();
  const first = starter && (starter.length > 80 ? formatExampleSql(starter) : starter);
  return [
    ...(comment ? [`-- ${comment}`] : []),
    `ATTACH ${quote(w.catalog)} AS ${w.catalog} (`,
    opts.map(o => `  ${o}`).join(',\n'),
    ');',
    ...(first ? ['', first.endsWith(';') ? first : `${first};`] : []),
  ].join('\n');
}

// Install recipes, best first. The vgi extension's transports do the fetching:
// `github-auto://` downloads, SHA-256-checks and caches the platform binary,
// `oci://` runs the signed image, and a uvx command builds a Python worker
// from its tag. Java workers ship only a jar (no per-platform archive), which
// `github-auto://` can't launch, so their pages lead with the image instead.
function installMethods(w: WorkerRecord): InstallMethod[] {
  const out: InstallMethod[] = [];
  const assets = w.release?.assets ?? [];
  const tarballs = assets.filter(a => /_(amd64|arm64)$/.test(a.platform) && a.name.endsWith('.tar.gz'));
  const runsOnDockerOnly = w.run?.method === 'docker';

  // A worker verified against an HTTP(S) endpoint (e.g. a hosted Cloudflare Worker):
  // nothing to install, so it leads.
  const hosted = w.verification?.location;
  if (hosted && /^https?:\/\//.test(hosted))
    out.push({
      id: 'hosted',
      label: 'Hosted',
      icon: 'ph:cloud',
      steps: [
        {
          title: 'Attach the hosted endpoint',
          description: 'Nothing to install: the vgi extension talks to the worker over HTTPS.',
          lang: 'sql',
          code: attachSql(w, hosted),
        },
      ],
    });

  if (tarballs.length && !runsOnDockerOnly)
    out.push({
      id: 'github',
      label: 'From GitHub',
      icon: 'simple-icons:github',
      steps: [
        {
          title: 'Attach the release directly',
          description: `The vgi extension finds the latest release (currently ${w.release?.tag}), downloads the build for your platform (${tarballs.map(a => platformLabel(a.platform)).join(', ')}), checks its SHA-256 and caches it. To pin a version, add the tag: ${githubAuto(w)}@${w.release?.tag}`,
          lang: 'sql',
          code: attachSql(w, githubAuto(w)),
        },
      ],
    });

  if (w.language === 'Python' && !runsOnDockerOnly)
    out.push({
      id: 'uvx',
      label: 'uvx',
      icon: 'simple-icons:python',
      steps: [
        {
          title: 'Attach with uvx',
          description: 'Needs uv. uvx builds the worker from its release tag on first attach and reuses the cached environment after that.',
          lang: 'sql',
          code: attachSql(w, uvxLocation(w)),
        },
      ],
    });

  if (w.image)
    out.push({
      id: 'docker',
      label: 'Docker',
      icon: 'simple-icons:docker',
      steps: [
        {
          title: 'Attach the signed image',
          description: 'Needs Docker, Podman or another OCI runtime. The extension runs the container and talks to it over stdio.',
          lang: 'sql',
          code: attachSql(w, `oci://${w.image}:${imageTag(w)}`),
        },
      ],
    });

  return out;
}

const LANG_TOKEN = /^(python|rust|go|golang|typescript|ts|java|bun)$/i;

/** GitHub descriptions often end "(Python)" or "(Python, librosa)": the language
 *  repeats the badge, so drop it and keep any library as `builtOn`. */
function splitTagline(t: string): { text: string; builtOn: string[] } {
  let text = t.trim().replace(/\s*A VGI worker\.?$/i, '');
  const m = text.match(/\s*\(([^()]*)\)\s*\.?$/);
  if (!m) return { text, builtOn: [] };
  const parts = m[1].split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.some(p => LANG_TOKEN.test(p))) return { text, builtOn: [] };
  return { text: text.slice(0, m.index).trim(), builtOn: parts.filter(p => !LANG_TOKEN.test(p)) };
}
/** Every worker here is for DuckDB, so a trailing "for/in DuckDB" says nothing. */
// Stripping it (or the language suffix) can leave a dangling separator: "… schedules — for DuckDB".
const trimDuckdb = (t: string) =>
  t.replace(/\s+(for|in|into)\s+DuckDB\.?$/i, '').replace(/[\s—–:;,-]+$/, '');

/** Card descriptions read as one consistent voice: drop "in DuckDB with SQL" and other
 *  VGI/DuckDB boilerplate (every connector here is both), trailing repo names and
 *  periods; descriptions.json overrides the ones rules can't fix. */
const DESCRIPTIONS = descriptionOverrides as unknown as Record<string, string>;
function cleanBlurb(slug: string, text: string): string {
  if (typeof DESCRIPTIONS[slug] === 'string') return DESCRIPTIONS[slug];
  let s = text.trim();
  // ETF family: "<Issuer> US ETF data (catalog + holdings) as DuckDB tables over VGI…"
  const etf = s.match(/^(.*?)\s+US ETF data\s*\(/);
  if (etf) return `${etf[1]} US ETFs — fund lineup and holdings`;
  s = s
    .replace(/\\\$/g, '$')
    .replace(/^(?:a\s+)?(?:read-only\s+)?VGI worker:?\s*(?:exposing\s+)?/i, '')
    .replace(/\s*[—–-]?\s*an?\s+read-only VGI worker(?: by Query\.Farm)?\.?/i, '')
    .replace(/\s*\(VGI worker\)/i, '')
    .replace(/\s+(?:in|for|to)\s+(?:DuckDB(?:\/SQL)?|Haybarn)(?:\s+with)?\s+SQL\b/gi, '')
    .replace(/\s+for DuckDB\/SQL\b/gi, '')
    .replace(/\s+as (?:ordinary |queryable )?DuckDB (?:tables|table functions)(?: over VGI)?/gi, '')
    .replace(/\s*[—–-]\s*vgi-[a-z0-9-]+\.?$/i, '')
    .replace(/\.\s*$/, '')
    .replace(/[\s—–:;,-]+$/, '');
  return s.charAt(0).toUpperCase() === s.charAt(0) || /^(?:i[A-Z]|scikit|e[A-Z])/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function enrich(w: WorkerRecord): Worker {
  const tag = splitTagline(w.tagline ?? '');
  const cats = categoriesFor(w.slug);
  const primary = cats[0];
  const objects: CatalogObject[] = [];
  let tables = 0, functions = 0, tableFunctions = 0, macros = 0;
  for (const s of w.schemas) {
    for (const t of s.tables) {
      tables++;
      objects.push({ worker: w.slug, schema: s.name, name: t.name, kind: t.kind, comment: t.comment ?? '', anchor: anchorFor(s.name, t.name), signature: tableSignature(t), fields: t.columns.map(c => `${c.name} ${c.comment ?? ''}`).join(' ') });
    }
    // Overloads share a name: one object (and one anchor) per name.
    for (const [name, group] of groupOverloads(s.functions)) {
      const f = group[0];
      if (f.kind === 'macro' || f.kind === 'table_macro') macros++;
      else if (f.kind === 'table' || f.kind === 'table_in_out') tableFunctions++;
      else functions++;
      objects.push({
        worker: w.slug,
        schema: s.name,
        name,
        kind: f.kind,
        comment: group.find(g => g.comment)?.comment ?? '',
        anchor: anchorFor(s.name, name),
        signature: group.map(fnSignature).join(' | '),
        fields: group.flatMap(g => g.arguments.map(a => `${a.name ?? ''} ${a.description ?? ''}`)).join(' '),
      });
    }
  }
  const surfaces = [
    tables && 'tables',
    tableFunctions && 'table functions',
    functions && 'scalar functions',
    macros && 'macros',
  ].filter(Boolean) as string[];
  const copyFormats = copyFormatsFor(w.repo, w.catalog);
  if (copyFormats.length) surfaces.push('copy formats');
  // Declared, not guessed: a secret type or a required/secret ATTACH option.
  const secretTypes = w.secret_types ?? [];
  const needsCredentials = secretTypes.length > 0 || w.attach_options.some(o => o.required || (o as { secret?: boolean }).secret);
  const platforms = Array.from(
    new Set((w.release?.assets ?? []).map(a => a.platform).filter(p => p in PLATFORM_LABEL)),
  ) as Platform[];
  const methods = installMethods(w);
  const preferred = methods[0];

  return {
    ...w,
    name: workerName(w.slug),
    displayTitle: w.title || w.tagline || w.repo,
    blurb: cleanBlurb(w.slug, trimDuckdb(tag.text) || w.summary || ''),
    builtOn: tag.builtOn,
    categoryIds: cats.map(c => c.id),
    primaryCategory: primary,
    icon: (workerIcons as Record<string, string>)[w.slug] ?? primary?.icon ?? 'ph:cube',
    tint: tintClasses[(primary?.tint ?? 'slate') as keyof typeof tintClasses],
    platforms,
    installMethods: methods,
    attachSql: preferred?.steps.at(-1)?.code ?? attachSql(w, uvxLocation(w)),
    objects,
    totals: { tables, functions, tableFunctions, macros },
    facets: { surfaces, needsCredentials, secretTypes: secretTypes.map(t => t.name), indexed: w.harvest?.status === 'ok' },
    credentials: credentialsFor(w),
    copyFormats,
  };
}

const all = parsed.workers.map(enrich).sort((a, b) => a.slug.localeCompare(b.slug));

/** Listing rule: a worker is listed only once it has been verified — attached the
 *  way its page tells users to, with every executable example passing. Records
 *  from before `vgi-lint dump` fall back to "the harvest attached it". */
const isListed = (w: Worker) => (w.verification ? w.verification.verified : w.harvest?.status === 'ok');
export const workers: Worker[] = all.filter(isListed);
/** Known but not listed (failed verification or not attachable) — for reports, not pages. */
export const unlistedWorkers = all.filter(w => !isListed(w)).map(w => ({ repo: w.repo, reason: w.verification?.status ?? w.harvest?.error ?? w.harvest?.status ?? 'unknown' }));

// Build-time contract: every listed worker is classified.
const unclassified = workers.filter(w => w.categoryIds.length === 0).map(w => w.slug);
if (unclassified.length) {
  throw new Error(`Orchard taxonomy: unclassified workers ${unclassified.join(', ')} — add them to src/data/vgi-workers/taxonomy.mjs`);
}

// …and every worker inventory.toml includes (listed yet or not) already has a category,
// so adding a repo there without classifying it fails the build instead of shipping an
// unclassified card after the next harvest.
/** Every worker inventory.toml includes: built, whether or not it's listed yet. */
const inventorySlugs = [
  ...(inventoryToml.split(/^\[exclude\]/m)[0].split(/^\[include\]/m)[1] ?? '').matchAll(/^vgi-([\w.-]+)\s*=/gm),
].map(m => m[1]);
/** "Workers built" figure for marketing copy (/vgi), so it tracks the inventory instead of drifting. */
export const builtWorkerCount = inventorySlugs.length;
{
  const missing = inventorySlugs.filter(s => categoriesFor(s).length === 0);
  if (missing.length) {
    throw new Error(`Orchard taxonomy: inventory.toml includes workers with no category: ${missing.join(', ')} — add them to src/data/vgi-workers/taxonomy.mjs`);
  }
}

export { categories, groups, families, familyFor };
export const categoryById = (id: string) => categories.find(c => c.id === id);
export const getWorker = (slug: string) => workers.find(w => w.slug === slug);
/** How well a captured result shows off a worker: a real table beats a one-cell
 *  true/false check (many catalog examples are assertions written for tests). */
export function resultScore(r: SampleResult | undefined): number {
  if (!r || r.rows.length === 0) return 0;
  const single = r.rows.length === 1 && r.columns.length === 1;
  if (single) return typeof r.rows[0][0] === 'boolean' ? 0.5 : 1;
  return 2 + Math.min(r.rows.length, 5) / 5 + Math.min(r.columns.length, 6) / 6;
}

type ExampleLike = { sql?: string | null; title?: string | null; description?: string | null };

/** The worker's "what you get" query: the hand-picked one in showcase.json if its result
 *  was captured, else the first example whose captured result is a real table (2+ rows,
 *  2+ columns). Undefined when nothing has a result to show. */
export function showcaseFor(w: { repo: string; example_queries: ExampleLike[] }): { title: string | null; sql: string; result: SampleResult } | undefined {
  const pick = SHOWCASE[w.repo.replace(/^vgi-/, '')];
  if (pick && typeof pick === 'object') {
    const result = sampleResult(w, pick.sql);
    if (result) return { title: pick.title, sql: pick.sql, result };
  }
  for (const e of w.example_queries) {
    if (!e.sql) continue;
    const result = sampleResult(w, e.sql);
    if (result && result.rows.length >= 2 && result.columns.length >= 2) return { title: e.title || e.description || null, sql: e.sql, result };
  }
  return undefined;
}

/** The query shown under the ATTACH: the showcase if there is one, else the first example. */
export function starterQuery(w: { repo: string; example_queries: ExampleLike[] }): string | undefined {
  return showcaseFor(w)?.sql ?? w.example_queries.find(e => e.sql)?.sql ?? undefined;
}

/** The captured result for one of a worker's queries, if there is one. */
export function sampleResult(w: { repo: string }, sql: string): SampleResult | undefined {
  const rw = rawResults.workers[w.repo];
  const r = rw?.results[normSql(sql)];
  return r && { ...r, capturedAt: rw.captured_at };
}
export const workersInCategory = (id: string) => workers.filter(w => w.categoryIds.includes(id));
export const languages = Array.from(new Set(workers.map(w => w.language))).sort();

export function relatedWorkers(w: Worker, n = 3): Worker[] {
  const pool = workers.filter(o => o.slug !== w.slug && o.categoryIds.some(c => w.categoryIds.includes(c)));
  const kw = new Set(w.keywords.map(k => k.toLowerCase()));
  return pool
    .map(o => ({ o, score: o.keywords.filter(k => kw.has(k.toLowerCase())).length + (o.primaryCategory?.id === w.primaryCategory?.id ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.o.slug.localeCompare(b.o.slug))
    .slice(0, n)
    .map(x => x.o);
}

/** Documents for client-side full-text search: one per worker, one per object. */
export function searchDocuments() {
  const docs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const w of workers) {
    docs.push({
      id: `w:${w.slug}`,
      type: 'worker',
      worker: w.slug,
      title: workerName(w.slug),
      text: [w.repo, w.displayTitle, w.blurb, w.summary].filter(Boolean).join(' — '),
      blurb: w.blurb,
      keywords: [...w.keywords, ...w.topics, ...w.categories, ...(searchAliases[w.slug as keyof typeof searchAliases] ?? [])].join(' '),
      category: w.categoryIds.join(' '),
      language: w.language,
    });
    for (const o of w.objects) {
      const id = `o:${w.slug}:${o.schema}.${o.name}`;
      if (seen.has(id)) continue; // a table and a function may share a name
      seen.add(id);
      docs.push({
        id,
        type: o.kind,
        worker: w.slug,
        workerName: w.name,
        title: o.name,
        text: o.comment,
        keywords: o.signature,
        fields: o.fields,
        anchor: o.anchor,
        category: w.categoryIds.join(' '),
        language: w.language,
      });
    }
    for (const st of w.settings) {
      docs.push({
        id: `s:${w.slug}:${st.name}`,
        type: 'setting',
        worker: w.slug,
        workerName: w.name,
        title: st.name,
        text: st.description ?? '',
        keywords: `SET setting ${st.type ?? ''}`,
        anchor: `setting-${st.name}`,
        category: w.categoryIds.join(' '),
        language: w.language,
      });
    }
    for (const f of w.copyFormats) {
      docs.push({
        id: `c:${w.slug}:${f.name}`,
        type: 'copy format',
        worker: w.slug,
        workerName: w.name,
        title: f.format,
        text: [f.title, f.summary].filter(Boolean).join(' — '),
        keywords: [f.reads && 'COPY FROM import read', f.writes && 'COPY TO export write', f.name].filter(Boolean).join(' '),
        fields: f.options.map(o => `${o.name} ${o.description}`).join(' '),
        anchor: f.anchor,
        category: w.categoryIds.join(' '),
        language: w.language,
      });
    }
  }
  return docs;
}

export const tintFor = (t: string) => tintClasses[(t in tintClasses ? t : 'slate') as keyof typeof tintClasses];
