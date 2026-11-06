// Generate the Lindel DuckDB 2.0 article's figures.
// Run explicitly and commit the output, as with the other blog image generators.
//
// Every curve position comes from scripts/lindel-blog/keys.json: real
// hilbert_encode / morton_encode keys for a 64 x 64 grid, computed by the
// extension. Smaller grids are prefixes of it (coordinates below 2^k use the
// first 4^k keys on both curves).
//
// The figures animate with CSS inside the SVG, which browsers run for <img>
// embeds. Each animation loops, and prefers-reduced-motion shows the finished
// state with no motion.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COLORS } from './og-images/render.mjs';

const slug = 'lindel-duckdb-2-curve-keys';
const out = fileURLToPath(new URL(`../public/blog/${slug}/`, import.meta.url));
const KEYS = JSON.parse(readFileSync(new URL('./lindel-blog/keys.json', import.meta.url), 'utf8'));

// The validated amber/blue pair from the DataSketches figures: amber is the
// old or unsorted state, blue the new one.
const BEFORE = '#a9762e';
const AFTER = '#2e5fb8';
const INK = COLORS.soil900;
const MUTED = COLORS.soil700;
const RULE = COLORS.soil300;
const FAINT = COLORS.soil200;
const PAPER = COLORS.soilPaper;
const FONT = "'Noto Sans', 'Helvetica Neue', Arial, sans-serif";

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x, y, s, { size = 13, fill = INK, anchor = 'start', weight = 400, cls = '' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${cls ? ` class="${cls}"` : ''}>${esc(s)}</text>`;
const r1 = v => Math.round(v * 10) / 10;

/** Points of an n x n grid in curve order: [{x, y, key}]. */
function curveOrder(curve, n) {
  const pts = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) pts.push({ x, y, key: KEYS[curve][x * 64 + y] });
  return pts.sort((a, b) => a.key - b.key);
}

/** Keyframe CSS: hidden until `at`, visible until `until`, hidden again by 100%, all as fractions of the loop. */
function appear(name, at, until = 0.93) {
  const p = v => `${r1(v * 100)}%`;
  return `@keyframes ${name}{0%,${p(at)}{opacity:0}${p(Math.min(at + 0.03, until))},${p(until)}{opacity:1}${p(Math.min(until + 0.04, 1))},100%{opacity:0}}`;
}
/** Keyframe CSS for drawing a pathLength="1" stroke between `from` and `to`. */
function draw(name, from, to, until = 0.93) {
  const p = v => `${r1(v * 100)}%`;
  return `@keyframes ${name}{0%,${p(from)}{stroke-dashoffset:1}${p(to)},${p(until)}{stroke-dashoffset:0}${p(Math.min(until + 0.04, 1))},100%{stroke-dashoffset:1}}`;
}
function svg(W, H, body, css) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>${css}
.draw{stroke-dasharray:1;stroke-dashoffset:0}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
${body}
</svg>
`;
}

