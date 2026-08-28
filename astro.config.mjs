// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

// Shiki theme, retuned for the Strata Sun palette (see DESIGN_BRIEF.md).
// Ground is rock-900 (#1a1512) — the same surface every code block uses.
// The old theme sat on a dark green that no longer exists in the palette,
// and its hues lost separation against warm grounds.
const farmTheme = {
  name: 'farm-theme',
  type: 'dark',
  colors: {
    'editor.background': '#1a1512',
    'editor.foreground': '#e9e1d3',
  },
  tokenColors: [
    {
      // #6d6357 measures 3.1:1 on rock-900 — below AA and genuinely hard to
      // read. #8a7f70 is the lightest value that still reads as chrome while
      // clearing 4.5:1, and matches the REPL's dim-text slot so a static code
      // block and a live query result are the same system.
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#8a7f70', fontStyle: 'italic' }
    },
    {
      scope: ['string', 'string.quoted'],
      settings: { foreground: '#9fc48c' }
    },
    {
      scope: ['keyword', 'storage.type', 'storage.modifier'],
      settings: { foreground: '#d9a441', fontStyle: 'bold' }
    },
    {
      scope: ['entity.name.function', 'support.function'],
      settings: { foreground: '#d3a6e0' }
    },
    {
      scope: ['constant.numeric', 'constant.language'],
      settings: { foreground: '#e0a44f' }
    },
    {
      scope: ['variable', 'entity.name'],
      settings: { foreground: '#8fc7d8' }
    },
    {
      scope: ['punctuation'],
      settings: { foreground: '#a2988a' }
    },
    {
      scope: ['constant.other', 'support.type'],
      settings: { foreground: '#f0c877' }
    },
    {
      scope: ['keyword.operator'],
      settings: { foreground: '#e9e1d3' }
    }
  ]
};

