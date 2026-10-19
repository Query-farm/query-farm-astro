// Explicit generation: commit the SVG illustrations and 1200 × 630 social card.
// The paths show the article's design history, not runtime traffic or measurements.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderToPng, wordmark, COLORS } from './og-images/render.mjs';

const slug = 'why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0';
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = article.match(/^title: "(.+)"$/m)?.[1];
if (!title) throw new Error('Article title missing');

const paper = COLORS.soilPaper;
const ink = COLORS.soil900;
const gold = COLORS.sun700;
const green = '#355627';
const muted = COLORS.soil700;
const vgiMark = readFileSync(new URL('../public/vgi/vgi-emblem.png', import.meta.url)).toString('base64');
const arrowMark = readFileSync(new URL('../public/vgi/icons/apache-arrow-chevrons.svg', import.meta.url), 'utf8');
const description = 'Arrow Flight powers Airport, a DuckDB extension. Lessons from building Airport led to VGI-RPC and VGI, serving browsers and query engines.';

const text = (x, y, value, size = 15, color = ink, anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${value}</text>`;
const arrow = (x, y) => arrowMark.replace(/^<svg[^>]*>/,
  `<svg x="${x - 23}" y="${y - 19}" width="46" height="38" viewBox="168.75 168.75 1012.5 843.75">`);
const airport = (x, y) => `<circle cx="${x}" cy="${y}" r="15" fill="${paper}" stroke="${gold}" stroke-width="1.5"/>
  <circle cx="${x}" cy="${y}" r="9" fill="${gold}"/>
  <circle cx="${x}" cy="${y}" r="3" fill="${paper}"/>`;
const vgi = (x, y) => `<image x="${x - 40}" y="${y - 29.4}" width="80" height="58.8" href="data:image/png;base64,${vgiMark}"/>`;

function ribbon(path, color, count = 25) {
  return Array.from({ length: count }, (_, i) => {
    const accent = i % 6 === 0;
    return `<path d="${path(i / (count - 1))}" stroke="${color}" stroke-width="${accent ? 1.4 : 0.8}" stroke-opacity="${accent ? 0.8 : 0.28}"/>`;
  }).join('\n');
}

function illustration(mobile = false) {
  const width = mobile ? 400 : 720;
  const height = mobile ? 350 : 240;
  const curves = mobile
    ? ribbon(t => `M 60 58 C ${12 + t * 96} 96, ${12 + t * 96} 134, 60 172`, gold)
      + ribbon(t => `M 60 172 C ${-6 + t * 132} 210, ${-6 + t * 132} 248, 60 286`, green)
    : ribbon(t => `M 66 112 C 130 ${8 + t * 208}, 216 ${8 + t * 208}, 280 112`, gold)
      + ribbon(t => `M 280 112 C 370 ${-12 + t * 248}, 520 ${-12 + t * 248}, 632 112`, green);

  const labels = mobile
    ? text(112, 55, 'Arrow Flight', 20, ink, 'start', 600)
      + text(112, 79, 'gRPC + Arrow', 14, muted, 'start')
      + text(112, 169, 'Airport', 20, ink, 'start', 600)
      + text(112, 193, 'DuckDB extension', 14, muted, 'start')
      + text(112, 283, 'VGI-RPC + VGI', 20, ink, 'start', 600)
      + text(112, 307, 'Browsers + query engines', 14, muted, 'start')
      + text(112, 124, 'Built on Flight', 13, gold, 'start', 500)
      + text(112, 238, 'Lessons carried forward', 13, green, 'start', 500)
    : text(66, 213, 'Arrow Flight', 16, ink, 'middle', 600)
      + text(66, 234, 'gRPC + Arrow', 12, muted)
      + text(280, 213, 'Airport', 16, ink, 'middle', 600)
      + text(280, 234, 'DuckDB extension', 12, muted)
      + text(632, 213, 'VGI-RPC + VGI', 16, ink, 'middle', 600)
      + text(632, 234, 'Browsers + query engines', 12, muted)
      + text(173, 19, 'Built on Flight', 13, gold, 'middle', 500)
      + text(456, 19, 'Lessons carried forward', 13, green, 'middle', 500);

  const nodes = mobile
    ? `<circle cx="60" cy="58" r="29" fill="${paper}"/>
       <ellipse cx="60" cy="286" rx="45" ry="34" fill="${paper}"/>`
      + arrow(60, 58) + airport(60, 172) + vgi(60, 286)
    : `<circle cx="66" cy="112" r="29" fill="${paper}"/>
       <ellipse cx="632" cy="112" rx="45" ry="34" fill="${paper}"/>`
      + arrow(66, 112) + airport(280, 112) + vgi(632, 112);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">From Arrow Flight through Airport to VGI</title>
  <desc id="desc">${description}</desc>
  <g fill="none" stroke-linecap="round">${curves}</g>
  ${nodes}
  <g font-family="Noto Sans, system-ui, sans-serif">${labels}</g>
</svg>\n`;
}

const leadDirectory = new URL(`../public/blog/${slug}/`, import.meta.url);
const socialDirectory = new URL(`../public/media/posts/${slug}/`, import.meta.url);
mkdirSync(leadDirectory, { recursive: true });
mkdirSync(socialDirectory, { recursive: true });
const desktop = illustration();
writeFileSync(new URL('flight-to-vgi.svg', leadDirectory), desktop);
writeFileSync(new URL('flight-to-vgi-mobile.svg', leadDirectory), illustration(true));

// Resolve SVG labels with the same committed brand fonts used by the card.
const artwork = new Resvg(desktop, {
  fitTo: { mode: 'width', value: 2184 },
  font: {
    fontFiles: ['NotoSans-400.ttf', 'NotoSans-500.ttf', 'NotoSans-600.ttf'].map(name =>
      fileURLToPath(new URL(`./og-images/fonts/${name}`, import.meta.url))),
    loadSystemFonts: false,
    defaultFontFamily: 'Noto Sans',
  },
}).render().asPng();
const block = (children, style = {}, extra = {}) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children, ...extra },
});
const card = block([
  block([wordmark({ size: 'sm' }), block('ARROW FLIGHT / VGI', { fontSize: 17, letterSpacing: 2, color: muted })], {
    position: 'absolute', left: 54, right: 54, top: 36,
    justifyContent: 'space-between', alignItems: 'center',
  }),
  block(title, { position: 'absolute', left: 54, top: 92, width: 1092, fontFamily: 'Petrona', fontWeight: 600, fontSize: 60, lineHeight: 1.04 }),
  block('What building Airport taught us.', { position: 'absolute', left: 54, top: 232, fontSize: 24, color: muted }),
  { type: 'img', props: { src: `data:image/png;base64,${artwork.toString('base64')}`, width: 960, height: 320, style: { position: 'absolute', left: 120, top: 284 } } },
], {
  width: 1200, height: 630, position: 'relative',
  backgroundColor: paper, color: ink, fontFamily: 'Noto Sans',
});
writeFileSync(new URL('social.png', socialDirectory), await renderToPng(card));
console.log(`Generated desktop/mobile Bézier diagrams and social card for ${slug}`);
