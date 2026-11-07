// LinkedIn video for the Lindel DuckDB 2.0 post: 1080 × 1350 (4:5), 30 fps,
// silent, captions baked in. Every curve position and point order comes from
// scripts/lindel-blog/keys.json (real hilbert_encode keys), with the same
// points and query box as the article's row-groups figure. Benchmark numbers
// are the article's.
//
//   node design/lindel-duckdb-2-curve-keys/video.mjs
//     → design/lindel-duckdb-2-curve-keys/lindel-linkedin.mp4 (+ -cover.png)
// Needs ffmpeg on PATH and the artwork master (run artwork.mjs first).
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = new URL('./', import.meta.url);
const root = new URL('../../', import.meta.url);
const b64 = (u) => readFileSync(u).toString('base64');
const KEYS = JSON.parse(readFileSync(new URL('scripts/lindel-blog/keys.json', root), 'utf8'));
const font = (f) => `data:font/ttf;base64,${b64(new URL(`scripts/og-images/fonts/${f}`, root))}`;
const MARK = `data:image/svg+xml;base64,${b64(new URL('public/media-kit/logo/mark.svg', root))}`;
const ART = `data:image/png;base64,${b64(new URL('lindel-artwork.png', here))}`;

const FPS = 30, DURATION = 26, W = 1080, H = 1350;