// https://astro.build/config
export default defineConfig({
  site: 'https://query.farm',
  output: 'static',
  // Astro's HTML compressor drops newline-only whitespace at element
  // boundaries, which silently glues prose to inline <a>/<code>/<strong>
  // ("on theextensions page"). Gzip recovers the few KB; correct spacing in
  // hand-wrapped copy is worth more than the minification.
  compressHTML: false,
  integrations: [
    icon(),
    // Starlight bundles astro-expressive-code, which must be registered before
    // mdx() so MDX code blocks render.
    starlight({
    // One Starlight instance serves Concepts plus every SDK, so the site
      // title can't name a language — it used to say "VGI Python", which put
      // "| VGI Python" in the <title> of every Go, Rust and Java page. The
      // route middleware narrows this per section where it can.
      title: 'VGI Documentation',
      // Match the site's code styling: the retuned farm Shiki theme, instead of
      // Expressive Code's default light/dark pair. One theme, deliberately —
      // code always sits on rock-900 in BOTH docs themes (DESIGN_BRIEF §3), so
      // there is no light variant to switch to.
      expressiveCode: {
        themes: [farmTheme],
        // No window chrome, anywhere. EC frames shell languages as a terminal
        // (macOS titlebar dots) by default; code on this site is a plain slab
        // on rock-900 (DESIGN_BRIEF §3). Per-block opt-in is still possible
        // with an explicit frame="terminal"/"code" on the fence.
        defaultProps: { frame: 'none' },
        styleOverrides: {
          borderRadius: '0.5rem',
          borderColor: 'transparent',
          codeFontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
          uiFontFamily: "'Commissioner', ui-sans-serif, system-ui, sans-serif",
        },
      },
      // The site already builds a unified Pagefind index in postbuild over all
      // of dist/ (incl. these docs pages), so disable Starlight's own.
      pagefind: false,
      // Keep the site's own src/pages/404.astro (avoid a route collision).
      disable404Route: true,
      // Header  → the Query.Farm bar + docs subnav (owns --sl-nav-height's
      //           two halves; see starlight-shell.css).
      // Theme*  → Starlight's own light/dark machinery, restyled. The docs are
      //           the one section of the site with a dark theme, so the picker
      //           is live and both palettes are mapped in starlight-theme.css.
      // TOC     → default list plus per-kind icons on API entries.
      // Sidebar → the language switcher above a sidebar scoped to one SDK.
      components: {
        Header: './src/components/starlight/Header.astro',
        Sidebar: './src/components/starlight/Sidebar.astro',
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        TableOfContents: './src/components/starlight/TableOfContents.astro',
      },
      // The `sidebar` below is the full catalogue of every section; this
      // middleware narrows it to the section the reader is actually in (and
      // re-derives prev/next to match). See src/starlightRouteData.ts.
      routeMiddleware: './src/starlightRouteData.ts',
      // Order matters. global.css brings the fonts + Tailwind theme; then
      // starlight-theme.css maps the palette onto Starlight's --sl-* tokens and
      // publishes the --qf-* bridge vars that the remaining four files consume.
      customCss: [
        './src/styles/global.css',
        './src/styles/starlight-theme.css',
        './src/styles/starlight-shell.css',
        './src/styles/starlight-api.css',
        './src/styles/starlight-callout.css',
        './src/styles/starlight-kinds.css',
      ],
      sidebar: [
        // Shared, language-neutral: the protocol and the execution model. Every
        // language section links into this rather than carrying its own copy —
        // the prose is identical and three copies would drift.
        {
          label: 'Concepts',
          items: [
            { label: 'Overview', slug: 'vgi/docs/concepts' },
            { label: 'Function lifecycle', slug: 'vgi/docs/concepts/lifecycle' },
            { label: 'Argument serialization', slug: 'vgi/docs/concepts/argument-serialization' },
          ],
        },
        {
          label: 'Python',
          items: [
        { label: 'Overview', slug: 'vgi/docs/python' },
        { label: "What's new", slug: 'vgi/docs/python/release-notes' },
        {
          label: 'Tutorial',
          items: [
            { label: 'Scalar function', slug: 'vgi/docs/python/tutorial/scalar' },
            { label: 'Table function', slug: 'vgi/docs/python/tutorial/table' },
          ],
        },
        // Bridge between the tutorial and the task guides: the five shapes, pick yours.
        { label: 'Function patterns', slug: 'vgi/docs/python/how-to/function-patterns' },
        {
          label: 'How-to guides',
          items: [
            { label: 'Overview', slug: 'vgi/docs/python/how-to' },
            { label: 'Expose a catalog', slug: 'vgi/docs/python/how-to/catalogs' },
            { label: 'Publish global functions', slug: 'vgi/docs/python/how-to/global-functions' },
            { label: 'Add a custom COPY format', slug: 'vgi/docs/python/how-to/copy-formats' },
            { label: 'Persist state across workers', slug: 'vgi/docs/python/how-to/state-storage' },
            { label: 'Serve over HTTP', slug: 'vgi/docs/python/how-to/serve-http' },
            { label: 'Use VGI from a Python app', slug: 'vgi/docs/python/how-to/python-app' },
            { label: 'Authentication', slug: 'vgi/docs/python/how-to/authentication' },
            { label: 'Integrate with the optimizer', slug: 'vgi/docs/python/how-to/pushdown-and-statistics' },
            { label: 'Cache results on the client', slug: 'vgi/docs/python/how-to/result-caching' },
            { label: 'Function metadata', slug: 'vgi/docs/python/how-to/metadata' },
            { label: 'CLI', slug: 'vgi/docs/python/how-to/cli' },
          ],
        },
        {
          label: 'Reference guides',
          items: [
            // API deep-dives — pair with the how-to guides.
            { label: 'Function API', slug: 'vgi/docs/python/how-to/generator-api' },
            { label: 'Aggregate functions', slug: 'vgi/docs/python/how-to/aggregate-functions' },
            { label: 'Catalog interface', slug: 'vgi/docs/python/how-to/catalog-interface' },
            // Wire / format specs — low-level contracts for porting and debugging.
            { label: 'Shared storage', slug: 'vgi/docs/python/how-to/shared-storage' },
            { label: 'Filter pushdown', slug: 'vgi/docs/python/how-to/filter-pushdown' },
            { label: 'Column statistics', slug: 'vgi/docs/python/how-to/column-statistics' },
            { label: 'CLI reference', slug: 'vgi/docs/python/how-to/cli-reference' },
          ],
        },
        {
          label: 'API Reference',
          // Real module names, alphabetised. Keep in sync with scripts/gen-api.sh —
          // that script's module list is the source of truth for which pages exist.
          items: [
            { label: 'aggregate_function', slug: 'vgi/docs/python/api/vgi-aggregate_function' },
            { label: 'arguments', slug: 'vgi/docs/python/api/vgi-arguments' },
            { label: 'auth', slug: 'vgi/docs/python/api/vgi-auth' },
            { label: 'cache_control', slug: 'vgi/docs/python/api/vgi-cache_control' },
            { label: 'catalog', slug: 'vgi/docs/python/api/vgi-catalog' },
            { label: 'client', slug: 'vgi/docs/python/api/vgi-client' },
            { label: 'copy_from_function', slug: 'vgi/docs/python/api/vgi-copy_from_function' },
            { label: 'copy_to_function', slug: 'vgi/docs/python/api/vgi-copy_to_function' },
            { label: 'exceptions', slug: 'vgi/docs/python/api/vgi-exceptions' },
            { label: 'function_storage', slug: 'vgi/docs/python/api/vgi-function_storage' },
            { label: 'invocation', slug: 'vgi/docs/python/api/vgi-invocation' },
            { label: 'logging_config', slug: 'vgi/docs/python/api/vgi-logging_config' },
            { label: 'metadata', slug: 'vgi/docs/python/api/vgi-metadata' },
            { label: 'otel', slug: 'vgi/docs/python/api/vgi-otel' },
            { label: 'profiling', slug: 'vgi/docs/python/api/vgi-profiling' },
            { label: 'scalar_function', slug: 'vgi/docs/python/api/vgi-scalar_function' },
            { label: 'secret_protocol', slug: 'vgi/docs/python/api/vgi-secret_protocol' },
            { label: 'secret_service', slug: 'vgi/docs/python/api/vgi-secret_service' },
            { label: 'serve', slug: 'vgi/docs/python/api/vgi-serve' },
            { label: 'table_buffering_function', slug: 'vgi/docs/python/api/vgi-table_buffering_function' },
            { label: 'table_filter_pushdown', slug: 'vgi/docs/python/api/vgi-table_filter_pushdown' },
            { label: 'table_function', slug: 'vgi/docs/python/api/vgi-table_function' },
            { label: 'table_in_out_function', slug: 'vgi/docs/python/api/vgi-table_in_out_function' },
            { label: 'transactor', slug: 'vgi/docs/python/api/vgi-transactor' },
            { label: 'worker', slug: 'vgi/docs/python/api/vgi-worker' },
          ],
        },
          ],
        },
        {
          label: 'Go',
          items: [
            { label: 'Overview', slug: 'vgi/docs/go' },
            { label: "What's new", slug: 'vgi/docs/go/release-notes' },
            {
              label: 'Tutorial',
              items: [
                { label: 'Scalar function', slug: 'vgi/docs/go/tutorial/scalar' },
                { label: 'Table function', slug: 'vgi/docs/go/tutorial/table' },
              ],
            },
            { label: 'Function patterns', slug: 'vgi/docs/go/how-to/function-patterns' },
            {
              label: 'How-to guides',
              items: [
                { label: 'Overview', slug: 'vgi/docs/go/how-to' },
                { label: 'Argument tags', slug: 'vgi/docs/go/how-to/argument-tags' },
                { label: 'Report errors well', slug: 'vgi/docs/go/how-to/errors' },
                { label: 'Expose a catalog', slug: 'vgi/docs/go/how-to/catalogs' },
                { label: 'Persist state across workers', slug: 'vgi/docs/go/how-to/state-storage' },
                { label: 'Serve over HTTP', slug: 'vgi/docs/go/how-to/serve-http' },
                { label: 'Authenticate callers', slug: 'vgi/docs/go/how-to/authentication' },
                { label: 'Call a worker from code', slug: 'vgi/docs/go/how-to/calling-a-worker' },
                { label: 'Settings, secrets, globals', slug: 'vgi/docs/go/how-to/settings-and-secrets' },
                { label: 'Integrate with the optimizer', slug: 'vgi/docs/go/how-to/pushdown-and-statistics' },
                { label: 'Cache results on the client', slug: 'vgi/docs/go/how-to/result-caching' },
                { label: 'Add a custom COPY format', slug: 'vgi/docs/go/how-to/copy-formats' },
              ],
            },
            {
              label: 'API Reference',
              // Topic groups, not modules: vgi-go is a single package. The
              // `groups` table in scripts/gen-api-go/main.go is the source of
              // truth for this list.
              items: [
                { label: 'Package overview', slug: 'vgi/docs/go/api' },
                { label: 'Scalar functions', slug: 'vgi/docs/go/api/scalar' },
                { label: 'Table functions', slug: 'vgi/docs/go/api/table' },
                { label: 'Table-in-out functions', slug: 'vgi/docs/go/api/table-in-out' },
                { label: 'Buffering functions', slug: 'vgi/docs/go/api/table-buffering' },
                { label: 'Aggregate functions', slug: 'vgi/docs/go/api/aggregate' },
                { label: 'COPY formats', slug: 'vgi/docs/go/api/copy' },
                { label: 'Worker & serving', slug: 'vgi/docs/go/api/worker' },
                { label: 'Catalogs', slug: 'vgi/docs/go/api/catalog' },
                { label: 'Arguments', slug: 'vgi/docs/go/api/arguments' },
                { label: 'Cache control', slug: 'vgi/docs/go/api/cache-control' },
                { label: 'Filter pushdown', slug: 'vgi/docs/go/api/filter-pushdown' },
                { label: 'State storage', slug: 'vgi/docs/go/api/storage' },
                { label: 'Arrow helpers', slug: 'vgi/docs/go/api/arrow' },
                { label: 'Protocol & metadata', slug: 'vgi/docs/go/api/protocol' },
                { label: 'Errors & logging', slug: 'vgi/docs/go/api/observability' },
              ],
            },
          ],
        },
        {
          label: 'TypeScript',
          items: [
            { label: 'Overview', slug: 'vgi/docs/typescript' },
            { label: "What's new", slug: 'vgi/docs/typescript/release-notes' },
            {
              label: 'Tutorial',
              items: [
                { label: 'Scalar function', slug: 'vgi/docs/typescript/tutorial/scalar' },
                { label: 'Table function', slug: 'vgi/docs/typescript/tutorial/table' },
              ],
            },
            { label: 'Function patterns', slug: 'vgi/docs/typescript/how-to/function-patterns' },
            {
              label: 'How-to guides',
              items: [
                { label: 'Overview', slug: 'vgi/docs/typescript/how-to' },
                { label: 'Value representations', slug: 'vgi/docs/typescript/how-to/value-representations' },
                { label: 'Runtimes & entry points', slug: 'vgi/docs/typescript/how-to/runtimes' },
                { label: 'Expose a catalog', slug: 'vgi/docs/typescript/how-to/catalogs' },
                { label: 'Serve over HTTP', slug: 'vgi/docs/typescript/how-to/serve-http' },
                { label: 'Cache results on the client', slug: 'vgi/docs/typescript/how-to/result-caching' },
                { label: 'Call a worker from code', slug: 'vgi/docs/typescript/how-to/client' },
                { label: 'Report errors well', slug: 'vgi/docs/typescript/how-to/errors' },
              ],
            },
            {
              label: 'API Reference',
              // Topic groups, not modules: @query-farm/vgi is one barrel over
              // ~65 files. The `GROUPS` table in scripts/gen-api-ts/main.ts is
              // the source of truth for this list.
              items: [
                { label: 'Package overview', slug: 'vgi/docs/typescript/api' },
                { label: 'Scalar functions', slug: 'vgi/docs/typescript/api/scalar' },
                { label: 'Table functions', slug: 'vgi/docs/typescript/api/table' },
                { label: 'Table-in-out functions', slug: 'vgi/docs/typescript/api/table-in-out' },
                { label: 'Buffering functions', slug: 'vgi/docs/typescript/api/table-buffering' },
                { label: 'Aggregate functions', slug: 'vgi/docs/typescript/api/aggregate' },
                { label: 'COPY formats', slug: 'vgi/docs/typescript/api/copy' },
                { label: 'Worker & serving', slug: 'vgi/docs/typescript/api/worker' },
                { label: 'Catalogs', slug: 'vgi/docs/typescript/api/catalog' },
                { label: 'Arguments', slug: 'vgi/docs/typescript/api/arguments' },
                { label: 'Arrow types', slug: 'vgi/docs/typescript/api/arrow-types' },
                { label: 'Value representations', slug: 'vgi/docs/typescript/api/codec' },
                { label: 'Batch helpers', slug: 'vgi/docs/typescript/api/arrow-helpers' },
                { label: 'Cache control', slug: 'vgi/docs/typescript/api/cache-control' },
                { label: 'Filter pushdown', slug: 'vgi/docs/typescript/api/filter-pushdown' },
                { label: 'State storage', slug: 'vgi/docs/typescript/api/storage' },
                { label: 'Client', slug: 'vgi/docs/typescript/api/client' },
                { label: 'Errors', slug: 'vgi/docs/typescript/api/errors' },
                { label: 'Protocol & metadata', slug: 'vgi/docs/typescript/api/metadata' },
                { label: 'Re-exported from vgi-rpc', slug: 'vgi/docs/typescript/api/vgi-rpc-reexports' },
              ],
            },
          ],
        },
        {
          label: 'Rust',
          items: [
            { label: 'Overview', slug: 'vgi/docs/rust' },
            { label: "What's new", slug: 'vgi/docs/rust/release-notes' },
            {
              label: 'Tutorial',
              items: [
                { label: 'Scalar function', slug: 'vgi/docs/rust/tutorial/scalar' },
                { label: 'Table function', slug: 'vgi/docs/rust/tutorial/table' },
              ],
            },
            { label: 'Function patterns', slug: 'vgi/docs/rust/how-to/function-patterns' },
            {
              label: 'How-to guides',
              items: [
                { label: 'Overview', slug: 'vgi/docs/rust/how-to' },
                { label: 'Transports & runtimes', slug: 'vgi/docs/rust/how-to/transports' },
                { label: 'Expose a catalog', slug: 'vgi/docs/rust/how-to/catalogs' },
                { label: 'Cache results on the client', slug: 'vgi/docs/rust/how-to/result-caching' },
                { label: 'Report errors well', slug: 'vgi/docs/rust/how-to/errors' },
              ],
            },
            {
              label: 'API Reference',
              // Topic groups, not modules: the surface spans three crates and 25
              // modules. The `GROUPS` table in scripts/gen-api-rust/main.py is
              // the source of truth for this list.
              items: [
                { label: 'Package overview', slug: 'vgi/docs/rust/api' },
                { label: 'Scalar functions', slug: 'vgi/docs/rust/api/scalar' },
                { label: 'Table functions', slug: 'vgi/docs/rust/api/table' },
                { label: 'Table-in-out functions', slug: 'vgi/docs/rust/api/table-in-out' },
                { label: 'Buffering functions', slug: 'vgi/docs/rust/api/buffering' },
                { label: 'Aggregate functions', slug: 'vgi/docs/rust/api/aggregate' },
                { label: 'COPY formats', slug: 'vgi/docs/rust/api/copy' },
                { label: 'Worker & serving', slug: 'vgi/docs/rust/api/worker' },
                { label: 'Catalogs', slug: 'vgi/docs/rust/api/catalog' },
                { label: 'Arguments', slug: 'vgi/docs/rust/api/arguments' },
                { label: 'Cache control', slug: 'vgi/docs/rust/api/cache-control' },
                { label: 'Pushdown & statistics', slug: 'vgi/docs/rust/api/pushdown' },
                { label: 'State storage', slug: 'vgi/docs/rust/api/storage' },
                { label: 'Secrets & settings', slug: 'vgi/docs/rust/api/secrets' },
                { label: 'Protocol & Arrow', slug: 'vgi/docs/rust/api/protocol' },
                { label: 'Client', slug: 'vgi/docs/rust/api/client' },
              ],
            },
          ],
        },
        {
          label: 'Java',
          items: [
            { label: 'Overview', slug: 'vgi/docs/java' },
            { label: "What's new", slug: 'vgi/docs/java/release-notes' },
            {
              label: 'Tutorial',
              items: [
                { label: 'Scalar function', slug: 'vgi/docs/java/tutorial/scalar' },
                { label: 'Table function', slug: 'vgi/docs/java/tutorial/table' },
              ],
            },
            { label: 'Function patterns', slug: 'vgi/docs/java/how-to/function-patterns' },
            {
              label: 'How-to guides',
              items: [
                { label: 'Overview', slug: 'vgi/docs/java/how-to' },
                { label: 'Running a worker', slug: 'vgi/docs/java/how-to/running' },
                { label: 'Expose a catalog', slug: 'vgi/docs/java/how-to/catalogs' },
              ],
            },
            {
              label: 'API Reference',
              // Topic groups, not packages. The `GROUPS` table in
              // scripts/gen-api-java/main.py is the source of truth for this list.
              items: [
                { label: 'Package overview', slug: 'vgi/docs/java/api' },
                { label: 'Scalar functions', slug: 'vgi/docs/java/api/scalar' },
                { label: 'Table functions', slug: 'vgi/docs/java/api/table' },
                { label: 'Table-in-out functions', slug: 'vgi/docs/java/api/table-in-out' },
                { label: 'Buffering functions', slug: 'vgi/docs/java/api/buffering' },
                { label: 'Aggregate functions', slug: 'vgi/docs/java/api/aggregate' },
                { label: 'Worker & serving', slug: 'vgi/docs/java/api/worker' },
                { label: 'Catalogs', slug: 'vgi/docs/java/api/catalog' },
                { label: 'Function metadata & params', slug: 'vgi/docs/java/api/function' },
                { label: 'State storage', slug: 'vgi/docs/java/api/storage' },
                { label: 'Cache control', slug: 'vgi/docs/java/api/cache-control' },
                { label: 'Filter pushdown', slug: 'vgi/docs/java/api/pushdown' },
                { label: 'Arrow helpers', slug: 'vgi/docs/java/api/types' },
                { label: 'Client', slug: 'vgi/docs/java/api/client' },
                { label: 'Protocol', slug: 'vgi/docs/java/api/protocol' },
              ],
            },
          ],
        },
        {
          label: 'C#',
          items: [
            { label: 'Overview', slug: 'vgi/docs/csharp' },
            { label: "What's new", slug: 'vgi/docs/csharp/release-notes' },
            {
              label: 'Tutorial',
              items: [
                { label: 'Scalar function', slug: 'vgi/docs/csharp/tutorial/scalar' },
                { label: 'Table function', slug: 'vgi/docs/csharp/tutorial/table' },
              ],
            },
            { label: 'Function patterns', slug: 'vgi/docs/csharp/how-to/function-patterns' },
            {
              label: 'How-to guides',
              items: [
                { label: 'Overview', slug: 'vgi/docs/csharp/how-to' },
                { label: 'Running a worker', slug: 'vgi/docs/csharp/how-to/running' },
                { label: 'Expose a catalog', slug: 'vgi/docs/csharp/how-to/catalogs' },
                { label: 'Optimizer integration', slug: 'vgi/docs/csharp/how-to/pushdown-and-statistics' },
                { label: 'Persist state', slug: 'vgi/docs/csharp/how-to/state-storage' },
                { label: 'Settings and secrets', slug: 'vgi/docs/csharp/how-to/settings-and-secrets' },
                { label: 'Custom COPY formats', slug: 'vgi/docs/csharp/how-to/copy-formats' },
                { label: 'Result caching', slug: 'vgi/docs/csharp/how-to/result-caching' },
                { label: 'Testing', slug: 'vgi/docs/csharp/how-to/testing' },
                { label: 'RPC client', slug: 'vgi/docs/csharp/how-to/rpc-client' },
              ],
            },
            {
              label: 'API Reference',
              // Roslyn topic groups; keep in sync with scripts/gen-api-csharp/Program.cs.
              items: [
                { label: 'API overview', slug: 'vgi/docs/csharp/api' },
                { label: 'Worker & serving', slug: 'vgi/docs/csharp/api/worker' },
                { label: 'Scalar functions', slug: 'vgi/docs/csharp/api/scalar' },
                { label: 'Table functions', slug: 'vgi/docs/csharp/api/table' },
                { label: 'Table-in-out functions', slug: 'vgi/docs/csharp/api/table-in-out' },
                { label: 'Buffering functions', slug: 'vgi/docs/csharp/api/buffering' },
                { label: 'Aggregate functions', slug: 'vgi/docs/csharp/api/aggregate' },
                { label: 'Catalogs', slug: 'vgi/docs/csharp/api/catalog' },
                { label: 'Attributes & Arrow types', slug: 'vgi/docs/csharp/api/attributes-types' },
                { label: 'Protocol', slug: 'vgi/docs/csharp/api/protocol' },
              ],
            },
          ],
        },
      ],
    }),
    mdx(),
    // Blog tag archives stay out of the sitemap. A tag holding one post carries
    // robots noindex (src/lib/blog-tags.ts), and submitting a noindex URL is a
    // Search Console error; archives are reachable from every post's footer
    // anyway, so nothing depends on them being listed here.
    sitemap({ filter: page => !new URL(page).pathname.startsWith('/blog/tags/') }),
    react(),
  ],
  markdown: {
    shikiConfig: {
      theme: farmTheme
    }
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
       allowedHosts: [
        '340ce136a669.ngrok-free.app', // your ngrok host
      ],
}
,
    optimizeDeps: {
      // duckdb-boot.ts statically imports this for its small JS API surface
      // (selectBundle/createWorker/AsyncDuckDB/...) but fetches the actual
      // wasm binaries and worker scripts from unpkg at runtime — see that
      // file's comments. The npm package still ships those binaries
      // alongside the JS entry (~180MB unpacked), which esbuild's dep
      // pre-bundler chokes on: every request for it 504s "Outdated Optimize
      // Dep" and the dev log logs its own diagnosis ("The dependency might
      // be incompatible with the dep optimizer. Try adding it to
      // optimizeDeps.exclude"). Excluding it serves the package's small ESM
      // entry (dist/duckdb-browser.mjs, ~34KB) directly instead of routing
      // it through the optimizer.
      exclude: ['@haybarn/haybarn-wasm'],
    },
  }
});
