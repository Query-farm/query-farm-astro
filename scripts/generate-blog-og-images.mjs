// Generate the two article cards that previously used the generic site image.
// Run explicitly and commit the PNGs, as with the other OG image generators.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const articles = [
  { slug: 'duckdb-community-extensions-distribution', topic: 'DuckDB · Distribution · Haybarn' },
  { slug: 'duckdb-variant-arrow-support-tracker', topic: 'DuckDB · Arrow · Interoperability' },
];

for (const { slug, topic } of articles) {
  const source = readFileSync(`${root}src/content/blog/${slug}.md`, 'utf8');
  // These articles use JSON-compatible double-quoted frontmatter titles.
  const title = JSON.parse(source.match(/^title: (".*")$/m)[1]);
  const card = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: WIDTH, height: HEIGHT, padding: '52px 64px', backgroundColor: COLORS.soilPaper, color: COLORS.soil900, fontFamily: 'Noto Sans', borderBottom: `18px solid ${COLORS.sun300}` },
      children: [
        wordmark(),
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '22px' }, children: [
          { type: 'div', props: { style: { fontSize: 22, color: COLORS.sun700, fontWeight: 600 }, children: topic } },
          { type: 'div', props: { style: { fontFamily: 'Petrona', fontWeight: 700, fontSize: 64, lineHeight: 1.1 }, children: title } },
        ] } },
        { type: 'div', props: { style: { fontSize: 22, color: COLORS.soil600 }, children: 'Engineering notes from Query.Farm' } },
      ],
    },
  };
  const directory = `${root}public/media/posts/${slug}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/social.png`, await renderToPng(card));
  console.log(`Generated ${slug}/social.png`);
}
