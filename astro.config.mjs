// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

// Custom farm theme for Shiki syntax highlighting
const farmTheme = {
  name: 'farm-theme',
  type: 'dark',
  colors: {
    'editor.background': '#0d2818',
    'editor.foreground': '#e8f5e9',
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#a5d6a7', fontStyle: 'italic' }
    },
    {
      scope: ['string', 'string.quoted'],
      settings: { foreground: '#c5e1a5' }
    },
    {
      scope: ['keyword', 'storage.type', 'storage.modifier'],
      settings: { foreground: '#66bb6a', fontStyle: 'bold' }
    },
    {
      scope: ['entity.name.function', 'support.function'],
      settings: { foreground: '#ffeb3b' }
    },
    {
      scope: ['constant.numeric', 'constant.language'],
      settings: { foreground: '#ffab91' }
    },
    {
      scope: ['variable', 'entity.name'],
      settings: { foreground: '#e8f5e9' }
    },
    {
      scope: ['punctuation'],
      settings: { foreground: '#c8e6c9' }
    },
    {
      scope: ['constant.other', 'support.type'],
      settings: { foreground: '#fff59d' }
    },
    {
      scope: ['keyword.operator'],
      settings: { foreground: '#e8f5e9' }
    }
  ]
};

// https://astro.build/config
export default defineConfig({
  site: 'https://query.farm',
  output: 'static',
  integrations: [
    icon(),
    // Starlight bundles astro-expressive-code, which must be registered before
    // mdx() so MDX code blocks render.
    starlight({
      title: 'VGI Python',
      // Match the site's code styling: the dark-green farm Shiki theme used in
      // <CodeBlock>, instead of Expressive Code's default light/dark themes.
      expressiveCode: {
        themes: [farmTheme],
        styleOverrides: { borderRadius: '0.5rem', borderColor: 'transparent' },
      },
      // The site already builds a unified Pagefind index in postbuild over all
      // of dist/ (incl. these docs pages), so disable Starlight's own.
      pagefind: false,
      // Keep the site's own src/pages/404.astro (avoid a route collision).
      disable404Route: true,
      // Render the Query.Farm site header on docs pages; force light-only
      // (the site has no dark mode) and drop the theme toggle.
      components: {
        Header: './src/components/starlight/Header.astro',
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        TableOfContents: './src/components/starlight/TableOfContents.astro',
      },
      // Load the site's Tailwind theme so the header's utility classes resolve,
      // then a small shell override to align Starlight with the site header.
      customCss: [
        './src/styles/global.css',
        './src/styles/starlight-theme.css',
        './src/styles/starlight-shell.css',
        './src/styles/starlight-api.css',
        './src/styles/starlight-callout.css',
        './src/styles/starlight-kinds.css',
      ],
      sidebar: [
        { label: 'Overview', slug: 'vgi/docs/python' },
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
            { label: 'Persist state across workers', slug: 'vgi/docs/python/how-to/state-storage' },
            { label: 'Serve over HTTP', slug: 'vgi/docs/python/how-to/serve-http' },
            { label: 'Use VGI from a Python app', slug: 'vgi/docs/python/how-to/python-app' },
            { label: 'Authentication', slug: 'vgi/docs/python/how-to/authentication' },
            { label: 'Integrate with the optimizer', slug: 'vgi/docs/python/how-to/pushdown-and-statistics' },
            { label: 'Function metadata', slug: 'vgi/docs/python/how-to/metadata' },
            { label: 'CLI', slug: 'vgi/docs/python/how-to/cli' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Overview', slug: 'vgi/docs/python/concepts' },
            { label: 'Function lifecycle', slug: 'vgi/docs/python/concepts/lifecycle' },
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
            { label: 'Argument serialization', slug: 'vgi/docs/python/concepts/argument-serialization' },
            { label: 'Filter pushdown', slug: 'vgi/docs/python/how-to/filter-pushdown' },
            { label: 'Column statistics', slug: 'vgi/docs/python/how-to/column-statistics' },
            { label: 'CLI reference', slug: 'vgi/docs/python/how-to/cli-reference' },
          ],
        },
        {
          label: 'API Reference',
          // Real module names, alphabetised.
          items: [
            { label: 'aggregate_function', slug: 'vgi/docs/python/api/vgi-aggregate_function' },
            { label: 'arguments', slug: 'vgi/docs/python/api/vgi-arguments' },
            { label: 'catalog', slug: 'vgi/docs/python/api/vgi-catalog' },
            { label: 'client', slug: 'vgi/docs/python/api/vgi-client' },
            { label: 'exceptions', slug: 'vgi/docs/python/api/vgi-exceptions' },
            { label: 'function_storage', slug: 'vgi/docs/python/api/vgi-function_storage' },
            { label: 'invocation', slug: 'vgi/docs/python/api/vgi-invocation' },
            { label: 'metadata', slug: 'vgi/docs/python/api/vgi-metadata' },
            { label: 'scalar_function', slug: 'vgi/docs/python/api/vgi-scalar_function' },
            { label: 'table_buffering_function', slug: 'vgi/docs/python/api/vgi-table_buffering_function' },
            { label: 'table_filter_pushdown', slug: 'vgi/docs/python/api/vgi-table_filter_pushdown' },
            { label: 'table_function', slug: 'vgi/docs/python/api/vgi-table_function' },
            { label: 'table_in_out_function', slug: 'vgi/docs/python/api/vgi-table_in_out_function' },
            { label: 'worker', slug: 'vgi/docs/python/api/vgi-worker' },
          ],
        },
      ],
    }),
    mdx(),
    sitemap(),
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
  }
});
