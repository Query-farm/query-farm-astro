// Lead artwork for "Vector tiles in DuckDB": a cut-paper collage in the style of the
// Haybarn 2.0, Lindel and Hashfuncs pieces. Left: rows as loose paper slips. Centre: one
// real road (Viale Evangelista Torricelli) cut into the four tile pieces a tileset stores,
// with the tiles pulled slightly apart. Right: one real z15 tile of the Ponte Vecchio as
// stacked paper sheets, one per layer.
//
// Shapes come from src/data/blog/vector-tiles-in-duckdb/*.json (vgi-mvt output, exported by
// scripts/vector-tiles-blog/export.py), so the road and the tile are the worker's own data.
//
//   node design/vector-tiles-in-duckdb/artwork.mjs
//     → design/vector-tiles-in-duckdb/artwork.{svg,png}
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { C, canvas, svgDoc } from '../haybarn-2-0/paper.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = name => JSON.parse(readFileSync(new URL(`../../src/data/blog/vector-tiles-in-duckdb/${name}.json`, import.meta.url), 'utf8'));
const cut = data('tile-cut');
const tile = data('rows-to-tiles');

const W = 1440, H = 480;
const BLUE = '#8fb3c9', PALE = '#f3ecdc';
const { out, j, raw, paper } = canvas(2207);
const LAYER = [C.sage, BLUE, C.cream, C.umber, C.terra, C.ochre, C.moss];

const ring = (pts, P, close) => pts.map((p, i) => `${i ? 'L' : 'M'}${P(p[0], p[1]).map(v => v.toFixed(1)).join(' ')}`).join('') + (close ? 'Z' : '');
const pathOf = (g, P) => {
  const c = g.coordinates;
  if (g.type === 'LineString') return ring(c, P, false);
  if (g.type === 'MultiLineString') return c.map(l => ring(l, P, false)).join('');
  if (g.type === 'Polygon') return c.map(r => ring(r, P, true)).join('');
  if (g.type === 'MultiPolygon') return c.flatMap(p => p.map(r => ring(r, P, true))).join('');
  return '';
};

// ── Left: rows, as loose slips of paper in the layer colours.
const slips = [];
for (let i = 0; i < 30; i++) {
  const x = 50 + (i * 83) % 300 + j(14), y = 66 + ((i * 53) % 320) + j(12);
  const w = 54 + Math.abs(j(18)), h = 15 + Math.abs(j(3));
  slips.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${LAYER[i % LAYER.length]}" transform="rotate(${j(16).toFixed(1)} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})"/>`);
}
paper(slips.join(''));

