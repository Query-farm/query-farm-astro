// DuckDB 2.0.1 regressions lead artwork: a cut-paper collage using the Haybarn
// 2.0 paper kit. Three release slabs step up from left to right: 2.0.0, 2.0.1,
// and 2.0.2 as an empty frame not yet cut. Torn chips (regression reports) drift
// down from above; on the left a neat green stack holds the fixed ones, while a
// taller heap of open chips piles up beside 2.0.1. Threads stitch fixes back
// into the releases.
//
//   node design/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/artwork.mjs → design/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regressions-artwork.{svg,png}
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { C, canvas, svgDoc } from '../haybarn-2-0/paper.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const W = 1440, H = 480;
const { out, rnd, j, paper, raw } = canvas(29);
const f = (n) => n.toFixed(1);
const chip = (x, y, w, h, fill, rot) =>
  `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="1.5" fill="${fill}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`;

// ── Ground: three strata the releases stand on.
const ground = [[C.umber, 418], [C.sage, 440], [C.cream, 460]];
ground.forEach(([fill, y], i) => {
  const pts = [[0, y + j(3)], [W * .3, y + j(5)], [W * .62, y + j(5)], [W, y + j(3)], [W, H], [0, H]];
  paper(`<path d="M${pts.map(p => p.map(f).join(' ')).join(' L')} Z" fill="${fill}"/>`, i === 0);
});

// ── Releases: 2.0.0 and 2.0.1 as solid slabs, each cut into strata; 2.0.2 an empty frame.
const slabs = [
  { x: 560, w: 170, top: 214, rows: [C.terra, C.ochre, C.terra, C.umber] },
  { x: 800, w: 170, top: 170, rows: [C.ochre, C.cream, C.ochre, C.moss, C.ochre] },
];
slabs.forEach(({ x, w, top, rows }) => {
  const h = (420 - top) / rows.length;
  paper(rows.map((fill, i) =>
    `<rect x="${f(x + j(4))}" y="${f(top + i * h + j(1.5))}" width="${f(w + j(6))}" height="${f(h - 5)}" fill="${fill}" transform="rotate(${f(j(.7))} ${x + w / 2} ${top + i * h})"/>`
  ).join(''), true);
});
// 2.0.2: a filled frame (annulus) rather than a stroke, which Chromium would flatten under the filter.
const fx = 1220, fw = 160, ft = 126, fb = 420, t = 16;
paper(`<path d="M${fx} ${ft} H${fx + fw} V${fb} H${fx} Z M${fx + t} ${ft + t} V${fb - t} H${fx + fw - t} V${ft + t} Z" fill="${C.sage}" fill-rule="evenodd"/>`);

// ── Fixed: a tidy green stack on the left, chips squared up.
for (let i = 0; i < 9; i++) {
  paper(chip(240 + j(3), 404 - i * 19, 112 + j(8), 15, i % 3 === 2 ? C.sage : C.moss, j(2.2)));
}

// ── Open: a taller, untidy heap between 2.0.1 and 2.0.2.
const heap = [];
for (let i = 0; i < 58; i++) {
  const level = Math.sqrt(rnd());                       // denser at the bottom
  const y = 408 - level * 215;
  const spread = (1 - level) * 105 + 10;
  heap.push(chip(1095 + j(spread), y, 30 + j(8), 18 + j(4), [C.terra, C.ochre, C.umber, C.terra][i % 4], j(38)));
}
paper(heap.join(''));

// ── Falling reports: chips drifting down from the top edge, thickest on the right.
const falling = [];
for (let i = 0; i < 34; i++) {
  const x = 120 + Math.pow(rnd(), .55) * 1260;
  const y = 22 + rnd() * 120;
  falling.push(chip(x, y, 22 + j(6), 14 + j(3), [C.terra, C.ochre, C.umber][i % 3], j(60)));
}
paper(falling.join(''));

// ── Threads stitching the fixed stack back into the releases.
// Top two arc over 2.0.0 into 2.0.1; the lower two run straight into 2.0.0. None cross.
const threads = [
  [[300, 252], [800, 196], 150], [[300, 290], [800, 240], 120], [[300, 330], [560, 300], 10], [[300, 368], [560, 360], 10],
].map(([[x1, y1], [x2, y2], lift]) => {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1} C ${f(mx - 60 + j(10))} ${f(y1 - lift)}, ${f(mx + 60 + j(10))} ${f(y2 - lift)}, ${x2} ${y2}"/>`;
});
out.unshift(`<g fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round" opacity="0.8">${threads.join('')}</g>`);
raw(`<g>${[[300, 252], [300, 290], [300, 330], [300, 368]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${C.ink}"/>`).join('')}</g>`);

const svg = svgDoc(W, H, out.join('\n'));
const dir = new URL('./', import.meta.url);
writeFileSync(new URL('regressions-artwork.svg', dir), svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: new URL('regressions-artwork.png', dir).pathname, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log('wrote design/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regressions-artwork.{svg,png} (2880 × 960)');
