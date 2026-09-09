#!/usr/bin/env node
// Explicitly generate and commit these cards, like the other site OG images.
// Everything is local: shared brand assets, fonts, icons, and page metadata.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToPng, wordmark, fileDataUri, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';
import { categories } from '../src/data/haybarn-extensions/taxonomy.mjs';
import { directoryPage, installPage, referencePages, categoryPage } from '../src/data/haybarn-extensions/sharing.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const haybarn = fileDataUri(`${root}public/products/haybarn/haybarn-mark.svg`);
const icons = JSON.parse(readFileSync(`${root}node_modules/@iconify-json/ph/icons.json`, 'utf8'));
const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const img = (src, size) => ({ type: 'img', props: { src, width: size, height: size } });

function glyph(name) {
  const icon = icons.icons[name];
  if (!icon) throw new Error(`Unknown sharing-card icon: ${name}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? icons.width} ${icon.height ?? icons.height}">${icon.body.replace(/currentColor/g, COLORS.sun700)}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function card({ name, description, label, icon }) {
  return div({ width: WIDTH, height: HEIGHT, flexDirection: 'column', backgroundColor: COLORS.soilPaper, fontFamily: 'Commissioner' }, [
    div({ height: 8, width: '100%', backgroundColor: COLORS.sun700 }),
    div({ flex: 1, padding: '54px 72px', flexDirection: 'column', justifyContent: 'space-between' }, [
      div({ alignItems: 'center', justifyContent: 'space-between' }, [
        wordmark(),
        div({ alignItems: 'center', gap: 12, fontFamily: 'Petrona', fontSize: 30, fontWeight: 600, color: COLORS.soil900 }, [img(haybarn, 48), 'Haybarn']),
      ]),
      div({ alignItems: 'center', gap: 40 }, [
        div({ flex: 1, flexDirection: 'column' }, [
          div({ fontSize: 18, fontWeight: 600, color: COLORS.sun700, marginBottom: 18 }, label),
          div({ fontFamily: 'Petrona', fontSize: name.length > 24 ? 58 : 68, fontWeight: 600, lineHeight: 1.08, color: COLORS.soil900 }, name),
          div({ fontSize: 28, fontWeight: 400, lineHeight: 1.4, color: COLORS.soil700, marginTop: 22 }, description),
        ]),
        div({ width: 140, height: 140, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 24, border: `1px solid ${COLORS.soil300}`, backgroundColor: COLORS.soil200 }, img(glyph(icon), 88)),
      ]),
      div({ fontSize: 19, color: COLORS.soil600 }, 'query.farm/products/haybarn/extensions'),
    ]),
  ]);
}

const pages = [
  { ...directoryPage, label: 'Find extensions for Haybarn', icon: 'puzzle-piece' },
  { ...installPage, label: 'Haybarn extension guide', icon: 'download-simple' },
  ...Object.values(referencePages).map(page => ({ ...page, label: 'Haybarn community extension' })),
  ...categories.map(category => ({ ...categoryPage(category), label: 'Haybarn community extensions', icon: category.icon })),
];

for (const page of pages) {
  const destination = `${root}public${page.ogImage}`;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, await renderToPng(card(page)));
}
console.log(`Wrote ${pages.length} Haybarn extension sharing cards.`);
