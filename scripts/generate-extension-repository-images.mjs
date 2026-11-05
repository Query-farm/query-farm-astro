// Optimize the saved imagegen artwork and build its matching title/OG card.
// Run: node scripts/generate-extension-repository-images.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import opentype from '@shuding/opentype.js';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const slug = 'duckdb-2-query-farm-repository';
const directory = new URL(`../public/media/posts/${slug}/`, import.meta.url);
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = JSON.parse(article.match(/^title: (".*")$/m)[1]);
const colors = { paper: '#f7f3ea', ink: '#211a12', brown: '#7a5230' };
const fonts = Object.fromEntries([
  ['body', 'NotoSans-400.ttf'], ['bold', 'NotoSans-600.ttf'],
  ['display', 'Petrona-600.ttf'], ['brand', 'Petrona-700.ttf'],
].map(([key, file]) => {
  const bytes = readFileSync(new URL(`og-images/fonts/${file}`, import.meta.url));
  return [key, opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
}));
const assets = Object.fromEntries(Object.entries({
  farm: 'media-kit/logo/mark.svg',
}).map(([name, path]) => [name, `data:image/svg+xml;base64,${readFileSync(new URL(`../public/${path}`, import.meta.url)).toString('base64')}`]));
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const logo = (name, x, y, size) => `<image href="${assets[name]}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
function text(x, y, label, size = 13, face = 'body', color = colors.ink, centered = false) {
  if (centered) x -= fonts[face].getAdvanceWidth(label, size) / 2;
  return `<g aria-label="${escape(label)}"><path d="${fonts[face].getPath(label, x, y, size).toPathData(2)}" fill="${color}"/></g>`;
}
function svg(width, height, label, description, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(label)}</title><desc id="desc">${escape(description)}</desc>${content}</svg>\n`;
}

const description = 'Abstract editorial collage of textured ochre, moss green, cream, and umber shapes, open rings, dots, and fine connecting threads. The artwork contains no text.';
mkdirSync(directory, { recursive: true });
const master = new URL(`../design/${slug}/extensions-artwork.png`, import.meta.url);
await sharp(readFileSync(master)).resize({ width: 1440 }).webp({ quality: 88 })
  .toFile(new URL('extensions-artwork.webp', directory).pathname);
// Embed a PNG inside the standalone vector title card for broad SVG support.
const artworkPng = await sharp(readFileSync(master)).resize({ width: 1440 }).png().toBuffer();
const artworkUri = `data:image/png;base64,${artworkPng.toString('base64')}`;

function wrap(value, size, maxWidth) {
  const lines = [''];
  for (const word of value.split(' ')) {
    const candidate = [lines.at(-1), word].filter(Boolean).join(' ');
    if (fonts.display.getAdvanceWidth(candidate, size) > maxWidth && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = candidate;
  }
  return lines;
}
let size = 62, lines = wrap(title, size, 1092);
while (lines.length > 2 && size > 40) lines = wrap(title, --size, 1092);
if (lines.length > 2) throw new Error('Title needs a new card layout');

// Read the title from frontmatter so the article and every shared preview agree.
const brandX = 102, brandY = 65, brandSize = 28;
const queryWidth = fonts.brand.getAdvanceWidth('Query', brandSize);
const dotWidth = fonts.brand.getAdvanceWidth('.', brandSize);
const titleCard = svg(1200, 630, title, description, [
  `<rect width="1200" height="630" fill="${colors.paper}"/>`,
  logo('farm', 54, 35, 35),
  text(brandX, brandY, 'Query', brandSize, 'brand'),
  text(brandX + queryWidth, brandY, '.', brandSize, 'brand', '#7d5714'),
  text(brandX + queryWidth + dotWidth, brandY, 'Farm', brandSize, 'brand'),
  text(922, 61, 'DUCKDB / EXTENSIONS', 15, 'bold', colors.brown),
  ...lines.map((line, i) => text(54, 142 + i * 67, line, size, 'display')),
  `<image href="${artworkUri}" x="0" y="230" width="1200" height="400"/>`,
].join(''));
writeFileSync(new URL('title-card.svg', directory), titleCard);
writeFileSync(new URL('social.png', directory), new Resvg(titleCard).render().asPng());
console.log(`Generated optimized abstract artwork and 1200×630 title/Open Graph card for ${slug}`);
