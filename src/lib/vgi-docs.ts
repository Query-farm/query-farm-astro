/**
 * The VGI docs shell's language table — one row per SDK section.
 *
 * Four things consume this and they must agree, so it lives in one place:
 *   - src/starlightRouteData.ts   scopes the sidebar to the current section
 *   - components/starlight/Sidebar.astro    renders the language switcher
 *   - components/starlight/DocsSubNav.astro renders the breadcrumb + GitHub link
 *   - content/docs/vgi/docs/index.mdx       the docs landing page
 *
 * `group` MUST match the top-level sidebar group label in astro.config.mjs —
 * that string is how the middleware finds this section's subtree.
 */
export interface DocsSection {
  /** URL segment under /vgi/docs/. */
  slug: string;
  /** Display name. */
  name: string;
  /** Top-level sidebar group label in astro.config.mjs. */
  group: string;
  /** Iconify name, resolved by astro-icon (@iconify-json/simple-icons, /mdi). */
  icon: string;
  /** Source repository. */
  repo: string;
  /** One-line pitch for the docs landing page. */
  blurb: string;
}

/** Product-page metadata for one shipped worker SDK. Keep language facts here, not per page. */
export interface LanguageDocsSection extends DocsSection {
  status: string;
  /** Trusted, repository-authored HTML used by /vgi/languages for inline code/figures. */
  descriptionHtml: string;
  install: string;
  rpcDocs: string;
  local: string;
  http: boolean;
  fit: string;
}

export const DOCS_ROOT = '/vgi/docs/';

/** The language-neutral Concepts section. Not an SDK — it has no switcher chip. */
export const CONCEPTS = {
  slug: 'concepts',
  name: 'Concepts',
  group: 'Concepts',
  icon: 'ph:compass-bold',
  repo: 'https://github.com/Query-farm/vgi',
  blurb: 'The protocol, the worker model, and the five function shapes — whichever SDK you use.',
} satisfies DocsSection;