// ---------------------------------------------------------------------------
// 1. The two curves drawing themselves over an 8 x 8 grid.
function curves() {
  const W = 760, H = 440, n = 8, cell = 38, size = n * cell, top = 78;
  const lefts = [40, W - 40 - size];
  const T = 9;
  const css = [`.c{animation:${T}s linear infinite}`];
  const body = [];
  body.push(text(16, 28, 'Hilbert and Morton keys on an 8 × 8 grid', { size: 16, weight: 700 }));
  body.push(text(16, 48, 'Each cell shows its key. The line visits the cells in key order: hilbert_encode / morton_encode([x, y]::UTINYINT[2]).', { size: 11.5, fill: MUTED }));
  [['hilbert', 'Hilbert', AFTER], ['morton', 'Morton (Z-order)', BEFORE]].forEach(([curve, label, color], i) => {
    const x0 = lefts[i];
    const cx = x => x0 + x * cell + cell / 2;
    const cy = y => top + (n - 1 - y) * cell + cell / 2;
    body.push(text(x0, top - 10, label, { size: 13.5, weight: 700, fill: color }));
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      body.push(`<rect x="${x0 + x * cell}" y="${top + (n - 1 - y) * cell}" width="${cell}" height="${cell}" fill="none" stroke="${FAINT}"/>`);
    }
    const pts = curveOrder(curve, n);
    for (const p of pts) body.push(text(cx(p.x) + cell / 2 - 3, cy(p.y) - cell / 2 + 11, p.key, { size: 8.5, fill: MUTED, anchor: 'end' }));
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${cx(p.x)} ${cy(p.y)}`).join('');
    body.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="draw c" style="animation-name:draw${i}"/>`);
    css.push(draw(`draw${i}`, 0.04, 0.8));
    body.push(`<circle cx="${cx(pts[0].x)}" cy="${cy(pts[0].y)}" r="4.5" fill="${color}"/>`);
    body.push(text(x0, top + size + 22, i === 0
      ? 'Consecutive keys are always neighbouring cells.'
      : 'Interleaved bits: long jumps between quadrants.', { size: 11.5, fill: MUTED }));
  });
  body.push(text(16, H - 14, 'x runs left to right and y bottom to top; the dot marks key 0.', { size: 10.5, fill: MUTED }));
  return svg(W, H, body.join('\n'), css.join('\n'));
}

// ---------------------------------------------------------------------------
// 2. Sort order of signed values, before and after.
function signOrder() {
  const W = 760, H = 330, values = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const x0 = 200, x1 = W - 50, step = (x1 - x0) / (values.length - 1);
  const xv = v => x0 + (v + 4) * step;
  // Raw 8-bit patterns: -1 is 255, -4 is 252, so negatives sort after positives, in ascending order of bits.
  const raw = v => (v + 256) % 256;
  const rows = [
    { label: 'Previous builds', sub: 'raw bits: −1 is 0xFF', color: BEFORE, order: [...values].sort((a, b) => raw(a) - raw(b)), y: 150 },
    { label: 'DuckDB 2.0 build', sub: 'sign bit flipped', color: AFTER, order: [...values].sort((a, b) => (raw(a) ^ 0x80) - (raw(b) ^ 0x80)), y: 280 },
  ];
  const T = 8;
  const css = [`.s{animation:${T}s linear infinite}`];
  const body = [];
  body.push(text(16, 28, 'ORDER BY key for TINYINT values −4 to 4', { size: 16, weight: 700 }));
  body.push(text(16, 48, 'The arcs connect the values in key order; the small numbers are each value’s position in that order.', { size: 11.5, fill: MUTED }));
  rows.forEach((row, i) => {
    body.push(text(16, row.y - 4, row.label, { size: 12.5, weight: 700, fill: row.color }));
    body.push(text(16, row.y + 12, row.sub, { size: 10.5, fill: MUTED }));
    body.push(`<line x1="${x0 - 14}" y1="${row.y}" x2="${x1 + 14}" y2="${row.y}" stroke="${RULE}" stroke-width="1.5"/>`);
    let d = '';
    row.order.forEach((v, k) => {
      if (k) {
        const a = xv(row.order[k - 1]), b = xv(v);
        const lift = 16 + Math.abs(b - a) * 0.22;
        d += `Q${(a + b) / 2} ${row.y - lift} ${b} ${row.y}`;
      } else d = `M${xv(v)} ${row.y}`;
    });
    body.push(`<path d="${d}" fill="none" stroke="${row.color}" stroke-width="2.2" pathLength="1" class="draw s" style="animation-name:sd${i}"/>`);
    css.push(draw(`sd${i}`, 0.05, 0.7));
    row.order.forEach((v, k) => {
      body.push(`<circle cx="${xv(v)}" cy="${row.y}" r="5" fill="${row.color}"/>`);
      body.push(text(xv(v), row.y + 22, v < 0 ? `−${-v}` : v, { size: 12.5, anchor: 'middle', weight: 600 }));
      const name = `sp${i}_${k}`;
      css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, 0.05 + 0.65 * k / (values.length - 1)));
      body.push(text(xv(v) + 8, row.y - 8, k + 1, { size: 10, fill: MUTED, cls: name }));
    });
  });
  return svg(W, H, body.join('\n'), css.join('\n'));
}

