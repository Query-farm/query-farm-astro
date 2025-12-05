// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';

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
  integrations: [icon(), mdx()],
  markdown: {
    shikiConfig: {
      theme: farmTheme
    }
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
       allowedHosts: [
        '8f859ce3a5dc.ngrok-free.app', // your ngrok host
      ],
}
  }
});