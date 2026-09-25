import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Embed the existing brand assets so the SVG is self-contained in <img> tags
// and in the social-card renderer. Keep the original logo artwork and colours.
const duckdbMark = readFileSync(new URL('../public/vgi/icons/duckdb-mark.svg', import.meta.url), 'utf8')
  .replace(/^<svg[^>]*>/, '<svg x="42" y="90" width="44" height="44" viewBox="217.6 10 334.4 334.4">');
const vgiEmblem = readFileSync(new URL('../public/vgi/vgi-emblem.png', import.meta.url)).toString('base64');

// A repeatable drawing, not a new illustration on every build. Keep neighbouring
// curves ordered: randomness changes the ribbon's silhouette, never its topology.
let seed = 20260925;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const n = (value) => Number(value.toFixed(2));
const colors = { paper: '#f7f3ea', ink: '#211a12', green: '#355627', gold: '#7d5714', muted: '#8a775e' };
const incoming = [];
const reuse = [];
const detour = [];

// Fine, parallel request traces gather in an S-shaped ribbon. A little lateral
// drift gives it the character of a pen drawing without making a tangled graph.
for (let i = 0; i < 31; i++) {
  const t = i / 30;
  const y = 36 + t * 139;
  const drift = random() * 3;
  incoming.push(`<path d="M 64 112 C ${n(105 + drift)} ${n(y - 44)}, 168 ${n(85 + t * 54)}, 281 112" stroke="${i % 6 === 0 ? colors.gold : colors.muted}" stroke-opacity="${i % 6 === 0 ? 0.57 : 0.27}" stroke-width="${i % 6 === 0 ? 1.1 : 0.8}"/>`);
}

// Cache misses travel around the outside. The two ordered fans meet at the
// worker, making a broad, leaf-shaped loop with generous white space inside.
for (let i = 0; i < 23; i++) {
  const t = i / 22;
  const top = -14 + t * 79;
  const bottom = 223 - t * 64;
  detour.push(`<path d="M 281 112 C 339 ${n(top)}, 552 ${n(top)}, 643 112 C 614 ${n(bottom)}, 515 ${n(bottom)}, 464 112" stroke="${colors.gold}" stroke-opacity="${i % 5 === 0 ? 0.7 : 0.27}" stroke-width="${i % 5 === 0 ? 1.15 : 0.8}"/>`);
}

// The shorter green bundle nests inside the worker route. A highlighted strand
// and a small directional marker keep the reading clear at thumbnail size.
for (let i = 0; i < 21; i++) {
  const t = i / 20;
  const bend = 60 + t * 113;
  reuse.push(`<path d="M 281 112 C 334 ${n(bend)}, 423 ${n(bend)}, 464 112" stroke="${colors.green}" stroke-opacity="${i % 5 === 0 ? 0.83 : 0.39}" stroke-width="${i % 5 === 0 ? 1.3 : 0.85}"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="228" viewBox="0 0 720 228" role="img" aria-labelledby="title desc">
  <title id="title">Reuse takes the shorter path</title>
  <desc id="desc">Repeated agent queries reach DuckDB, marked with its duck logo, and converge at the client cache. Green Bézier curves reuse an eligible result without another service call. A wider ochre loop visits an API-backed VGI worker, marked with the Vector Gateway Interface emblem. The paths illustrate reuse and computation, not measured timings.</desc>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${incoming.join('\n    ')}
    ${detour.join('\n    ')}
    ${reuse.join('\n    ')}
  </g>

  <!-- Selected paths remain legible among the fine engraving. -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 281 112 C 334 136, 423 136, 464 112" stroke="${colors.paper}" stroke-width="5"/>
    <path d="M 281 112 C 334 136, 423 136, 464 112" stroke="${colors.green}" stroke-width="1.8"/>
    <path d="M 369 126 L 375 130 L 369 133" stroke="${colors.green}" stroke-width="1.8"/>
    <path d="M 281 112 C 339 -14, 552 -14, 643 112" stroke="${colors.gold}" stroke-width="1.5"/>
    <path d="M 552 35 L 557 42 L 549 42" stroke="${colors.gold}" stroke-width="1.5"/>
    <path d="M 566 191 L 560 195 L 566 199" stroke="${colors.gold}" stroke-width="1.5"/>
  </g>

  <!-- Brand endpoints flank the cache and result; a hit bypasses the worker. -->
  <g fill="${colors.paper}">
    <circle cx="64" cy="112" r="28"/>
    <circle cx="281" cy="112" r="13" stroke="${colors.green}" stroke-width="1"/>
    <circle cx="281" cy="112" r="7" fill="${colors.green}"/>
    <circle cx="281" cy="112" r="2" fill="${colors.paper}"/>
    <circle cx="464" cy="112" r="10" stroke="${colors.green}" stroke-width="1.4"/>
    <circle cx="464" cy="112" r="3.5" fill="${colors.green}"/>
    <ellipse cx="643" cy="112" rx="46" ry="36"/>
  </g>
  ${duckdbMark}
  <image x="603" y="82.6" width="80" height="58.8" href="data:image/png;base64,${vgiEmblem}"/>

  <g font-family="Commissioner, system-ui, sans-serif" text-anchor="middle">
    <text x="377" y="102" fill="${colors.green}" stroke="${colors.paper}" stroke-width="5" paint-order="stroke" stroke-linejoin="round" font-size="10" font-weight="500" letter-spacing="1.5">REUSE</text>
    <g fill="${colors.ink}" font-size="12">
      <text x="64" y="213">DuckDB</text>
      <text x="281" y="213">Client cache</text>
      <text x="464" y="213">Result</text>
      <text x="643" y="213">VGI worker</text>
    </g>
    <text x="64" y="197" fill="${colors.ink}" font-size="9">Repeated agent queries</text>
    <text x="643" y="197" fill="${colors.ink}" font-size="9">API-backed service</text>
  </g>
</svg>
`;

const directory = new URL('../public/blog/cache-control-for-remote-functions/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('cache-bezier-lead.svg', directory), svg);
