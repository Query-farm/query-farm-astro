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
      // The site already builds a unified Pagefind index in postbuild over all
      // of dist/ (incl. these docs pages), so disable Starlight's own.
      pagefind: false,
      // Keep the site's own src/pages/404.astro (avoid a route collision).
      disable404Route: true,
      // Render the Query.Farm site header on docs pages.
      components: { Header: './src/components/starlight/Header.astro' },
      // Load the site's Tailwind theme so the header's utility classes resolve,
      // then a small shell override to align Starlight with the site header.
      customCss: [
        './src/styles/global.css',
        './src/styles/starlight-theme.css',
        './src/styles/starlight-shell.css',
        './src/styles/starlight-api.css',
      ],
      sidebar: [
        { label: 'Overview', slug: 'vgi/docs/python' },
        {
          label: 'Tutorial',
          items: [
            { label: '1. Scalar function', slug: 'vgi/docs/python/tutorial/scalar' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Scalar functions', slug: 'vgi/docs/python/api/vgi-scalar_function' },
            { label: 'Table functions', slug: 'vgi/docs/python/api/vgi-table_function' },
            { label: 'Worker', slug: 'vgi/docs/python/api/vgi-worker' },
            { label: 'Arguments & schema', slug: 'vgi/docs/python/api/vgi-arguments' },
            { label: 'Catalogs', slug: 'vgi/docs/python/api/vgi-catalog' },
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
