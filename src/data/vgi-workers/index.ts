// Orchard worker directory data: the harvested catalog file, validated, with
// facets, install recipes and search documents derived at build time.
//
// The generated file is optional on disk (import.meta.glob), so a checkout
// without a harvest still builds and lists nothing rather than failing.

import { catalogFileSchema, type WorkerRecord, type WorkerFunction, type WorkerTable } from './schema';
import { categories, categoriesFor, searchAliases, tintClasses } from './taxonomy.mjs';

// Falls back to a two-worker fixture so the pages render before a harvest exists.
const files = import.meta.glob(['./catalog.generated.json', './catalog.fixture.json'], { eager: true, import: 'default' });
const raw = files['./catalog.generated.json'] ?? files['./catalog.fixture.json'] ?? { generated_at: '', workers: [] };
const parsed = catalogFileSchema.parse(raw);

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

export interface Worker extends WorkerRecord {
  name: string;
  displayTitle: string;
  blurb: string;
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
    network: boolean;
    indexed: boolean;
  };
}

const PLATFORM_LABEL: Record<Platform, string> = {
  osx_arm64: 'macOS (Apple silicon)',
  linux_amd64: 'Linux x86-64',
  linux_arm64: 'Linux ARM64',
  windows_amd64: 'Windows x86-64',
  wasm: 'WebAssembly',
};
export const platformLabel = (p: string) => PLATFORM_LABEL[p as Platform] ?? p;

export const LANGUAGE_ICON: Record<string, string> = {
  Rust: 'simple-icons:rust',
  Python: 'simple-icons:python',
  Go: 'simple-icons:go',
  TypeScript: 'simple-icons:typescript',
  TS: 'simple-icons:typescript',
  Java: 'simple-icons:openjdk',
};

const anchorFor = (schema: string, name: string) =>
  `obj-${schema}-${name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

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

function quote(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}

const imageTag = (w: WorkerRecord) => (w.release?.tag ? w.release.tag.replace(/^v/, '') : 'latest');

/** `github-auto://` picks the release asset for the host platform by name. */
const githubAuto = (w: WorkerRecord) => w.run?.github_auto ?? `github-auto://Query-farm/${w.repo}@${w.release?.tag ?? 'latest'}`;
/** Python workers aren't on PyPI; uvx installs them straight from the release tag. */
const uvxLocation = (w: WorkerRecord) =>
  w.run?.uvx ?? `uvx --from git+${w.repo_url}@${w.release?.tag ?? 'main'} ${w.run?.script ?? `${w.repo}-worker`}`;

function attachSql(w: WorkerRecord, location: string, comment?: string) {
  const required = w.attach_options.filter(o => o.required);
  const opts = [`TYPE vgi`, `LOCATION ${quote(location)}`, ...required.map(o => `${o.name.toUpperCase()} '…'`)];
  const first = w.example_queries[0]?.sql?.trim();
  return [
    'INSTALL vgi FROM community;',
    'LOAD vgi;',
    '',
    ...(comment ? [`-- ${comment}`] : []),
    `ATTACH ${quote(w.catalog)} AS ${w.catalog} (`,
    opts.map(o => `  ${o}`).join(',\n'),
    ');',
    ...(first ? ['', first.endsWith(';') ? first : `${first};`] : []),
  ].join('\n');
}

