// Explicit generation; commit the resulting card with the page.
// Run: node scripts/generate-crossfield-og-image.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderToPng, fileDataUri, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const block = (children, style = {}) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
// Reuse the homepage illustration. Convert WebP to PNG for the SVG renderer.
const artwork = await sharp(`${root}public/crossfield/art/shared-ground.webp`)
  .resize(496, HEIGHT, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer();

const card = block([
  block([
    wordmark({ size: 'sm' }),
    block([
      block([
        { type: 'img', props: { src: fileDataUri(`${root}public/crossfield/crossfield-mark.svg`), width: 64, height: 64 } },
        block('Crossfield', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 78, letterSpacing: -2 }),
      ], { alignItems: 'center', gap: 16, marginBottom: 32 }),
      block('Spend less time', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 54, lineHeight: 1.12, letterSpacing: -1.5 }),
      block('reconciling reports.', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 54, lineHeight: 1.12, letterSpacing: -1.5, color: '#3f6038' }),
    ], { flexDirection: 'column', flex: 1, justifyContent: 'center' }),
    block('A semantic layer inside DuckDB.', { fontSize: 26, color: COLORS.soil700 }),
  ], { width: 704, padding: '44px 48px 48px', flexDirection: 'column', flexShrink: 0 }),
  { type: 'img', props: { src: `data:image/png;base64,${artwork.toString('base64')}`, width: 496, height: HEIGHT } },
], { width: WIDTH, height: HEIGHT, backgroundColor: COLORS.soilPaper, color: COLORS.soil900, fontFamily: 'Noto Sans', fontWeight: 400 });

writeFileSync(`${root}public/crossfield/crossfield-social.png`, await renderToPng(card));
console.log('Generated public/crossfield/crossfield-social.png (1200×630)');
