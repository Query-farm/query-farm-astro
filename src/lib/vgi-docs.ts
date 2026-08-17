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

export const LANGUAGES: DocsSection[] = [
  {
    slug: 'python',
    name: 'Python',
    group: 'Python',
    icon: 'simple-icons:python',
    repo: 'https://github.com/Query-farm/vgi-python',
    blurb: 'PyArrow-native workers, type-annotated functions, the reference implementation.',
  },
  {
    slug: 'go',
    name: 'Go',
    group: 'Go',
    icon: 'simple-icons:go',
    repo: 'https://github.com/Query-farm/vgi-go',
    blurb: 'Single-binary workers on arrow-go, with struct-tag argument declarations.',
  },
  {
    slug: 'typescript',
    name: 'TypeScript',
    group: 'TypeScript',
    icon: 'simple-icons:typescript',
    repo: 'https://github.com/Query-farm/vgi-typescript',
    blurb: 'Node, Bun and Deno workers with fully typed function configs.',
  },
  {
    slug: 'rust',
    name: 'Rust',
    group: 'Rust',
    icon: 'simple-icons:rust',
    repo: 'https://github.com/Query-farm/vgi-rust',
    blurb: 'Zero-overhead workers on arrow-rs, across three composable crates.',
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
    blurb: 'JVM workers on Arrow Java, wired up through Gradle.',
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
