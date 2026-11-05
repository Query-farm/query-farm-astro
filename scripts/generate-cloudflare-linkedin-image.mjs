import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from '@shuding/opentype.js';
import { Resvg } from '@resvg/resvg-js';

// A separate, reproducible social poster. Does not replace the live OG artwork.
// Real product marks are embedded unchanged; all lettering is outlined so the
// exported SVG and PNG render identically without installed fonts or a network.
const WIDTH = 1600;
const HEIGHT = 900;
const publicDir = new URL('../public/', import.meta.url);
const outputDir = new URL('media/posts/query-cloudflare-from-duckdb/', publicDir);
const C = { paper: '#f7f3ea', ink: '#211a12', muted: '#6f5a45', rule: '#b9aa93', gold: '#d9a441', orange: '#f6821f', cream: '#f4ece0' };
const fonts = Object.fromEntries([
  ['body', 'NotoSans-400.ttf'], ['bold', 'NotoSans-600.ttf'], ['display', 'Petrona-600.ttf'], ['wordmark', 'Petrona-700.ttf'],
].map(([key, file]) => {
  const bytes = readFileSync(new URL(`og-images/fonts/${file}`, import.meta.url));
  return [key, opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
}));
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const dataUri = (path) => `data:image/${path.endsWith('.png') ? 'png' : 'svg+xml'};base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`;
const logos = Object.fromEntries(Object.entries({
  grainlift: 'grainlift/grainlift-mark.svg', duckdb: 'vgi/icons/duckdb-mark.svg',
  haybarn: 'products/haybarn/haybarn-mark.svg', cupola: 'cupola/cupola-mark.svg',
  arrow: 'vgi/icons/apache-arrow-chevrons.svg', wasm: 'blog/query-cloudflare-from-duckdb/webassembly-logo.svg',
  farm: 'mark-strata-sun.svg',
}).map(([name, path]) => [name, dataUri(path)]));
const { icons } = JSON.parse(readFileSync(new URL('../node_modules/@iconify-json/simple-icons/icons.json', import.meta.url), 'utf8'));
for (const [name, color] of [['cloudflare', C.orange], ['python', '#3776ab'], ['webassembly', '#654ff0']]) {
  logos[name] = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="${color}">${icons[name].body}</svg>`).toString('base64')}`;
}
const img = (name, x, y, w, h = w) => `<image href="${logos[name]}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
function text(x, y, s, size = 24, face = 'body', fill = C.ink, anchor = 'start') {
  const font = fonts[face];
  const width = font.getAdvanceWidth(s, size);
  const sx = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  return `<g aria-label="${escape(s)}"><path d="${font.getPath(s, sx, y, size).toPathData(2)}" fill="${fill}"/></g>`;
}
const path = (d, stroke = C.ink, width = 2) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

const art = [
  rect(0, 0, WIDTH, HEIGHT, C.paper),
  img('farm', 64, 46, 38), text(116, 77, 'Query.Farm', 35, 'wordmark'),
  text(1536, 74, 'A LIVE SQL DEMO', 19, 'bold', C.muted, 'end'),
  text(60, 200, 'Your Cloudflare data,', 104, 'display'),
  text(60, 303, 'in DuckDB.', 115, 'display'),

  // Reflect only the data paths, leaving the real logos and type untouched.
  // Results travel from Cloudflare on the right back to DuckDB on the left.
  '<g transform="translate(1574 0) scale(-1 1)">',
  ...[430, 478, 526].map((y, i) => path(`M392 ${y}H545C588 ${y} 587 479 652 479`, i === 1 ? C.orange : C.rule, i === 1 ? 3 : 2)),
  ...[438, 478, 518].map((y, i) => path(`M922 479C994 479 977 ${y} 1040 ${y}H1163`, i === 1 ? C.gold : C.rule, i === 1 ? 3 : 2)),
  ...[438, 478, 518].map(y => path(`M1153 ${y - 8}L1163 ${y}L1153 ${y + 8}`, C.ink, 2)),
  ...[[468, 423, C.orange], [554, 471, C.orange], [444, 519, C.orange], [986, 431, C.gold], [1082, 471, C.gold], [1034, 511, C.gold]].map(([x, y, c]) => rect(x, y, 20, 14, c)),
  '</g>',
  // Main marks are deliberately large enough to read in a feed thumbnail.
  img('duckdb', 114, 358, 238),
  img('grainlift', 681, 364, 212),
  img('cloudflare', 1169, 316, 330),
  text(233, 642, 'DuckDB', 42, 'bold', C.ink, 'middle'),
  text(787, 642, 'Grainlift', 42, 'display', C.ink, 'middle'),
  text(1334, 642, 'Cloudflare', 42, 'bold', C.ink, 'middle'),
  text(233, 682, 'Your SQL. Your client.', 23, 'body', C.muted, 'middle'),
  text(787, 682, 'ADBC · vgi-rpc over HTTPS', 22, 'body', C.muted, 'middle'),
  text(1334, 682, 'Durable Objects · D1', 23, 'body', C.muted, 'middle'),
  text(1334, 713, 'Analytics Engine', 23, 'body', C.muted, 'middle'),
  // Apache Arrow's real mark annotates the result path, rather than implying
  // that arbitrary native ADBC drivers can themselves run inside a browser.
  img('arrow', 380, 565, 72, 31),
  text(460, 588, 'Apache Arrow', 22, 'bold', C.muted),

  path('M64 754H1536', C.ink, 2),
  text(64, 793, 'IN YOUR BROWSER', 17, 'bold', C.muted),
  img('haybarn', 64, 812, 40), text(116, 842, 'Haybarn', 25),
  img('cupola', 254, 811, 42), text(307, 842, 'Cupola', 25),
  img('webassembly', 450, 815, 33), text(497, 842, 'WebAssembly', 23),
  path('M748 787V858', C.rule, 1),
  text(797, 793, 'OR CONNECT NATIVELY', 17, 'bold', C.muted),
  path('M799 821L810 832L799 843M818 843H831', C.ink, 2.4),
  text(848, 842, 'Terminal', 25),
  img('python', 1004, 814, 37), text(1054, 842, 'Python', 25),
  text(1536, 842, 'query.farm', 27, 'wordmark', C.ink, 'end'),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc"><title id="title">Your Cloudflare data, in DuckDB.</title><desc id="desc">Cloudflare's Durable Objects, D1, and Analytics Engine connect through the Grainlift ADBC driver using vgi-rpc over HTTPS. Apache Arrow results arrive in DuckDB. Query in a browser with Haybarn, Cupola, and WebAssembly, or connect natively from a terminal or Python.</desc>${art.join('\n')}</svg>\n`;
mkdirSync(outputDir, { recursive: true });
writeFileSync(new URL('linkedin.svg', outputDir), svg);
writeFileSync(new URL('linkedin.png', outputDir), new Resvg(svg).render().asPng());
console.log(`Generated ${fileURLToPath(new URL('linkedin.png', outputDir))} (${WIDTH} × ${HEIGHT})`);