/** Shipped SDKs in display order. Keep alphabetized by name; all language menus consume this array. */
export const LANGUAGES: LanguageDocsSection[] = [
  {
    slug: 'csharp',
    name: 'C#',
    group: 'C#',
    icon: 'simple-icons:csharp',
    repo: 'https://github.com/Query-farm/vgi-csharp',
    blurb: '.NET 10 workers on Apache Arrow with all five function shapes and full catalog support.',
    status: 'Worker feature parity',
    descriptionHtml: 'Build VGI workers for <span class="qf-figure">.NET 10</span> with <code>QueryFarm.Vgi</code>. All five function shapes, catalogs, optimizer integration, settings, secrets, COPY formats, caching, and a cross-language RPC client.',
    install: 'dotnet add package QueryFarm.Vgi --version 0.3.0',
    rpcDocs: 'https://vgi-rpc-csharp.query.farm',
    local: 'Pipes, subprocess, Unix socket',
    http: false,
    fit: '.NET services and libraries. Strong Arrow types, one publishable executable, and direct access to the C# ecosystem.',
  },
  {
    slug: 'go',
    name: 'Go',
    group: 'Go',
    icon: 'simple-icons:go',
    repo: 'https://github.com/Query-farm/vgi-go',
    blurb: 'Single-binary workers on arrow-go, with struct-tag argument declarations.',
    status: 'Feature parity',
    descriptionHtml: 'Build single-binary VGI workers in Go on Apache Arrow. Includes HTTP serving, OpenTelemetry, dispatch hooks, external storage, and checksummed payloads.',
    install: 'go get github.com/Query-farm/vgi-go/vgi',
    rpcDocs: 'https://vgi-rpc-go.query.farm',
    local: 'Pipes, subprocess, Unix socket',
    http: true,
    fit: 'One static binary to ship and a mature HTTP server. Easy to hand someone a release artifact they just run.',
  },
  {
    slug: 'java',
    name: 'Java',
    group: 'Java',
    // openjdk, not `mdi:language-java` — the site's existing language rows
    // (pages/vgi/index.astro, pages/vgi/languages.astro) use the simple-icons
    // brand marks, and Java's there is openjdk.
    icon: 'simple-icons:openjdk',
    repo: 'https://github.com/Query-farm/vgi-java',
    blurb: 'JDK 25 workers on Arrow Java, wired up through Gradle.',
    status: 'Feature parity',
    descriptionHtml: 'Build VGI workers on JDK <span class="qf-figure">25+</span> with <code>farm.query:vgi</code>. Annotation-driven functions, catalogs, HTTP, and a shared-memory side channel.',
    install: '# Gradle (Kotlin DSL), JDK 25+:\nimplementation("farm.query:vgi:0.27.0")',
    rpcDocs: 'https://vgi-rpc-java.query.farm',
    local: 'Pipes, subprocess, Unix socket, shared memory',
    http: true,
    fit: 'JVM shops. Annotation-driven functions that reach the drivers and internal libraries you already run.',
  },
  {
    slug: 'python',
    name: 'Python',
    group: 'Python',
    icon: 'simple-icons:python',
    repo: 'https://github.com/Query-farm/vgi-python',
    blurb: 'PyArrow-native workers, type-annotated functions, the reference implementation.',
    status: 'Reference implementation',
    descriptionHtml: 'Build VGI workers in Python — the reference implementation, with strict typing, every transport, streaming, introspection, shared memory, and OpenTelemetry. The <code>vgi</code> package is the worker framework; <code>vgi-rpc</code> is its transport layer.',
    install: 'pip install vgi-python\n# or: uv add vgi-python',
    rpcDocs: 'https://vgi-rpc-python.query.farm',
    local: 'Pipes, subprocess, Unix socket, shared memory',
    http: true,
    fit: 'The reference SDK, and the shortest path if your logic is already Python — ML, pandas, or the scientific stack.',
  },
  {
    slug: 'rust',
    name: 'Rust',
    group: 'Rust',
    icon: 'simple-icons:rust',
    repo: 'https://github.com/Query-farm/vgi-rust',
    blurb: 'Zero-overhead workers on arrow-rs, across three composable crates.',
    status: 'Feature parity',
    descriptionHtml: 'Build VGI workers in Rust with tight memory control and wire-level compatibility. Optional HTTP, JWT, OAuth-PKCE, mTLS, OpenTelemetry, and Sentry features.',
    install: 'cargo add vgi',
    rpcDocs: 'https://vgi-rpc-rust.query.farm',
    local: 'Pipes, subprocess, Unix socket',
    http: true,
    fit: 'Throughput and tight memory control, tracking the Python reference byte-for-byte on the wire.',
  },
  {
    slug: 'typescript',
    name: 'TypeScript',
    group: 'TypeScript',
    icon: 'simple-icons:typescript',
    repo: 'https://github.com/Query-farm/vgi-typescript',
    blurb: 'Node, Bun and Deno workers with fully typed function configs.',
    status: 'Feature parity',
    descriptionHtml: 'Build fully typed VGI workers for Bun, Node.js, and Deno. Includes HTTP server/client, OpenTelemetry, dispatch hooks, external storage, and checksummed payloads.',
    install: 'npm install @query-farm/vgi\n# or: bun add @query-farm/vgi',
    rpcDocs: 'https://vgi-rpc-typescript.query.farm',
    local: 'Pipes, subprocess, Unix socket',
    http: true,
    fit: 'Bun, Node, and Deno — and the natural pick for edge and serverless runtimes that only speak HTTP.',
  },
];

/** The docs root itself, used when a page belongs to no section. */
export const SHARED_REPO = 'https://github.com/Query-farm/vgi';

/**
 * Which section a pathname belongs to. Matches both `/vgi/docs/go/…` and the
 * bare `/vgi/docs/go` form Astro's trailing-slash config may produce.
 */
export function sectionFor(pathname: string): DocsSection | null {
  for (const s of [...LANGUAGES, CONCEPTS]) {
    const root = `${DOCS_ROOT}${s.slug}/`;
    if (pathname === root || pathname === root.slice(0, -1) || pathname.startsWith(root)) return s;
  }
  return null;
}

/** `/vgi/docs/go/` — the section's index page. */
export function rootOf(section: DocsSection): string {
  return `${DOCS_ROOT}${section.slug}/`;
}

/**
 * Spell a small count for running prose ("all five SDKs"), falling back to
 * digits past the range we care about.
 *
 * Exists because two pages spelled SDK counts out by hand and both went stale
 * at once: /vgi/architecture said "All six SDKs" (it had counted the tabs in
 * its own comparison, one of which is native C and not an SDK at all) and
 * /vgi/building-a-worker's page description said "six language SDKs" against
 * five entries. Callers now count their own data and pass it here, so the
 * sentence tracks the list.
 */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}