// ── Centre: the road, cut into its four tiles.
const xs = cut.tiles.map(t => t.x), ys = cut.tiles.map(t => t.y);
const minTx = Math.min(...xs), minTy = Math.min(...ys);
const corner = cut.tiles.find(t => t.x === minTx + 1 && t.y === minTy + 1).bounds;
const pts = cut.merged.type === 'LineString' ? cut.merged.coordinates : cut.merged.coordinates.flat();
let vx0 = Math.min(corner[0], ...pts.map(p => p[0])), vx1 = Math.max(corner[0], ...pts.map(p => p[0]));
let vy0 = Math.min(corner[3], ...pts.map(p => p[1])), vy1 = Math.max(corner[3], ...pts.map(p => p[1]));
const pad = 120; vx0 -= pad; vx1 += pad; vy0 -= pad; vy1 += pad;
const box = { x: 530, y: 62, s: 356 };
const res = Math.max(vx1 - vx0, vy1 - vy0) / box.s;
const mx = (vx0 + vx1) / 2, my = (vy0 + vy1) / 2;
const P = (x, y) => [box.x + box.s / 2 + (x - mx) / res, box.y + box.s / 2 - (y - my) / res];
const [pcx, pcy] = P(corner[0], corner[3]);
const GAP = 13;
cut.tiles.forEach((t, i) => {
  const left = t.x === minTx, top = t.y === minTy;
  const dx = left ? -GAP : GAP, dy = top ? -GAP : GAP;
  const r = { x: left ? box.x : pcx, y: top ? box.y : pcy };
  r.w = left ? pcx - box.x : box.x + box.s - pcx;
  r.h = top ? pcy - box.y : box.y + box.s - pcy;
  const id = `q${i}`;
  const ctx = cut.context.filter(c => {
    const flat = c.geometry.type === 'LineString' ? c.geometry.coordinates : c.geometry.coordinates.flat();
    const [gx, gy] = flat.reduce((s, p) => [s[0] + p[0] / flat.length, s[1] + p[1] / flat.length], [0, 0]);
    return gx >= t.bounds[0] && gx < t.bounds[2] && gy >= t.bounds[1] && gy < t.bounds[3];
  }).map(c => pathOf(c.geometry, P)).join('');
  const piece = cut.raw.find(p => p.x === t.x && p.y === t.y);
  raw(`<clipPath id="${id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`);
  paper(`<g transform="translate(${dx} ${dy}) rotate(${j(1.2).toFixed(2)} ${pcx} ${pcy})">`
    + `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="${PALE}"/>`
    + `<path d="${ctx}" clip-path="url(#${id})" fill="none" stroke="${C.cream}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    + (piece ? `<path d="${pathOf(piece.geometry, P)}" fill="none" stroke="${[C.ochre, C.moss, C.terra, C.sage][i]}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>` : '')
    + `</g>`);
});
// The joined road, in ink, threaded over the cut tiles.
raw(`<path d="${pathOf(cut.merged, P)}" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round" transform="translate(0 0)"/>`);

// ── Right: one tile as stacked sheets, one per layer (bottom to top).
const SHEETS = [
  { name: 'earth', fill: C.cream },
  { name: 'landuse', fill: C.sage },
  { name: 'water', fill: BLUE },
  { name: 'roads', stroke: C.ochre, width: 7 },
  { name: 'buildings', fill: C.umber },
];
const sx = 1190, sy = 334, k = (300 * 0.707) / 1024, gap = 44;
SHEETS.forEach((s, level) => {
  const lay = tile.layers.find(l => l.name === s.name);
  const ext = lay.extent;
  const T = (x, y) => [x / ext * 1024 - 512, y / ext * 1024 - 512];
  const geo = lay.features.map(f => pathOf(f.geometry, T)).join('');
  const m = `matrix(${k} ${k * 0.56} ${-k} ${k * 0.56} ${sx + j(3)} ${sy - level * gap + j(2)})`;
  const sheet = `<rect x="-512" y="-512" width="1024" height="1024" fill="${level ? 'rgba(247,243,234,0.82)' : C.cream}"/>`;
  const shapes = s.fill
    ? `<path d="${geo}" fill="${s.fill}" stroke="none"/>`
    : `<path d="${geo}" fill="none" stroke="${s.stroke}" stroke-width="${s.width / k * 0.35}" stroke-linecap="round" stroke-linejoin="round"/>`;
  paper(`<g transform="${m}">${sheet}${shapes}</g>`);
});

// Threads: slips → the cut tiles → the stack.
const thread = (x1, y1, x2, y2, op = 0.85) => {
  const mid = (x1 + x2) / 2;
  raw(`<path d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round" opacity="${op}"/>`
    + `<circle cx="${x1}" cy="${y1}" r="4.5" fill="${C.umber}" opacity="${op}"/><circle cx="${x2}" cy="${y2}" r="4.5" fill="${C.umber}" opacity="${op}"/>`);
};
[[408, 150, 500, 196], [404, 290, 500, 262], [398, 386, 500, 330]].forEach(a => thread(...a, 0.7));
[[918, 170, 1000, 196], [918, 300, 1000, 318]].forEach(a => thread(...a, 0.7));

const svg = svgDoc(W, H, out.join('\n'));
const dir = new URL('./', import.meta.url);
writeFileSync(new URL('artwork.svg', dir), svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: new URL('artwork.png', dir).pathname, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log(`wrote design/vector-tiles-in-duckdb/artwork.{svg,png} (${W * 2} × ${H * 2})`);