// Install recipes, best first. The vgi extension's transports do the fetching:
// `github-auto://` downloads, SHA-256-checks and caches the platform binary,
// `docker://` runs the signed image, and a uvx command builds a Python worker
// from its tag. Manual download stays as the fallback.
function installMethods(w: WorkerRecord): InstallMethod[] {
  const out: InstallMethod[] = [];
  const assets = w.release?.assets ?? [];
  const tarballs = assets.filter(a => /_(amd64|arm64)$/.test(a.platform) && a.name.endsWith('.tar.gz'));
  const jar = assets.find(a => a.platform === 'jar');
  const runsOnDockerOnly = w.run?.method === 'docker';

  if (tarballs.length && !runsOnDockerOnly)
    out.push({
      id: 'github',
      label: 'From GitHub',
      icon: 'simple-icons:github',
      steps: [
        {
          title: 'Attach the release directly',
          description: `The vgi extension downloads the ${w.release?.tag} build for your platform (${tarballs.map(a => platformLabel(a.platform)).join(', ')}), checks its SHA-256 and caches it.`,
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

  if (jar)
    out.push({
      id: 'jar',
      label: 'Java',
      icon: 'simple-icons:openjdk',
      steps: [
        { title: 'Download the jar', description: 'Needs Java 21 or newer.', lang: 'bash', code: `curl -LO ${jar.url}` },
        { title: 'Attach it', lang: 'sql', code: attachSql(w, `java -jar ${jar.name}`) },
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
          code: attachSql(w, `docker://${w.image}:${imageTag(w)}`),
        },
      ],
    });

  if (tarballs.length) {
    const unix = tarballs.filter(a => !a.platform.startsWith('windows'));
    const cmd = w.run?.command?.trim() ?? `./${w.repo}-worker`;
    const loc = cmd.startsWith('./') || cmd.startsWith('/') ? cmd : `./${cmd}`;
    out.push({
      id: 'manual',
      label: 'Manual download',
      icon: 'ph:download-simple',
      steps: [
        {
          title: 'Download, verify and unpack',
          description: 'Each asset has a SHA-256 checksum and a Sigstore cosign bundle next to it on the release page.',
          lang: 'bash',
          code: unix
            .map(a => [`# ${platformLabel(a.platform)}`, `curl -LO ${a.url}`, `curl -LO ${a.url.replace(/\.tar\.gz$/, '.sha256')}`, `shasum -a 256 -c ${a.name.replace(/\.tar\.gz$/, '.sha256')} && tar xzf ${a.name}`].join('\n'))
            .join('\n\n'),
        },
        { title: 'Attach it', lang: 'sql', code: attachSql(w, loc) },
      ],
    });
  }
  return out;
}

function enrich(w: WorkerRecord): Worker {
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
  const text = [w.summary, w.tagline, w.doc_md, ...w.keywords].join(' ').toLowerCase();
  const needsCredentials =
    w.attach_options.some(o => /token|key|secret|password|credential|tenant|client/i.test(o.name)) ||
    /api key|credential|service account|tenant|entra/.test(text);
  const network = needsCredentials || /\b(api|http|live|online|fetch|rest|feed|scrape)\b/.test(text);
  const platforms = Array.from(
    new Set((w.release?.assets ?? []).map(a => a.platform).filter(p => p in PLATFORM_LABEL)),
  ) as Platform[];
  const methods = installMethods(w);
  const preferred = methods[0];

  return {
    ...w,
    name: w.repo,
    displayTitle: w.title || w.tagline || w.repo,
    blurb: w.tagline || w.summary || '',
    categoryIds: cats.map(c => c.id),
    primaryCategory: primary,
    tint: tintClasses[(primary?.tint ?? 'slate') as keyof typeof tintClasses],
    platforms,
    installMethods: methods,
    attachSql: preferred?.steps.at(-1)?.code ?? attachSql(w, uvxLocation(w)),
    objects,
    totals: { tables, functions, tableFunctions, macros },
    facets: { surfaces, needsCredentials, network, indexed: w.harvest?.status === 'ok' },
  };
}

export const workers: Worker[] = parsed.workers.map(enrich).sort((a, b) => a.slug.localeCompare(b.slug));

// Build-time contract: every listed worker is classified.
const unclassified = workers.filter(w => w.categoryIds.length === 0).map(w => w.slug);
if (unclassified.length) {
  throw new Error(`Orchard taxonomy: unclassified workers ${unclassified.join(', ')} — add them to src/data/vgi-workers/taxonomy.mjs`);
}

export { categories };
export const categoryById = (id: string) => categories.find(c => c.id === id);
export const getWorker = (slug: string) => workers.find(w => w.slug === slug);
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
      title: w.repo,
      text: [w.displayTitle, w.blurb, w.summary].filter(Boolean).join(' — '),
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
        title: o.name,
        text: o.comment,
        keywords: o.signature,
        fields: o.fields,
        anchor: o.anchor,
        category: w.categoryIds.join(' '),
        language: w.language,
      });
    }
  }
  return docs;
}

export const tintFor = (t: string) => tintClasses[(t in tintClasses ? t : 'slate') as keyof typeof tintClasses];
