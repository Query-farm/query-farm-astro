// Lindel DuckDB 2.0 lead artwork: a cut-paper collage in the style of the
// Haybarn 2.0, RapidFuzz and Hashfuncs pieces. Scattered paper squares (rows
// in random order) feed an 8 × 8 grid that a real Hilbert curve threads
// through. Its four colour blocks are four row groups, and they become a stack
// of tight row groups on the right, where a query box catches only one.
//
// The curve is drawn from scripts/lindel-blog/keys.json (real hilbert_encode
// keys), so the path is the extension's own order, not a hand-drawn shape.
//
//   node design/lindel-duckdb-2-curve-keys/artwork.mjs
//     → design/lindel-duckdb-2-curve-keys/lindel-artwork.{svg,png}
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { C, canvas, svgDoc } from '../haybarn-2-0/paper.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const KEYS = JSON.parse(readFileSync(new URL('../../scripts/lindel-blog/keys.json', import.meta.url), 'utf8'));

const W = 1440, H = 480;
const { out, j, raw, paper } = canvas(1106);
const GROUP = [C.ochre, C.moss, C.terra, C.sage];

// ── Centre: the 8 × 8 grid in Hilbert order.
const n = 8, cell = 46, gx = 538, gy = 56;
const pts = [];
for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) pts.push({ x, y, key: KEYS.hilbert[x * 64 + y] });
pts.sort((a, b) => a.key - b.key);
const cx = p => gx + p.x * cell + cell / 2, cy = p => gy + (n - 1 - p.y) * cell + cell / 2;

// Backing sheet.
paper(`<rect x="${gx - 16}" y="${gy - 16}" width="${n * cell + 32}" height="${n * cell + 32}" rx="4" fill="${C.cream}" transform="rotate(-0.8 ${gx + 184} ${gy + 184})"/>`);
// Tiles coloured by which quarter of the curve they fall in.
paper(pts.map((p, i) => {
  const s = cell - 8, x = gx + p.x * cell + 4 + j(1.2), y = gy + (n - 1 - p.y) * cell + 4 + j(1.2);
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s}" height="${s}" rx="2.5" fill="${GROUP[Math.floor(i / 16)]}" transform="rotate(${j(2.5).toFixed(2)} ${(x + s / 2).toFixed(1)} ${(y + s / 2).toFixed(1)})"/>`;
}).join(''));
// The curve as a thick paper ribbon, then a fine ink line on top.
const d = pts.map((p, i) => `${i ? 'L' : 'M'}${cx(p)} ${cy(p)}`).join(' ');
paper(`<path d="${d}" fill="none" stroke="${C.bg}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>`);
raw(`<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`);
const first = pts[0], last = pts[pts.length - 1];
raw(`<circle cx="${cx(first)}" cy="${cy(first)}" r="7" fill="${C.ink}"/><circle cx="${cx(last)}" cy="${cy(last)}" r="7" fill="${C.bg}" stroke="${C.ink}" stroke-width="2.4"/>`);

// ── Left: rows in random order, scattered and overlapping.
const scatter = [];
for (let i = 0; i < 46; i++) {
  const x = 60 + (i * 97) % 330 + j(18), y = 70 + ((i * 61) % 330) + j(16);
  const s = 22 + Math.abs(j(9));
  scatter.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="2.5" fill="${GROUP[i % 4]}" transform="rotate(${j(24).toFixed(1)} ${(x + s / 2).toFixed(1)} ${(y + s / 2).toFixed(1)})"/>`);
}
paper(scatter.join(''));

// Threads: scatter → start of the curve, end of the curve → the stack.
const thread = (x1, y1, x2, y2, op = 0.9) => {
  const mx = (x1 + x2) / 2;
  raw(`<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round" opacity="${op}"/>`
    + `<circle cx="${x1}" cy="${y1}" r="4.5" fill="${C.umber}" opacity="${op}"/><circle cx="${x2}" cy="${y2}" r="4.5" fill="${C.umber}" opacity="${op}"/>`);
};
[[404, 122], [396, 262], [408, 382]].forEach(([x, y], i) => thread(x, y, gx - 26, [212, 300, 388][i], 0.75));

// ── Right: the sorted file, four tight row groups; the query box hits one.
const sx = 1010, sw = 360, sh = 66, sg = 18, sy = 78;
const hit = 1;
GROUP.forEach((fill, g) => {
  const y = sy + g * (sh + sg), op = g === hit ? 1 : 0.5, x = sx + j(6) + (g % 2 ? 12 : 0);
  const tiles = Array.from({ length: 8 }, (_, t) => {
    const tx = x + 14 + t * 42 + j(1.5), ty = y + 14 + j(1.5);
    return `<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="34" height="38" rx="2.5" fill="${fill}" transform="rotate(${j(2).toFixed(2)} ${tx + 17} ${ty + 19})"/>`;
  }).join('');
  paper(`<g opacity="${op}"><rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="5" fill="${g === hit ? '#f7f3ea' : '#efe8d8'}" stroke="${g === hit ? C.ochre : 'none'}" stroke-width="3"/>${tiles}</g>`);
  thread(gx + n * cell + 26, [150, 210, 290, 350][g], x - 14, y + sh / 2, g === hit ? 0.95 : 0.3);
});
// Dashed query frame around the hit row group.
const hy = sy + hit * (sh + sg);
raw(`<rect x="${sx - 2}" y="${hy - 12}" width="${sw + 30}" height="${sh + 24}" rx="8" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="7 5"/>`);

const svg = svgDoc(W, H, out.join('\n'));
const dir = new URL('./', import.meta.url);
writeFileSync(new URL('lindel-artwork.svg', dir), svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: new URL('lindel-artwork.png', dir).pathname, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log(`wrote design/lindel-duckdb-2-curve-keys/lindel-artwork.{svg,png} (${W * 2} × ${H * 2})`);
