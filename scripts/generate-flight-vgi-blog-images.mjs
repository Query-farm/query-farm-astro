// Explicit generation: commit the abstract SVG artwork and 1200 × 630 social card.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { renderToPng, COLORS } from './og-images/render.mjs';

const slug = 'why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0';
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = article.match(/^title: "(.+)"$/m)?.[1];
if (!title) throw new Error('Article title missing');

const paper = COLORS.soilPaper;
const ink = COLORS.soil900;
const muted = COLORS.soil700;

function illustration(mobile = false) {
  const width = mobile ? 400 : 720;
  const height = mobile ? 220 : 240;
  const point = (x, y) => `${(x * width).toFixed(2)} ${(y * height).toFixed(2)}`;
  const colors = ['#a66b46', '#a17b33', '#647352'];
  const paths = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    // Ordered offsets keep the contours apart; mirrored handles at the join
    // give the two cubic segments a continuous tangent. The mobile composition
    // keeps its height so the curves remain legible at a narrow viewport.
    const d = [
      `M ${point(-0.12, 0.74 + 0.46 * t)}`,
      `C ${point(0.15, 1.02 + 0.28 * t)}, ${point(0.17, 0.12 + 0.24 * t)}, ${point(0.43, 0.12 + 0.24 * t)}`,
      `C ${point(0.69, 0.12 + 0.24 * t)}, ${point(0.67, 0.90 + 0.23 * t)}, ${point(1.12, 0.30 + 0.58 * t)}`,
    ].join(' ');
    return `<path d="${d}" stroke="${colors[Math.floor(i / 8)]}" stroke-width="${mobile ? 0.95 : 1.1}"/>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="presentation" aria-hidden="true">
  <g fill="none" stroke-linecap="round">${paths}</g>
</svg>\n`;
}

const leadDirectory = new URL(`../public/blog/${slug}/`, import.meta.url);
const socialDirectory = new URL(`../public/media/posts/${slug}/`, import.meta.url);
mkdirSync(leadDirectory, { recursive: true });
mkdirSync(socialDirectory, { recursive: true });
const desktop = illustration();
writeFileSync(new URL('flight-to-vgi.svg', leadDirectory), desktop);
writeFileSync(new URL('flight-to-vgi-mobile.svg', leadDirectory), illustration(true));

const artwork = new Resvg(desktop, { fitTo: { mode: 'width', value: 2160 } }).render().asPng();
const block = (children, style = {}) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children },
});
const card = block([
  block('QUERY.FARM', { position: 'absolute', left: 54, top: 39, fontSize: 17, letterSpacing: 2, color: muted }),
  block(title, { position: 'absolute', left: 54, top: 92, width: 1092, fontFamily: 'Petrona', fontWeight: 600, fontSize: 60, lineHeight: 1.04 }),
  block('What building Airport taught us.', { position: 'absolute', left: 54, top: 232, fontSize: 24, color: muted }),
  { type: 'img', props: { src: `data:image/png;base64,${artwork.toString('base64')}`, width: 1200, height: 400, style: { position: 'absolute', left: 0, top: 286 } } },
], {
  width: 1200, height: 630, position: 'relative',
  backgroundColor: paper, color: ink, fontFamily: 'Noto Sans',
});
writeFileSync(new URL('social.png', socialDirectory), await renderToPng(card));
console.log(`Generated abstract desktop/mobile Bézier artwork and social card for ${slug}`);
