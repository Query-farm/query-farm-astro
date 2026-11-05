// Optimize the lead artwork and typeset the article's 1200 × 630 social card.
// The PNG masters are not committed: run design/haybarn-2-0/artwork.mjs and
// sections.mjs first to draw them.
// Run explicitly: node scripts/generate-haybarn-2-0-blog-images.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { renderToPng, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const slug = 'haybarn-2-0';
const directory = new URL(`../public/media/posts/${slug}/`, import.meta.url);
const master = new URL(`../design/${slug}/haybarn-artwork.png`, import.meta.url);
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = JSON.parse(article.match(/^title: (".*")$/m)[1]);
const titleLines = title.replace(': ', ':\n').split('\n');
mkdirSync(directory, { recursive: true });

await sharp(readFileSync(master)).resize(1440, 480, { fit: 'cover' }).webp({ quality: 88 })
  .toFile(new URL('haybarn-artwork.webp', directory).pathname);
// Section artwork drawn by design/haybarn-2-0/sections.mjs.
for (const name of ['art-patches', 'art-fixes', 'art-startup', 'art-calendar']) {
  await sharp(readFileSync(new URL(`../design/${slug}/${name}.png`, import.meta.url)))
    .resize(1440, 400).webp({ quality: 86 }).toFile(new URL(`${name}.webp`, directory).pathname);
}
const art = await sharp(readFileSync(master)).resize(1200, 400, { fit: 'cover' }).png().toBuffer();
const block = (children, style = {}) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children },
});
const card = block([
  block([
    wordmark({ size: 'sm' }),
    block('HAYBARN / RELEASE', { fontSize: 17, fontWeight: 600, color: COLORS.sun700 }),
  ], { alignItems: 'center', justifyContent: 'space-between' }),
  block(titleLines.map(line => block(line)), {
    flexDirection: 'column', fontFamily: 'Petrona', fontWeight: 600,
    fontSize: 44, lineHeight: 1.08, marginTop: 26,
  }),
  { type: 'img', props: {
    src: `data:image/png;base64,${art.toString('base64')}`, width: 1200, height: 400,
    style: { position: 'absolute', bottom: 0, left: 0 },
  } },
], {
  position: 'relative', width: WIDTH, height: HEIGHT, padding: '40px 54px 0',
  flexDirection: 'column', backgroundColor: COLORS.soilPaper,
  color: COLORS.soil900, fontFamily: 'Noto Sans',
});

writeFileSync(new URL('social.png', directory), await renderToPng(card));
console.log(`Generated ${slug} artwork (1440 × 480), four section pieces (1440 × 400) and social card (1200 × 630)`);
