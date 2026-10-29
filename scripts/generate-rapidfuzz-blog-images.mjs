// Draw the RapidFuzz article's artwork, optimize it, and typeset its 1200 × 630 social card.
// Run explicitly: node scripts/generate-rapidfuzz-blog-images.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { renderToPng, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const slug = 'rapidfuzz-for-duckdb-2';
const directory = new URL(`../public/media/posts/${slug}/`, import.meta.url);
const design = new URL(`../design/${slug}/`, import.meta.url);
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = JSON.parse(article.match(/^title: (".*")$/m)[1]);
const titleLines = title.replace(': ', ':\n').split('\n');
mkdirSync(directory, { recursive: true });
mkdirSync(design, { recursive: true });

// Cut-paper palette, matching the hashfuncs artwork.
const P = {
  paper: '#f7f3ea', ochre: '#d5a64b', moss: '#526843', umber: '#5d4632',
  cream: '#e9dfc7', terracotta: '#c0643f', ink: '#211a12', sage: '#9aa784',
};

// Deterministic jitter so reruns produce the same artwork.
let seed = 20261029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const jitter = (n) => (rand() * 2 - 1) * n;

const W = 1536, H = 512, TW = 30, TH = 42, GAP = 6;

function tile(x, y, fill, { rot = 0, dashed = false } = {}) {
  const cx = x + TW / 2, cy = y + TH / 2;
  const style = dashed
    ? `fill="none" stroke="${P.umber}" stroke-width="1.6" stroke-dasharray="4 4"`
    : `fill="${fill}" filter="url(#paper)"`;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${TW}" height="${TH}" rx="3" ${style} transform="rotate(${rot.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
}

// A row of tiles: `pattern` lists one colour per tile; `messy` scatters them like a torn strip.
function row(x, y, pattern, messy) {
  return pattern.map((fill, i) => {
    const dx = messy ? jitter(2.5) : 0, dy = messy ? jitter(5) : 0, rot = messy ? jitter(5) : 0;
    return fill === 'gap' ? '' : tile(x + i * (TW + GAP) + dx, y + dy, P[fill], { rot });
  }).join('');
}

const thread = (x1, y1, x2, y2, opacity = 1) => {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${P.ink}" stroke-width="1.6" stroke-linecap="round" opacity="${opacity}"/>`
    + `<circle cx="${x1}" cy="${y1}" r="5" fill="${P.umber}"/><circle cx="${x2}" cy="${y2}" r="5" fill="${P.umber}" opacity="${opacity}"/>`;
};

// Left: four messy spellings of the same name, slightly out of line.
const canonical = ['ochre', 'moss', 'cream', 'ochre', 'sage', 'moss', 'cream', 'ochre'];
const variants = [
  ['ochre', 'moss', 'cream', 'terracotta', 'sage', 'moss', 'cream'],
  ['ochre', 'cream', 'moss', 'ochre', 'sage', 'moss', 'cream', 'ochre'],
  ['ochre', 'moss', 'cream', 'ochre', 'sage', 'terracotta', 'cream', 'ochre', 'moss'],
  ['moss', 'cream', 'ochre', 'sage', 'moss', 'cream'],
];
const leftX = 64, rowYs = [86, 178, 270, 362];
const left = variants.map((v, i) => row(leftX + jitter(10), rowYs[i], v, true)).join('');

// Centre: one spelling aligned against the canonical row; ticks join equal tiles.
const cx = 640, topY = 176, botY = 296;
const top = ['ochre', 'moss', 'cream', 'terracotta', 'sage', 'moss', 'cream', 'gap'];
const align = row(cx, topY, top, false)
  + tile(cx + 7 * (TW + GAP), topY, null, { dashed: true })
  + row(cx, botY, canonical, false)
  + canonical.map((c, i) => {
    const x = cx + i * (TW + GAP) + TW / 2;
    if (top[i] === c) return `<line x1="${x}" y1="${topY + TH + 8}" x2="${x}" y2="${botY - 8}" stroke="${P.ink}" stroke-width="1.4"/>`;
    return `<line x1="${x}" y1="${topY + TH + 8}" x2="${x}" y2="${botY - 8}" stroke="${P.terracotta}" stroke-width="2" stroke-dasharray="3 5"/>`;
  }).join('');

// Score dial: an ochre arc filled most of the way round.
const dx = 1004, dy = 256, r = 54, score = 0.83;
const a = -Math.PI / 2 + score * 2 * Math.PI;
const dial = `<circle cx="${dx}" cy="${dy}" r="${r}" fill="none" stroke="${P.cream}" stroke-width="18" filter="url(#paper)"/>`
  + `<path d="M${dx} ${dy - r} A${r} ${r} 0 1 1 ${(dx + r * Math.cos(a)).toFixed(1)} ${(dy + r * Math.sin(a)).toFixed(1)}" fill="none" stroke="${P.ochre}" stroke-width="18" filter="url(#paper)"/>`
  + `<circle cx="${dx}" cy="${dy}" r="22" fill="${P.moss}" filter="url(#paper)"/>`;

// Right: three canonical cards; the matched one is lifted and outlined.
const cards = [[1186, 104, false], [1186, 216, true], [1186, 328, false]].map(([x, y, hit]) => {
  const fill = hit ? P.paper : '#efe8d8';
  return `<g opacity="${hit ? 1 : 0.55}"><rect x="${x - 18}" y="${y - 14}" width="${8 * (TW + GAP) + 30}" height="${TH + 28}" rx="6" fill="${fill}" stroke="${hit ? P.ochre : P.umber}" stroke-width="${hit ? 3 : 0}" filter="url(#paper)"/>`
    + row(x, y, hit ? canonical : canonical.slice().reverse(), false) + '</g>';
}).join('');

const threads = rowYs.map((y, i) => thread(leftX + variants[i].length * (TW + GAP) + 14, y + TH / 2, cx - 26, i < 2 ? topY + TH / 2 : botY + TH / 2, 0.85)).join('')
  + thread(cx + 8 * (TW + GAP) + 6, topY + TH / 2 + 60, dx - r - 16, dy)
  + thread(dx + r + 16, dy, 1168, 250)
  + thread(dx + r + 16, dy, 1168, 138, 0.3)
  + thread(dx + r + 16, dy, 1168, 362, 0.3);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="paper" x="-10%" y="-10%" width="130%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="grain"/>
    <feComposite in="grain" in2="SourceGraphic" operator="in" result="grained"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/>
    <feOffset dx="1.5" dy="2.5" result="blur"/>
    <feComponentTransfer in="blur" result="shadow"><feFuncA type="linear" slope="0.28"/></feComponentTransfer>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="grained"/></feMerge>
  </filter>
  <filter id="ground"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.07 0"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="${P.paper}"/>
<rect width="${W}" height="${H}" filter="url(#ground)"/>
${threads}${left}${align}${dial}${cards}
</svg>`;

writeFileSync(new URL('fuzzy-artwork.svg', design), svg);
const master = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(new URL('fuzzy-artwork.png', design), master);

await sharp(master).resize(1440, 480, { fit: 'cover' }).webp({ quality: 88 })
  .toFile(new URL('fuzzy-artwork.webp', directory).pathname);
const art = await sharp(master).resize(1200, 400, { fit: 'cover' }).png().toBuffer();
const block = (children, style = {}) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children },
});
const card = block([
  block([
    wordmark({ size: 'sm' }),
    block('DUCKDB / EXTENSION UPDATE', { fontSize: 17, fontWeight: 600, color: COLORS.sun700 }),
  ], { alignItems: 'center', justifyContent: 'space-between' }),
  block(titleLines.map(line => block(line)), {
    flexDirection: 'column', fontFamily: 'Petrona', fontWeight: 600,
    fontSize: 50, lineHeight: 1.08, marginTop: 26,
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
console.log(`Generated ${slug} artwork (1440 × 480) and social card (1200 × 630)`);
