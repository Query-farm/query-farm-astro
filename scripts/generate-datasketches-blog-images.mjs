// Generate the DataSketches memory-limit article's figures and social card.
// Run explicitly and commit the output, as with the other blog image generators.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, wordmark, COLORS } from './og-images/render.mjs';

const slug = 'datasketches-memory-limit-spilling';
const figures = fileURLToPath(new URL(`../public/blog/${slug}/`, import.meta.url));
const media = fileURLToPath(new URL(`../public/media/posts/${slug}/`, import.meta.url));

// Validated with the dataviz palette checker on soil-50 paper: amber is the old
// release, blue is the new one. Both pass CVD separation and 3:1 contrast.
const BEFORE = '#a9762e';
const AFTER = '#2e5fb8';
const INK = COLORS.soil900;
const MUTED = COLORS.soil700;
const RULE = COLORS.soil300;
const PAPER = COLORS.soilPaper;
const FONT = "'Noto Sans', 'Helvetica Neue', Arial, sans-serif";

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x, y, s, { size = 13, fill = INK, anchor = 'start', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;

// Peak resident memory (GB) and wall time (s), 20M rows over 2M groups,
// 8 threads, memory_limit 1GB. A previous-release run with `stopped` set was
// killed before it finished, so its memory is a lower bound and it has no time.
const runs = [
  { name: 'TDigest', before: 83, after: 1.05, t0: 43, t1: 9.2 },
  { name: 'Array of Doubles', before: 60, after: 1.09, t1: 18.3, stopped: true },
  { name: 'KLL', before: 39, after: 0.77, t0: 22, t1: 6.0 },
  { name: 'Tuple', before: 43.4, after: 1.08, t0: 33.9, t1: 16.1 },
  { name: 'Bloom filter', before: 24, after: 0.75, t1: 6.9, stopped: true },
  { name: 'REQ', before: 29.3, after: 1.07, t0: 21.4, t1: 9.2 },
  { name: 'VarOpt', before: 24, after: 1.01, t1: 9, stopped: true },
  { name: 'Count-Min', before: 24, after: 1.02, t1: 9.5, stopped: true },
  { name: 'Theta', before: 22.8, after: 1.01, t0: 22.4, t1: 16.0 },
  { name: 'EBPPS', before: 13.9, after: 1.02, t0: 21, t1: 9 },
  { name: 'Frequent items', before: 8.5, after: 1.01, t0: 14, t1: 9.6 },
  { name: 'Quantiles', before: 4.3, after: 0.77, t0: 17.1, t1: 7.1 },
  { name: 'CPC', before: 3.6, after: 0.77, t0: 10.4, t1: 7.7 },
  { name: 'HLL', before: 3.3, after: 0.82, t0: 9.6, t1: 6.9 },
  { name: 'Density', before: 3.9, after: 1.12, t0: 10.1, t1: 7.6 },
].map(r => ({ ...r, less: r.before / r.after, faster: r.t0 ? r.t0 / r.t1 : undefined }))
  .sort((a, b) => b.less - a.less);

// Two bar panels sharing one row order (by memory saved), so each sketch reads
// straight across. One measure per panel, each on its own linear scale.
function reductionChart() {
  const W = 760, names = 120, gap = 36, top = 86, rowH = 24, barH = 14;
  const panelW = (W - names - gap - 16) / 2;
  const H = top + runs.length * rowH + 52;
  const x0 = [names, names + panelW + gap];
  const maxLess = 80, maxFaster = 5;
  const fmt = v => (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×';
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  out.push(text(16, 26, 'What the DuckDB 2.0 release changed, per sketch family', { size: 16, weight: 700 }));
  out.push(text(16, 46, 'Same GROUP BY: 20M rows, 2M groups, 8 threads, memory_limit = 1 GB', { size: 11.5, fill: MUTED }));
  out.push(text(x0[0], 74, 'Times less peak memory', { size: 13, weight: 600 }));
  out.push(text(x0[1], 74, 'Times faster', { size: 13, weight: 600 }));
  const bottom = top + runs.length * rowH;
  // Recessive gridlines.
  for (const v of [20, 40, 60, 80]) {
    const gx = (x0[0] + (v / maxLess) * (panelW - 44)).toFixed(1);
    out.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${bottom}" stroke="${RULE}" opacity="0.6"/>`);
    out.push(text(gx, bottom + 16, `${v}×`, { size: 10.5, fill: MUTED, anchor: 'middle' }));
  }
  for (const v of [1, 2, 3, 4, 5]) {
    const gx = (x0[1] + (v / maxFaster) * (panelW - 44)).toFixed(1);
    out.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${bottom}" stroke="${RULE}" opacity="${v === 1 ? 1 : 0.6}"/>`);
    out.push(text(gx, bottom + 16, `${v}×`, { size: 10.5, fill: MUTED, anchor: 'middle' }));
  }
  // A bar with only its data end rounded, anchored flat at the baseline.
  const bar = (x, y, w, opacity = 1) => {
    const r = Math.min(4, w / 2);
    return `<path d="M ${x} ${y} H ${(x + w - r).toFixed(1)} Q ${(x + w).toFixed(1)} ${y} ${(x + w).toFixed(1)} ${y + r} V ${y + barH - r} Q ${(x + w).toFixed(1)} ${y + barH} ${(x + w - r).toFixed(1)} ${y + barH} H ${x} Z" fill="${AFTER}" opacity="${opacity}"/>`;
  };
  runs.forEach((r, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    const cy = y + barH / 2 + 4;
    out.push(text(names - 12, cy, r.name, { size: 12.5, anchor: 'end' }));
    const wl = (r.less / maxLess) * (panelW - 44);
    out.push(bar(x0[0], y, wl, r.stopped ? 0.45 : 1));
    out.push(text((x0[0] + wl + 6).toFixed(1), cy, (r.stopped ? 'at least ' : '') + fmt(r.less), { size: 11.5, fill: MUTED }));
    if (r.faster) {
      const wf = (r.faster / maxFaster) * (panelW - 44);
      out.push(bar(x0[1], y, wf));
      out.push(text((x0[1] + wf + 6).toFixed(1), cy, fmt(r.faster), { size: 11.5, fill: MUTED }));
    } else {
      out.push(text(x0[1] + 8, cy, `didn't finish before; now ${r.t1} s`, { size: 11.5, fill: MUTED }));
    }
  });
  out.push(`<rect x="${x0[0]}" y="${bottom + 30}" width="14" height="10" rx="2" fill="${AFTER}" opacity="0.45"/>`);
  out.push(text(x0[0] + 20, bottom + 39, 'Pale bar: the previous-release run was stopped before it finished, so the true reduction is larger.', { size: 11, fill: MUTED }));
  out.push(`<line x1="${x0[0]}" y1="${top}" x2="${x0[0]}" y2="${bottom}" stroke="${COLORS.soil600}"/>`);
  out.push(`<line x1="${x0[1]}" y1="${top}" x2="${x0[1]}" y2="${bottom}" stroke="${COLORS.soil600}"/>`);
  out.push('</svg>');
  return { svg: out.join('\n'), width: W, height: H };
}

// Where an aggregate state's memory lives, before and after.
function stateLayoutDiagram() {
  const W = 760, H = 400;
  const box = (x, y, w, h, { fill = PAPER, stroke = RULE, dash = '', r = 6 } = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const arrow = (x1, y1, x2, y2, color = MUTED) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" marker-end="url(#head)"/>`;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
  out.push(`<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${MUTED}"/></marker></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

  // Left panel: previous release.
  out.push(text(24, 32, 'Previous release', { size: 15, weight: 700, fill: BEFORE }));
  out.push(box(24, 48, 336, 100, { fill: COLORS.soil200 + '55', stroke: COLORS.soil600 }));
  out.push(text(38, 70, 'DuckDB aggregate memory', { size: 12.5, weight: 600 }));
  out.push(text(38, 87, 'counted toward memory_limit, can spill', { size: 11, fill: MUTED }));
  // Each state is only a pointer; the sketch it points to sits outside.
  for (let i = 0; i < 3; i++) {
    const x = 38 + i * 106;
    out.push(box(x, 102, 96, 30, { r: 3, stroke: COLORS.soil600 }));
    out.push(text(x + 48, 121, `state ${i + 1}: pointer`, { size: 10.5, anchor: 'middle' }));
    out.push(arrow(x + 48, 132, x + 48, 196));
  }
  out.push(box(24, 182, 336, 186, { fill: 'none', stroke: BEFORE, dash: '5 4' }));
  for (let i = 0; i < 3; i++) {
    const x = 38 + i * 106;
    out.push(box(x, 198, 96, 66, { r: 4, stroke: BEFORE }));
    out.push(text(x + 48, 226, 'full sketch', { size: 11, anchor: 'middle' }));
    out.push(text(x + 48, 243, '~1.6 KB at birth', { size: 10.5, fill: MUTED, anchor: 'middle' }));
  }
  out.push(text(38, 296, 'C++ heap', { size: 12.5, weight: 600 }));
  out.push(text(38, 313, 'invisible to DuckDB: not counted toward', { size: 11, fill: MUTED }));
  out.push(text(38, 329, 'memory_limit and never spills', { size: 11, fill: MUTED }));

  // Right panel: DuckDB 2.0 release.
  const ox = 400;
  out.push(text(ox, 32, 'DuckDB 2.0 release', { size: 15, weight: 700, fill: AFTER }));
  out.push(box(ox, 48, 336, 212, { fill: '#2e5fb80f', stroke: AFTER }));
  out.push(text(ox + 14, 70, 'DuckDB aggregate arena', { size: 12.5, weight: 600 }));
  out.push(text(ox + 14, 87, 'counted toward memory_limit, can spill', { size: 11, fill: MUTED }));
  out.push(box(ox + 14, 102, 148, 40, { r: 4, stroke: AFTER }));
  out.push(text(ox + 22, 119, 'state 1: buffer', { size: 11 }));
  out.push(text(ox + 22, 134, 'up to 32 values', { size: 10.5, fill: MUTED }));
  out.push(box(ox + 174, 102, 148, 40, { r: 4, stroke: AFTER }));
  out.push(text(ox + 182, 119, 'state 2: buffer', { size: 11 }));
  out.push(text(ox + 182, 134, 'a few values', { size: 10.5, fill: MUTED }));
  out.push(box(ox + 14, 152, 308, 52, { r: 4, stroke: AFTER }));
  out.push(text(ox + 22, 171, 'state 3: sketch, built after 32 values', { size: 11 }));
  out.push(text(ox + 22, 188, 'it and everything it allocates live in the arena', { size: 10.5, fill: MUTED }));
  out.push(box(ox + 14, 214, 308, 32, { r: 4, stroke: RULE, dash: '3 3' }));
  out.push(text(ox + 22, 234, 'scratch arena: temporaries, freed after each call', { size: 10.5, fill: MUTED }));
  out.push(arrow(ox + 168, 260, ox + 168, 290));
  out.push(text(ox + 178, 280, 'memory runs short', { size: 10.5, fill: MUTED }));
  out.push(box(ox, 292, 336, 76, { stroke: COLORS.soil600 }));
  out.push(text(ox + 14, 314, 'Spill to disk', { size: 12.5, weight: 600 }));
  out.push(text(ox + 14, 332, 'buffers are written as raw values,', { size: 11, fill: MUTED }));
  out.push(text(ox + 14, 348, 'sketches as serialized bytes', { size: 11, fill: MUTED }));
  out.push('</svg>');
  return { svg: out.join('\n'), width: W, height: H };
}

mkdirSync(figures, { recursive: true });
mkdirSync(media, { recursive: true });
const chart = reductionChart();
writeFileSync(`${figures}reduction.svg`, chart.svg);
writeFileSync(`${figures}state-layout.svg`, stateLayoutDiagram().svg);
console.log(`Generated ${figures}reduction.svg (${chart.width}×${chart.height})`);
console.log(`Generated ${figures}state-layout.svg`);

// Social card: the headline result beside the title.
const article = readFileSync(new URL(`../src/content/blog/${slug}.md`, import.meta.url), 'utf8');
const title = JSON.parse(article.match(/^title: (".*")$/m)[1]);
const node = (type, style, children, extra = {}) => ({ type, props: { style, children, ...extra } });
const stat = (value, label, color) => node('div', { display: 'flex', flexDirection: 'column' }, [
  node('div', { fontFamily: 'Petrona', fontSize: 88, fontWeight: 700, lineHeight: 1, color }, value),
  node('div', { fontSize: 22, color: COLORS.soil700, marginTop: 8 }, label),
]);
const card = node('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 1200, height: 630, padding: '48px 64px', backgroundColor: COLORS.soilPaper, color: COLORS.soil900, fontFamily: 'Noto Sans', borderBottom: `18px solid ${COLORS.sun300}` }, [
  node('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
    wordmark({ size: 'sm' }),
    node('div', { fontSize: 18, letterSpacing: 2, color: COLORS.soil700 }, 'DUCKDB / DATASKETCHES'),
  ]),
  node('div', { fontFamily: 'Petrona', fontSize: 56, fontWeight: 700, lineHeight: 1.08, maxWidth: 1060 }, title),
  node('div', { display: 'flex', alignItems: 'flex-end', gap: 56 }, [
    stat('39 GB', 'KLL GROUP BY, before', BEFORE),
    stat('0.77 GB', 'after, with a 1 GB limit', AFTER),
    stat('3.7×', 'faster', COLORS.soil900),
  ]),
]);
writeFileSync(`${media}social.png`, await renderToPng(card));
console.log(`Generated ${media}social.png`);