const page_ = `<!doctype html><html><head><style>
@font-face{font-family:Petrona;font-weight:600;src:url(${font('Petrona-600.ttf')})}
@font-face{font-family:Petrona;font-weight:700;src:url(${font('Petrona-700.ttf')})}
@font-face{font-family:'Noto Sans';font-weight:400;src:url(${font('NotoSans-400.ttf')})}
@font-face{font-family:'Noto Sans';font-weight:600;src:url(${font('NotoSans-600.ttf')})}
body{margin:0;background:#f7f3ea}
svg{display:block;font-family:'Noto Sans';font-variant-numeric:tabular-nums}
.d{font-family:Petrona;font-weight:600}
</style></head><body><svg id="s" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>
<script>
const KEYS = ${JSON.stringify(KEYS.hilbert)};
const MARK = ${JSON.stringify(MARK)}, ART = ${JSON.stringify(ART)};
const W = ${W}, H = ${H};
const C = { paper:'#f7f3ea', ink:'#211a12', muted:'#5d4632', rule:'#cfc4ad', faint:'#e6dbc2',
  sun:'#7d5714', before:'#a9762e', after:'#2e5fb8', band:'#f0c877' };

// Same deterministic points and query as the article's row-groups figure.
let seed = 20261106;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const N = 64, GROUPS = 16, PER = 64;
const pts = Array.from({ length: GROUPS * PER }, () => ({ x: Math.floor(rand() * N), y: Math.floor(rand() * N) }));
const sorted = [...pts].sort((a, b) => KEYS[a.x * 64 + a.y] - KEYS[b.x * 64 + b.y]);
const Q = { x0: 40, x1: 49, y0: 12, y1: 20 };
// 16 × 16 Hilbert curve (a prefix of the 64 × 64 keys), drawn at 4 fine cells per step.
const curve = [];
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) curve.push({ x, y, k: KEYS[x * 64 + y] });
curve.sort((a, b) => a.k - b.k);

// Panel geometry.
const CELL = 11, PX = (W - N * CELL) / 2, PY = 486;
const gx = x => PX + x * CELL + CELL / 2, gy = y => PY + (N - 1 - y) * CELL + CELL / 2;

const clamp = v => Math.max(0, Math.min(1, v));
const ease = v => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const span = (t, a, b) => ease((t - a) / (b - a));
// Visible from a to b with a fade at each end.
const win = (t, a, b, f = 0.4) => Math.min(span(t, a - f / 2, a + f / 2), 1 - span(t, b - f / 2, b + f / 2));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, o = {}) => \`<text x="\${x}" y="\${y}" font-size="\${o.size || 30}" fill="\${o.fill || C.ink}" text-anchor="\${o.anchor || 'start'}" font-weight="\${o.weight || 400}" \${o.cls ? \`class="\${o.cls}"\` : ''} opacity="\${o.op ?? 1}">\${esc(s)}</text>\`;

function bounds(rows) {
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (const r of rows) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); }
  return { x0, x1, y0, y1, hit: x1 >= Q.x0 && x0 <= Q.x1 && y1 >= Q.y0 && y0 <= Q.y1 };
}
const rectOf = (b) => ({ x: PX + b.x0 * CELL, y: PY + (N - 1 - b.y1) * CELL, w: (b.x1 - b.x0 + 1) * CELL, h: (b.y1 - b.y0 + 1) * CELL });
function groupRect(b, color, hl, fill = 0.07) {
  const r = rectOf(b);
  return \`<rect x="\${r.x}" y="\${r.y}" width="\${r.w}" height="\${r.h}" fill="\${color}" fill-opacity="\${hl && b.hit ? fill : 0}" stroke="\${color}" stroke-opacity="\${hl && b.hit ? 0.95 : 0.4}" stroke-width="\${hl && b.hit ? 3 : 1.6}"/>\`;
}

// Captions: [start, end, headline lines, sub line].
const CAPS = [
  [0, 5.6, ['Rows written in random order'], '1,024 points in 16 row groups of 64'],
  [5.6, 10.6, ['Lindel turns (x, y) into one key', 'along a Hilbert curve'], 'Nearby points get nearby keys'],
  [10.6, 16.4, ['Sort by that key', 'when you write the file'], 'Each row group becomes a compact tile'],
];

function frame(t) {
  const o = [];
  // Header: wordmark, eyebrow, hairband.
  o.push(\`<rect width="\${W}" height="\${H}" fill="\${C.paper}"/>\`);
  o.push(\`<rect y="0" width="\${W}" height="8" fill="\${C.band}"/>\`);
  o.push(\`<image href="\${MARK}" x="72" y="62" width="44" height="44"/>\`);
  o.push(\`<text x="130" y="96" font-size="34" class="d" font-weight="700" fill="\${C.ink}">Query<tspan fill="\${C.sun}">.</tspan>Farm</text>\`);
  o.push(T(W - 72, 94, 'LINDEL · DUCKDB 2.0', { size: 22, weight: 600, fill: C.sun, anchor: 'end' }));

  for (const [a, b, lines, sub] of CAPS) {
    const op = a === 0 ? Math.min(1, 1 - span(t, b - 0.2, b + 0.2)) : win(t, a, b);
    if (op <= 0) continue;
    const lift = (1 - op) * 14;
    lines.forEach((l, i) => o.push(T(72, 238 + i * 70 + lift, l, { size: 60, cls: 'd', op })));
    o.push(T(72, 238 + lines.length * 70 + 4 + lift, sub, { size: 30, fill: C.muted, op }));
  }

  // ── Panel scenes (0 – 16.6 s).
  const panelOp = 1 - span(t, 16.2, 16.8);
  if (panelOp > 0) {
    o.push(\`<g opacity="\${panelOp}">\`);
    o.push(\`<rect x="\${PX}" y="\${PY}" width="\${N * CELL}" height="\${N * CELL}" fill="#fbf8f1" stroke="\${C.rule}" stroke-width="1.5"/>\`);
    const randOp = 1 - span(t, 5.4, 6.2);
    // Scene A: random order, group by group.
    if (randOp > 0) {
      const shown = span(t, 0.2, 3.4) * GROUPS;
      const hl = t > 4.4;
      o.push(\`<g opacity="\${randOp}">\`);
      for (let g = 0; g < Math.ceil(shown); g++) {
        const rows = pts.slice(g * PER, (g + 1) * PER);
        const op = clamp(shown - g);
        o.push(\`<g opacity="\${op}"><g fill="\${C.before}" fill-opacity="0.8">\${rows.map(r => \`<rect x="\${gx(r.x) - 3}" y="\${gy(r.y) - 3}" width="6" height="6"/>\`).join('')}</g>\${groupRect(bounds(rows), C.before, hl, 0)}</g>\`);
      }
      o.push('</g>');
    }
    // Faint points under the curve and the sort.
    const faintOp = span(t, 5.4, 6.2) * (1 - span(t, 15.8, 16.2));
    if (faintOp > 0) o.push(\`<g fill="\${C.rule}" opacity="\${faintOp}">\${pts.map(r => \`<rect x="\${gx(r.x) - 2.5}" y="\${gy(r.y) - 2.5}" width="5" height="5"/>\`).join('')}</g>\`);
    // Scene B: the curve draws itself, then dims.
    const drawn = span(t, 6.2, 10.0);
    const curveOp = 1 - 0.75 * span(t, 10.6, 11.4);
    if (drawn > 0) {
      const n = Math.max(2, Math.floor(drawn * curve.length));
      const d = curve.slice(0, n).map((p, i) => \`\${i ? 'L' : 'M'}\${PX + (p.x * 4 + 2) * CELL} \${PY + (N - (p.y * 4 + 2)) * CELL}\`).join(' ');
      o.push(\`<path d="\${d}" fill="none" stroke="\${C.ink}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round" opacity="\${curveOp}"/>\`);
      const head = curve[n - 1];
      if (drawn < 1) o.push(\`<circle cx="\${PX + (head.x * 4 + 2) * CELL}" cy="\${PY + (N - (head.y * 4 + 2)) * CELL}" r="9" fill="\${C.after}"/>\`, T(PX + N * CELL, PY + N * CELL + 46, \`key \${head.k}\`, { size: 26, anchor: 'end', fill: C.muted }));
    }
    // Scene C: fill row groups in key order.
    const filled = span(t, 11.2, 14.4) * sorted.length;
    if (filled > 0) {
      const hl = t > 14.9;
      for (let g = 0; g < GROUPS; g++) {
        const rows = sorted.slice(g * PER, Math.min((g + 1) * PER, Math.floor(filled)));
        if (!rows.length) break;
        o.push(\`<g fill="\${C.after}" fill-opacity="0.85">\${rows.map(r => \`<rect x="\${gx(r.x) - 3}" y="\${gy(r.y) - 3}" width="6" height="6"/>\`).join('')}</g>\${groupRect(bounds(rows), C.after, hl)}\`);
      }
    }
    // Query box and the counter.
    const qOp = Math.max(win(t, 4.2, 5.6), win(t, 14.7, 17));
    if (qOp > 0) {
      const r = rectOf(Q);
      o.push(\`<rect x="\${r.x}" y="\${r.y}" width="\${r.w}" height="\${r.h}" fill="none" stroke="\${C.ink}" stroke-width="3.5" stroke-dasharray="10 6" opacity="\${qOp}"/>\`);
      const sortedPhase = t > 10;
      const read = sortedPhase ? 4 : 16;
      o.push(T(PX, PY + N * CELL + 62, 'Box query reads', { size: 32, op: qOp }));
      o.push(T(PX + 262, PY + N * CELL + 62, \`\${read} of 16 row groups\`, { size: 32, weight: 600, fill: sortedPhase ? C.after : C.before, op: qOp }));
      if (!sortedPhase) o.push(T(PX, PY + N * CELL + 106, "Every row group's min/max spans the whole map.", { size: 26, fill: C.muted, op: qOp }));
    }
    o.push('</g>');
  }

  // ── Scene D: the benchmark (16.6 – 22.2 s).
  const dOp = win(t, 16.8, 22.2);
  if (dOp > 0) {
    o.push(\`<g opacity="\${dOp}">\`);
    o.push(T(72, 238, 'At 20 million points', { size: 60, cls: 'd' }));
    o.push(T(72, 290, 'Parquet, 200 row groups, a small box query', { size: 30, fill: C.muted }));
    const bar = (y, label, before, after, unit, max, a) => {
      const p = span(t, a, a + 1.1);
      const cur = Math.round(before + (after - before) * p);
      const bw = 936;
      o.push(T(72, y, label, { size: 30, weight: 600 }));
      o.push(T(W - 72, y, \`\${cur}\${unit}\`, { size: 30, weight: 600, anchor: 'end', fill: p > 0.99 ? C.after : C.ink }));
      o.push(T(72, y + 46, 'Random order', { size: 24, fill: C.muted }));
      o.push(\`<rect x="72" y="\${y + 60}" width="\${bw * before / max}" height="34" fill="\${C.before}"/>\`);
      o.push(T(72 + bw * before / max - 12, y + 85, \`\${before}\${unit}\`, { size: 22, weight: 600, fill: '#fff', anchor: 'end' }));
      o.push(T(72, y + 140, 'Sorted by hilbert_encode(x, y)', { size: 24, fill: C.muted, op: clamp(p * 3) }));
      const aw = Math.max(4, bw * after / max * p);
      o.push(\`<rect x="72" y="\${y + 154}" width="\${aw}" height="34" fill="\${C.after}" opacity="\${clamp(p * 3)}"/>\`);
      o.push(T(72 + aw + 12, y + 179, \`\${after}\${unit}\`, { size: 22, weight: 600, fill: C.after, op: clamp((p - 0.6) * 3) }));
    };
    bar(420, 'Row groups read', 200, 2, '', 200, 17.4);
    bar(720, 'Query time', 20, 8, ' ms', 20, 18.4);
    const fOp = span(t, 19.6, 20.2);
    o.push(T(72, 1050, '2.5× faster.', { size: 60, cls: 'd', op: fOp }));
    o.push(T(72, 1110, 'The coordinate filter is unchanged; DuckDB skips', { size: 28, fill: C.muted, op: fOp }));
    o.push(T(72, 1150, 'row groups using the min/max stats it already keeps.', { size: 28, fill: C.muted, op: fOp }));
    o.push('</g>');
  }

  // ── Scene E: end card (22.2 s →).
  const eOp = span(t, 22.2, 22.8);
  if (eOp > 0) {
    o.push(\`<g opacity="\${eOp}">\`);
    o.push(\`<image href="\${ART}" x="0" y="150" width="\${W}" height="\${W / 3}" preserveAspectRatio="xMidYMid slice"/>\`);
    o.push(T(72, 620, 'Lindel for DuckDB 2.0', { size: 66, cls: 'd' }));
    o.push(T(72, 690, 'Hilbert and Morton keys that sort like your data', { size: 32, fill: C.muted }));
    ['Negative numbers, floats and dates keep their order', 'Lat/lon and bounded values on a grid', 'Box queries decomposed into key ranges'].forEach((s, i) => {
      o.push(\`<circle cx="84" cy="\${789 + i * 58}" r="6" fill="\${C.after}"/>\`, T(108, 800 + i * 58, s, { size: 30 }));
    });
    o.push(\`<rect x="72" y="1030" width="\${W - 144}" height="2" fill="\${C.rule}"/>\`);
    o.push(T(72, 1100, 'Read the post', { size: 28, fill: C.muted }));
    o.push(T(72, 1150, 'query.farm/blog/lindel-duckdb-2-curve-keys', { size: 34, weight: 600, fill: C.sun }));
    o.push('</g>');
  }
  document.getElementById('s').innerHTML = o.join('');
}
window.frame = frame;
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(page_);
await page.evaluate(() => document.fonts.ready);
const outPath = new URL('lindel-linkedin.mp4', here).pathname;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg ${c}`)) : res())));
const total = FPS * DURATION;
const stills = { 3: 'still-a', 9.4: 'still-b', 15.6: 'still-c', 21: 'lindel-linkedin-cover', 25: 'still-e' };
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  await page.evaluate(t => window.frame(t), t);
  const png = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  const still = stills[Math.round(t * 10) / 10];
  if (still && f % 3 === 0 && Math.abs(t * 10 - Math.round(t * 10)) < 1e-6) await page.screenshot({ path: new URL(`${still}.png`, here).pathname });
}
ff.stdin.end();
await done;
await browser.close();
console.log(`wrote ${outPath} (${W} × ${H}, ${DURATION} s at ${FPS} fps)`);
