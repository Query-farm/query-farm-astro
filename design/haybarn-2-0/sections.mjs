// Section artwork for the Haybarn 2.0 post, in the lead piece's paper style.
//
//   node design/haybarn-2-0/sections.mjs   → design/haybarn-2-0/art-*.{svg,png}
import { C, canvas, svgDoc, render } from './paper.mjs';

const W = 1440, H = 400;
const pieces = [];
const thread = (paths, { dashed = false, width = 1.6 } = {}) =>
  `<g fill="none" stroke="${C.ink}" stroke-width="${width}" stroke-linecap="round" opacity="0.8"${dashed ? ' stroke-dasharray="2 7"' : ''}>${paths.join('')}</g>`;

// ── What Haybarn adds: patch strips laid onto a base slab, a few still arriving.
{
  const { paper, raw, out, j } = canvas(3);
  const baseX = 300, baseY = 300, baseW = 840;
  const laid = [];
  const strips = [C.sage, C.ochre, C.terra, C.moss, C.cream, C.ochre, C.sage];
  let y = baseY;
  strips.forEach((fill, i) => {
    const h = 22 + (i % 3) * 3;
    y -= h + 6;
    const w = baseW - 70 - i * 64 + j(20);
    const x = baseX + (baseW - w) / 2 + j(26);
    laid.push([`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" fill="${fill}" transform="rotate(${j(0.7).toFixed(2)} ${x + w / 2} ${y + h / 2})"/>`, i % 2 === 0]);
  });
  const top = y;
  // Three strips still on their way in, their paths drawn as dotted threads.
  const arriving = [
    { x: 80, y: 60, w: 190, r: -9, fill: C.terra, to: [580, top + 4] },
    { x: 1170, y: 40, w: 170, r: 7, fill: C.moss, to: [850, top + 4] },
    { x: 1230, y: 196, w: 140, r: -5, fill: C.ochre, to: [1010, 247] },
  ];
  raw(thread(arriving.map(a => {
    const sx = a.x + a.w / 2, sy = a.y + 34, [tx, ty] = a.to;
    return `<path d="M${sx} ${sy} C ${sx} ${sy + 80}, ${tx} ${ty - 90}, ${tx} ${ty - 6}"/>`;
  }), { dashed: true }));
  paper(`<rect x="${baseX}" y="${baseY}" width="${baseW}" height="58" fill="${C.umber}"/>`, true);
  laid.forEach(([svg, fibre]) => paper(svg, fibre));
  arriving.forEach(a => paper(`<rect x="${a.x}" y="${a.y}" width="${a.w}" height="26" fill="${a.fill}" transform="rotate(${a.r} ${a.x + a.w / 2} ${a.y + 13})"/>`, true));
  paper(arriving.map(a => `<circle cx="${a.to[0]}" cy="${a.to[1] - 6}" r="5" fill="${C.ink}"/>`).join(''));
  pieces.push({ name: 'art-patches', W, H, svg: svgDoc(W, H, out.join('\n')) });
}