// ---------------------------------------------------------------------------
// 3. Decomposing a box into key ranges on a 16 x 16 Hilbert grid.
function ranges() {
  const W = 760, H = 520, n = 16, cell = 22, size = n * cell, top = 70, x0 = 24;
  const box = { x0: 3, y0: 2, x1: 10, y1: 9 };
  const keyAt = (x, y) => KEYS.hilbert[x * 64 + y];
  const inBox = (x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  const cx = x => x0 + x * cell + cell / 2;
  const cy = y => top + (n - 1 - y) * cell + cell / 2;

  // Aligned squares are contiguous key runs. Emit the squares wholly inside the
  // box, split the ones that straddle its edge.
  const blocks = [];
  (function walk(x, y, s) {
    let all = true, any = false;
    for (let i = x; i < x + s; i++) for (let j = y; j < y + s; j++) { const b = inBox(i, j); all &&= b; any ||= b; }
    if (!any) return;
    if (all) {
      let lo = Infinity, hi = -Infinity;
      for (let i = x; i < x + s; i++) for (let j = y; j < y + s; j++) { lo = Math.min(lo, keyAt(i, j)); hi = Math.max(hi, keyAt(i, j)); }
      if (hi - lo + 1 !== s * s) throw new Error('aligned square is not contiguous');
      blocks.push({ x, y, s, lo, hi });
      return;
    }
    const h = s / 2;
    for (const [dx, dy] of [[0, 0], [h, 0], [0, h], [h, h]]) walk(x + dx, y + dy, h);
  })(0, 0, n);
  blocks.sort((a, b) => b.s - a.s || a.lo - b.lo);
  const merged = [];
  for (const b of [...blocks].sort((a, c) => a.lo - c.lo)) {
    const last = merged[merged.length - 1];
    if (last && b.lo === last.hi + 1) last.hi = b.hi; else merged.push({ lo: b.lo, hi: b.hi });
  }
  // Must match SELECT * FROM hilbert_ranges([3, 2]::UTINYINT[2], [10, 9]::UTINYINT[2], 1000).
  const expected = '10-11,24-48,51-53,69-70,120-132,135-135,210-221,226-231';
  if (merged.map(r => `${r.lo}-${r.hi}`).join(',') !== expected) throw new Error('ranges differ from the extension');

  const T = 12;
  const css = [];
  const body = [];
  body.push(text(16, 28, 'hilbert_ranges([3, 2], [10, 9]): a box becomes key ranges', { size: 16, weight: 700 }));
  body.push(text(16, 48, 'Aligned squares are runs of consecutive keys. Squares inside the box are kept, squares on its edge are split again.', { size: 11.5, fill: MUTED }));
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    body.push(`<rect x="${x0 + x * cell}" y="${top + (n - 1 - y) * cell}" width="${cell}" height="${cell}" fill="none" stroke="${FAINT}"/>`);
  }
  const all = curveOrder('hilbert', n);
  body.push(`<path d="${all.map((p, k) => `${k ? 'L' : 'M'}${cx(p.x)} ${cy(p.y)}`).join('')}" fill="none" stroke="${RULE}" stroke-width="1.6"/>`);

  const tones = { 4: '#2e5fb8', 2: '#5b84cf', 1: '#9ab3e3' };
  const start = 0.06, span = 0.5;
  blocks.forEach((b, i) => {
    const name = `b${i}`;
    css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, start + span * i / blocks.length));
    body.push(`<rect class="${name}" x="${x0 + b.x * cell + 1.5}" y="${top + (n - b.y - b.s) * cell + 1.5}" width="${b.s * cell - 3}" height="${b.s * cell - 3}" fill="${tones[b.s]}" fill-opacity="0.35" stroke="${tones[b.s]}" stroke-width="1.5" rx="2"/>`);
  });
  // The curve inside the box, drawn once the squares are in place.
  const segs = [];
  for (const r of merged) {
    const run = all.filter(p => p.key >= r.lo && p.key <= r.hi);
    segs.push(run.length > 1 ? `M${run.map(p => `${cx(p.x)} ${cy(p.y)}`).join('L')}` : `M${cx(run[0].x) - 3} ${cy(run[0].y)}h6`);
  }
  css.push(`.runs{animation:runs ${T}s linear infinite}`, draw('runs', start + span, start + span + 0.12));
  body.push(`<path d="${segs.join('')}" fill="none" stroke="${AFTER}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="draw runs"/>`);
  body.push(`<rect x="${x0 + box.x0 * cell}" y="${top + (n - 1 - box.y1) * cell}" width="${(box.x1 - box.x0 + 1) * cell}" height="${(box.y1 - box.y0 + 1) * cell}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="5 4"/>`);

  // Legend and result on the right.
  const lx = x0 + size + 36;
  body.push(text(lx, top + 8, 'Squares kept', { size: 13, weight: 700 }));
  [[4, '4 × 4 square', '16 keys'], [2, '2 × 2 squares', '4 keys each'], [1, 'single cells', '1 key each']].forEach(([s, shape, keys], i) => {
    const count = blocks.filter(b => b.s === s).length;
    const label = `${shape} (${keys})`;
    body.push(`<rect x="${lx}" y="${top + 24 + i * 24}" width="14" height="14" fill="${tones[s]}" fill-opacity="0.35" stroke="${tones[s]}" stroke-width="1.5" rx="2"/>`);
    body.push(text(lx + 22, top + 36 + i * 24, `${count} ${label}`, { size: 12 }));
  });
  body.push(text(lx, top + 128, `${blocks.length} squares merge into ${merged.length} ranges:`, { size: 13, weight: 700 }));
  const rangeLines = merged.map(r => r.lo === r.hi ? `${r.lo}` : `${r.lo}–${r.hi}`);
  rangeLines.forEach((line, i) => {
    const name = `rl${i}`;
    css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, start + span + 0.12 + 0.015 * i));
    body.push(text(lx + (i % 2) * 110, top + 152 + Math.floor(i / 2) * 20, line, { size: 12.5, cls: name, fill: AFTER, weight: 600 }));
  });
  body.push(text(lx, top + 250, '64 keys for 64 cells: exact.', { size: 12, fill: MUTED }));

  // Key strip: where the ranges fall among all 256 keys.
  const sy = top + size + 40, sx0 = x0, sw = W - 2 * x0, kx = k => sx0 + (k / 256) * sw;
  body.push(text(sx0, sy - 10, 'All 256 keys, with the ranges that cover the box', { size: 12, weight: 700 }));
  body.push(`<rect x="${sx0}" y="${sy}" width="${sw}" height="18" fill="${FAINT}"/>`);
  merged.forEach((r, i) => {
    const name = `rs${i}`;
    css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, start + span + 0.12 + 0.015 * i));
    body.push(`<rect class="${name}" x="${r1(kx(r.lo))}" y="${sy}" width="${r1(Math.max(2, kx(r.hi + 1) - kx(r.lo)))}" height="18" fill="${AFTER}"/>`);
  });
  for (const k of [0, 64, 128, 192, 255]) body.push(text(kx(k), sy + 34, k, { size: 10.5, fill: MUTED, anchor: k === 255 ? 'end' : k ? 'middle' : 'start' }));
  return svg(W, H, body.join('\n'), css.join('\n'));
}

