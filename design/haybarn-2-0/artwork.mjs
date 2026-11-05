// Haybarn 2.0 lead artwork: a cut-paper collage in the style of the
// hashfuncs and extension-repository pieces, drawn as SVG so it can be
// regenerated. A stack of paper strata (the engine and its patch stack) sends
// threads out to discs, rings and tiles (the clients and extensions it runs in).
//
//   node design/haybarn-2-0/artwork.mjs   → design/haybarn-2-0/haybarn-artwork.{svg,png}
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { C, defs } from './paper.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const W = 1440, H = 480;
// Small deterministic jitter so the pieces look hand-cut, not ruled.
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const j = (n) => (rnd() - 0.5) * 2 * n;



const out = [];
const paper = (inner, fibre = false) =>
  out.push(`<g filter="url(#paper)">${fibre ? `<g filter="url(#fibre)">${inner}</g>` : inner}</g>`);

// ── Left: the stack. Six strata, slightly skewed, each cut into a few tiles.
const stack = [
  [C.ochre, C.cream, C.sage],
  [C.moss, C.ochre],
  [C.terra, C.sage, C.umber],
  [C.cream, C.terra],
  [C.sage, C.moss, C.ochre],
  [C.umber, C.terra],
];
const sx = 70, sy = 92, sw = 330, sh = 44, gap = 9;
const ports = [];
stack.forEach((row, i) => {
  const y = sy + i * (sh + gap);
  const x0 = sx + j(10) + (i % 2 ? 14 : 0);
  let x = x0;
  const widths = row.map(() => 0.6 + rnd());
  const total = widths.reduce((a, b) => a + b, 0);
  const tiles = row.map((fill, k) => {
    const w = (sw * widths[k]) / total;
    const t = `<rect x="${x.toFixed(1)}" y="${(y + j(1.5)).toFixed(1)}" width="${(w - 4).toFixed(1)}" height="${sh}" fill="${fill}" transform="rotate(${j(0.6).toFixed(2)} ${x + w / 2} ${y + sh / 2})"/>`;
    x += w;
    return t;
  });
  paper(tiles.join(''), i % 2 === 0);
  ports.push([x0 + sw + 6, y + sh / 2]);
});

// ── Centre: Haybarn, an abstract paper barn the threads pass through.
const bx = 640, bw = 168, by = 130, bh = 240, roof = 64;
const barnIn = Array.from({ length: 6 }, (_, i) => [bx - 6, by + roof + 18 + i * ((bh - roof - 36) / 5)]);
const barnOut = Array.from({ length: 7 }, (_, i) => [bx + bw + 6, by + roof + 8 + i * ((bh - roof - 16) / 6)]);
paper(`<path d="M${bx} ${by + roof} L${bx + bw / 2} ${by} L${bx + bw} ${by + roof} L${bx + bw} ${by + bh} L${bx} ${by + bh} Z" fill="${C.terra}"/>`, true);
paper(`<path d="M${bx + 22} ${by + roof + 6} L${bx + bw / 2} ${by + 26} L${bx + bw - 22} ${by + roof + 6} Z" fill="${C.ochre}"/>`);
paper(`<rect x="${bx + bw / 2 - 30}" y="${by + bh - 92}" width="60" height="92" fill="${C.umber}"/>`, true);
paper(`<path d="M${bx + bw / 2 - 30} ${by + bh - 92} L${bx + bw / 2 + 30} ${by + bh} M${bx + bw / 2 + 30} ${by + bh - 92} L${bx + bw / 2 - 30} ${by + bh}" stroke="${C.cream}" stroke-width="7" fill="none"/>`);

// ── Right: what it runs in. Each target on its own row, so no thread crosses a shape.
const targets = [
  { x: 1010, y: 78, r: 34, fill: C.ochre },
  { x: 1236, y: 132, r: 34, ring: C.moss },
  { x: 1104, y: 188, r: 36, fill: C.sage },
  { x: 1300, y: 242, r: 38, fill: C.terra },
  { x: 1050, y: 314, r: 28, ring: C.terra },
  { x: 1170, y: 352, r: 36, fill: C.moss },
  { x: 1290, y: 408, r: 32, ring: C.ochre },
];
// Five small chips arriving together at the edge: the five extensions.
const chips = [
  [1386, 344, C.ochre], [1404, 370, C.moss], [1382, 394, C.terra], [1402, 420, C.sage], [1384, 446, C.umber],
];

const curve = ([x1, y1], [x2, y2], wob = 18) => {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1} C ${mx + j(wob)} ${y1}, ${mx + j(wob)} ${y2}, ${x2} ${y2}"/>`;
};
const threads = [];
const dots = [];
ports.forEach((p, i) => {
  threads.push(curve(p, barnIn[i]));
  dots.push(`<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="${[C.ochre, C.moss, C.terra][i % 3]}"/>`);
});
targets.forEach((T, i) => {
  const end = [T.x - T.r - 10, T.y];
  threads.push(curve(barnOut[i], end, 30));
  dots.push(`<circle cx="${end[0]}" cy="${end[1]}" r="5" fill="${C.ink}"/>`);
});
out.unshift(`<g fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round" opacity="0.82">${threads.join('')}</g>`);

targets.forEach((T) => {
  if (T.ring) {
    // A filled annulus rather than a stroked circle: Chromium flattens filtered strokes into polygons.
    const disc = (r) => `M${T.x - r} ${T.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    paper(`<path d="${disc(T.r)} ${disc(T.r - 13)}" fill="${T.ring}" fill-rule="evenodd"/>`);
  }
  else paper(`<circle cx="${T.x}" cy="${T.y}" r="${T.r}" fill="${T.fill}"/>`, T.r >= 36);
});
paper(chips.map(([x, y, f]) => `<rect x="${x - 13}" y="${y - 10}" width="26" height="20" rx="2" fill="${f}" transform="rotate(${j(8).toFixed(1)} ${x} ${y})"/>`).join(''));
paper(dots.join(''));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect width="${W}" height="${H}" filter="url(#ground)" opacity="0.5"/>
${out.join('\n')}
</svg>`;

const dir = new URL('./', import.meta.url);
writeFileSync(new URL('haybarn-artwork.svg', dir), svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: new URL('haybarn-artwork.png', dir).pathname, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log('wrote design/haybarn-2-0/haybarn-artwork.{svg,png} (2880 × 960)');