// ── Bug fixes: sharp shards on the left, a rasp, smooth pebbles on the right.
{
  const { paper, raw, out, j, rnd } = canvas(17);
  const colours = [C.terra, C.ochre, C.moss, C.sage, C.umber, C.cream];
  const shard = (cx, cy, r, fill) => {
    const n = 3 + Math.floor(rnd() * 3);
    const a0 = rnd() * Math.PI * 2;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = a0 + (k / n) * Math.PI * 2 + j(0.35);
      const rr = r * (0.55 + rnd() * 0.75);
      return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    });
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };
  const spots = [
    [110, 120, 46], [210, 250, 52], [300, 110, 38], [370, 300, 34], [420, 190, 44], [130, 330, 30], [520, 90, 28], [520, 300, 26],
  ];
  spots.forEach(([x, y, r], i) => paper(shard(x, y, r, colours[i % colours.length]), r > 40));
  // The rasp: a long tilted bar with a cross-cut face and a handle.
  const rasp = `<g transform="translate(-40 6) rotate(-24 720 200)">
    <rect x="560" y="182" width="300" height="38" rx="5" fill="${C.sage}"/>
    <path d="${Array.from({ length: 26 }, (_, k) => `M${572 + k * 11} 186 l8 30`).join(' ')}" stroke="${C.moss}" stroke-width="2.4" opacity="0.65"/>
    <rect x="860" y="190" width="120" height="22" rx="10" fill="${C.umber}"/>
  </g>`;
  raw(thread([`<path d="M180 200 C 330 160, 420 360, 600 330 S 860 380, 960 300 S 1120 190, 1300 210"/>`], { dashed: true }));
  paper(rasp);
  // Filings dropping below the rasp.
  paper(Array.from({ length: 22 }, () => `<circle cx="${(650 + rnd() * 170).toFixed(1)}" cy="${(268 + rnd() * 90).toFixed(1)}" r="${(1.6 + rnd() * 2.4).toFixed(1)}" fill="${colours[Math.floor(rnd() * 4)]}"/>`).join(''));
  const pebbles = [
    [1000, 130, 54, 38], [1130, 250, 62, 42], [1250, 120, 44, 32], [1300, 290, 46, 30], [1040, 310, 38, 26], [1370, 190, 34, 26], [1180, 70, 30, 22],
  ];
  pebbles.forEach(([x, y, rx, ry], i) => paper(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${colours[i % colours.length]}" transform="rotate(${j(18).toFixed(1)} ${x} ${y})"/>`, rx > 50));
  pieces.push({ name: 'art-fixes', W, H, svg: svgDoc(W, H, out.join('\n')) });
}

// ── WebAssembly startup: five tiles arriving together at a browser window.
{
  const { paper, raw, out } = canvas(29);
  const bx = 900, by = 64, bw = 430, bh = 272;
  const tiles = [C.ochre, C.moss, C.terra, C.sage, C.umber];
  const slots = tiles.map((_, i) => [bx + 46 + i * 70, by + 150]);
  const lanes = tiles.map((_, i) => 96 + i * 52);
  const endY = (i) => by + 96 + i * 36;
  raw(thread(lanes.map((ly, i) => {
    const [sx, sy] = slots[i];
    const ey = endY(i);
    return `<path d="M120 ${ly} C 520 ${ly}, ${bx - 300} ${ey}, ${bx - 4} ${ey}"/>`;
  })));
  paper(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${C.cream}"/>`);
  paper(`<path d="M${bx} ${by + 10} a10 10 0 0 1 10 -10 h${bw - 20} a10 10 0 0 1 10 10 v30 h${-bw} z" fill="${C.sage}"/>`);
  paper([C.terra, C.ochre, C.moss].map((f, i) => `<circle cx="${bx + 24 + i * 22}" cy="${by + 20}" r="6" fill="${f}"/>`).join(''));
  // Settled tiles inside the window, plus ghosts trailing in on each lane.
  tiles.forEach((fill, i) => {
    const [sx, sy] = slots[i];
    paper(`<rect x="${sx}" y="${sy}" width="52" height="48" rx="3" fill="${fill}"/>`, true);
    const ly = lanes[i];
    [[330, 0.35], [470, 0.6], [610, 0.85]].forEach(([gx, o]) => {
      const t = (gx - 120) / (bx - 4 - 120);
      const gy = ly + (endY(i) - ly) * (t * t * (3 - 2 * t));
      raw(`<g opacity="${o}">`);
      paper(`<rect x="${gx - 15}" y="${(gy - 12).toFixed(1)}" width="30" height="24" rx="2" fill="${fill}"/>`);
      raw('</g>');
    });
  });
  paper(lanes.map((ly, i) => `<circle cx="120" cy="${ly}" r="6" fill="${tiles[i]}"/><circle cx="${bx - 4}" cy="${endY(i)}" r="4.5" fill="${C.ink}"/>`).join(''));
  pieces.push({ name: 'art-startup', W, H, svg: svgDoc(W, H, out.join('\n')) });
}

// ── DuckDB 2.0.1 is close: November 2026, with today, the freeze and the release.
{
  const { paper, raw, out, j } = canvas(41);
  const s = 46, g = 10, cols = 7;
  const gx = (W - (cols * (s + g) - g)) / 2, gy = 64;
  const firstWeekday = 0; // November 1, 2026 is a Sunday
  const marks = { 5: C.moss, 11: C.ochre, 18: C.terra };
  const at = (day) => {
    const idx = firstWeekday + day - 1;
    return [gx + (idx % cols) * (s + g), gy + Math.floor(idx / cols) * (s + g)];
  };
  const centre = (d) => { const [x, y] = at(d); return [x + s / 2, y + s / 2]; };
  for (let d = 1; d <= 30; d++) {
    const [x, y] = at(d);
    const fill = marks[d] ?? (d < 5 ? '#d9cfb8' : C.cream);
    paper(`<rect x="${(x + j(1.5)).toFixed(1)}" y="${(y + j(1.5)).toFixed(1)}" width="${s}" height="${s}" rx="2" fill="${fill}" transform="rotate(${j(1.6).toFixed(1)} ${x + s / 2} ${y + s / 2})"/>`, !!marks[d]);
  }
  const c = centre(18);
  // A hand-cut ring around release day.
  const ring = (r) => `M${c[0] - r} ${c[1]} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  paper(`<path d="${ring(44)} ${ring(35)}" fill="${C.terra}" fill-rule="evenodd"/>`);
  // Loose leaves either side so the grid doesn't sit alone.
  [[250, 120, 70, C.sage, -12], [170, 270, 56, C.ochre, 9], [1190, 110, 64, C.moss, 10], [1270, 260, 76, C.terra, -8], [330, 330, 40, C.umber, 20], [1120, 320, 44, C.ochre, -16]]
    .forEach(([x, y, w, f, r]) => paper(`<rect x="${x - w / 2}" y="${y - w * 0.36}" width="${w}" height="${w * 0.72}" fill="${f}" transform="rotate(${r} ${x} ${y})"/>`, w > 60));
  pieces.push({ name: 'art-calendar', W, H, svg: svgDoc(W, H, out.join('\n')) });
}

await render(pieces);