// ---------------------------------------------------------------------------
// 4. Row groups before and after sorting, with the bounding box each one records.
function rowGroups() {
  const W = 760, H = 470, n = 64, cell = 5, size = n * cell, top = 74, groups = 16, per = 64;
  const lefts = [32, W - 32 - size];
  // Deterministic points: a small LCG so reruns produce identical files.
  let seed = 20261106;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pts = Array.from({ length: groups * per }, () => ({ x: Math.floor(rand() * n), y: Math.floor(rand() * n) }));
  const q = { x0: 40, x1: 49, y0: 12, y1: 20 };
  const layouts = [
    { label: 'Random order', color: BEFORE, rows: pts },
    { label: 'Sorted by hilbert_encode(x, y)', color: AFTER, rows: [...pts].sort((a, b) => KEYS.hilbert[a.x * 64 + a.y] - KEYS.hilbert[b.x * 64 + b.y]) },
  ];
  const T = 10;
  const css = [];
  const body = [];
  body.push(text(16, 28, 'What each row group records, before and after sorting', { size: 16, weight: 700 }));
  body.push(text(16, 48, `${groups * per} random points in ${groups} row groups of ${per}. Each rectangle is one row group’s min/max bounds; the dashed box is the query.`, { size: 11.5, fill: MUTED }));
  layouts.forEach((L, i) => {
    const x0 = lefts[i];
    const px = x => x0 + x * cell + cell / 2, py = y => top + (n - 1 - y) * cell + cell / 2;
    body.push(`<rect x="${x0}" y="${top}" width="${size}" height="${size}" fill="none" stroke="${RULE}"/>`);
    let hits = 0;
    for (let g = 0; g < groups; g++) {
      const rows = L.rows.slice(g * per, (g + 1) * per);
      const bx0 = Math.min(...rows.map(r => r.x)), bx1 = Math.max(...rows.map(r => r.x));
      const by0 = Math.min(...rows.map(r => r.y)), by1 = Math.max(...rows.map(r => r.y));
      const hit = bx1 >= q.x0 && bx0 <= q.x1 && by1 >= q.y0 && by0 <= q.y1;
      hits += hit;
      const name = `g${i}_${g}`;
      css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, 0.04 + 0.5 * g / groups));
      const dots = rows.map(r => `<rect x="${px(r.x) - 1.6}" y="${py(r.y) - 1.6}" width="3.2" height="3.2"/>`).join('');
      body.push(`<g class="${name}"><g fill="${L.color}" fill-opacity="0.75">${dots}</g>` +
        `<rect x="${x0 + bx0 * cell}" y="${top + (n - 1 - by1) * cell}" width="${(bx1 - bx0 + 1) * cell}" height="${(by1 - by0 + 1) * cell}" fill="${hit ? L.color : 'none'}" fill-opacity="${hit ? 0.035 : 0}" stroke="${L.color}" stroke-opacity="${hit ? 0.8 : 0.35}" stroke-width="${hit ? 1.3 : 1}"/></g>`);
    }
    body.push(`<rect x="${x0 + q.x0 * cell}" y="${top + (n - 1 - q.y1) * cell}" width="${(q.x1 - q.x0 + 1) * cell}" height="${(q.y1 - q.y0 + 1) * cell}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="5 3"/>`);
    body.push(text(x0, top - 10, L.label, { size: 13.5, weight: 700, fill: L.color }));
    const name = `res${i}`;
    css.push(`.${name}{animation:${name} ${T}s linear infinite}`, appear(name, 0.58));
    body.push(text(x0, top + size + 24, `The query must read ${hits} of ${groups} row groups.`, { size: 13, weight: 600, cls: name }));
  });
  body.push(text(16, H - 14, 'Same principle as the benchmark: 20M points in 200 row groups went from 200 read to 2 for a small box.', { size: 10.5, fill: MUTED }));
  return svg(W, H, body.join('\n'), css.join('\n'));
}

mkdirSync(out, { recursive: true });
for (const [name, make] of [['curves', curves], ['sign-order', signOrder], ['ranges', ranges], ['row-groups', rowGroups]]) {
  writeFileSync(`${out}${name}.svg`, make());
  console.log(`Generated ${slug}/${name}.svg`);
}
