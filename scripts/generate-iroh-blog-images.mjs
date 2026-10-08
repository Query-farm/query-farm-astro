import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import opentype from '@shuding/opentype.js';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

// Outlined site typography, real project marks, and simple routing lines.
// Iroh's original wordmark: https://www.iroh.computer/img/logo/iroh-wordmark-purple.svg
const publicDir = new URL('../public/', import.meta.url);
const articleDir = new URL('blog/iroh-vgi-rpc/', publicDir);
const socialDir = new URL('media/posts/iroh-vgi-rpc/', publicDir);
mkdirSync(articleDir, { recursive: true });
mkdirSync(socialDir, { recursive: true });
const fonts = Object.fromEntries([
  ['body', 'NotoSans-400.ttf'], ['bold', 'NotoSans-600.ttf'], ['display', 'Petrona-600.ttf'],
].map(([key, file]) => {
  const bytes = readFileSync(new URL(`og-images/fonts/${file}`, import.meta.url));
  return [key, opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
}));
const ink = '#211a12', muted = '#5d4632', rule = '#b7aa94', paper = '#f7f3ea';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const logos = Object.fromEntries(Object.entries({
  haybarn: 'products/haybarn/haybarn-mark.svg', grainlift: 'grainlift/grainlift-mark.svg',
  farm: 'media-kit/logo/mark.svg', vgi: 'vgi/vgi-logo.png',
  vgiLarge: 'blog/iroh-vgi-rpc/vgi-logo.png',
  arrow: 'blog/query-cloudflare-from-duckdb/apache-arrow-logo.svg',
  wasm: 'blog/query-cloudflare-from-duckdb/webassembly-logo.svg',
  iroh: 'blog/iroh-vgi-rpc/iroh-wordmark.svg',
}).map(([name, path]) => [name, `data:image/${path.endsWith('.png') ? 'png' : 'svg+xml'};base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`]));
const logo = (name, x, y, w, h = w) => `<image href="${logos[name]}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
function text(x, y, content, size = 18, face = 'body', color = ink) {
  return `<g aria-label="${escape(content)}"><path d="${fonts[face].getPath(content, x, y, size).toPathData(2)}" fill="${color}"/></g>`;
}
const heading = (x, y, label, size = 29) => text(x, y, label, size, 'display');
const note = (x, y, label, size = 16) => text(x, y, label, size, 'body', muted);
const line = (d, arrow = false, dashed = false, color = ink) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 5"' : ''}${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
const hr = (x, y, w) => line(`M${x} ${y}h${w}`, false, false, rule);
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${paper}" stroke="${ink}" stroke-width="1.5"/>`;
function svg(width, height, title, desc, parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(desc)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke="${ink}" stroke-width="1.2"/></marker></defs>${parts.join('\n')}</svg>\n`;
}
const title = 'SQL in your browser, code and data on your machine—with Iroh';
const desc = 'Haybarn in the browser sends vgi-rpc calls and receives Arrow data over Iroh. Browser traffic passes through a relay and is encrypted to the remote Iroh endpoint. On your computer, a bridge connects to a VGI worker, or a Grainlift gateway connects to a database through its native ADBC driver. These are two alternative endpoints.';
writeFileSync(new URL('architecture.svg', articleDir), svg(1000, 560, title, desc, [
  heading(28, 46, 'In your browser'), hr(28, 65, 226),
  heading(558, 46, 'On your computer or server'), hr(558, 65, 412),
  logo('haybarn', 28, 102, 44), heading(87, 133, 'Haybarn', 28),
  logo('wasm', 28, 171, 42, 36), note(87, 197, 'WebAssembly', 17),
  note(28, 263, 'VGI or Grainlift'), note(28, 289, 'client extension'),
  logo('iroh', 323, 119, 111, 38),
  line('M257 221H359', true), dot(376, 221),
  line('M393 221H507V144H541', true), line('M507 221V334H541', true),
  text(352, 258, 'Relay', 19, 'bold'), note(304, 290, 'Encrypted traffic'),
  note(290, 363, 'The relay cannot read'), note(308, 388, 'calls or results.'),
  logo('vgi', 558, 116, 44), heading(619, 144, 'VGI', 29),
  note(619, 174, 'via vgi-iroh-bridge'),
  note(558, 215, 'Your code, native libraries, local files'),
  text(558, 245, 'Expose tables and functions', 19, 'bold'),
  hr(558, 273, 412),
  logo('grainlift', 558, 306, 44), heading(619, 334, 'Grainlift', 29),
  note(619, 364, 'Iroh built into the gateway'),
  note(558, 405, 'Native ADBC driver to your database'),
  text(558, 435, 'Expose a database through ADBC', 19, 'bold'),
  hr(28, 474, 942), logo('farm', 28, 495, 31),
  text(74, 521, 'vgi-rpc carries the calls.', 20),
  logo('arrow', 474, 486, 108, 56), text(607, 521, 'Apache Arrow carries the data.', 20),
]));
writeFileSync(new URL('architecture-mobile.svg', articleDir), svg(400, 860, title, desc, [
  heading(20, 40, 'In your browser'), hr(20, 56, 360),
  logo('haybarn', 20, 79, 39), heading(73, 107, 'Haybarn', 26),
  logo('wasm', 300, 80, 57, 44), note(20, 148, 'VGI or Grainlift client extension'),
  line('M43 179V219', true), dot(43, 239), line('M43 260V330', true),
  logo('iroh', 92, 181, 98, 34), text(92, 247, 'Relay', 20, 'bold'),
  note(92, 277, 'Forwards encrypted traffic.'),
  note(92, 304, 'Cannot read calls or results.'),
  heading(20, 378, 'On your computer or server', 26), hr(20, 397, 360),
  logo('vgi', 20, 419, 42), heading(80, 448, 'VGI', 28),
  note(80, 476, 'via vgi-iroh-bridge'),
  note(20, 516, 'Your code, native libraries, local files'),
  text(20, 546, 'Expose tables and functions', 19, 'bold'),
  hr(20, 572, 360),
  logo('grainlift', 20, 594, 42), heading(80, 623, 'Grainlift', 28),
  note(80, 651, 'Iroh built into the gateway'),
  note(20, 691, 'Native ADBC driver to your database'),
  text(20, 721, 'Expose a database through ADBC', 19, 'bold'),
  hr(20, 751, 360), logo('farm', 20, 775, 28), note(64, 797, 'Calls via vgi-rpc'),
  note(64, 827, 'Data in Apache Arrow batches'),
]));

const pathTitle = 'The browser uses a relay; native clients can connect directly';
const pathDesc = 'Browser Iroh connections always go through a relay. Native clients can connect directly when the network permits, with relay fallback. In both cases encryption is between the client and the remote Iroh endpoint. For a Python worker, that endpoint is the bridge, followed by a separate loopback HTTP connection to the worker.';
writeFileSync(new URL('paths.svg', articleDir), svg(1000, 470, pathTitle, pathDesc, [
  heading(28, 44, 'Native client'), heading(754, 44, 'Iroh endpoint'),
  note(28, 76, 'CLI or application'), note(754, 76, 'Bridge or gateway'),
  dot(154, 114), line('M171 114H812', true), dot(835, 114),
  text(377, 102, 'Direct when possible', 20, 'bold'),
  line('M154 133V192H431', true, true), dot(451, 192),
  line('M472 192H835V133', true, true), note(480, 183, 'Relay fallback'),
  hr(28, 236, 942),
  heading(28, 288, 'Browser client'), heading(754, 288, 'Iroh endpoint'),
  dot(154, 338), line('M171 338H431', true), dot(451, 338),
  line('M472 338H812', true), dot(835, 338),
  text(391, 318, 'Always relayed', 20, 'bold'),
  note(28, 399, 'Both paths: encrypted between the client and the remote Iroh endpoint.', 18),
  note(28, 434, 'With a Python worker, the bridge then forwards requests over loopback HTTP.', 16),
]));
writeFileSync(new URL('paths-mobile.svg', articleDir), svg(400, 690, pathTitle, pathDesc, [
  heading(20, 40, 'Native client'), note(20, 71, 'CLI or application'),
  dot(42, 103), line('M42 121V251', true), dot(42, 271),
  note(64, 150, 'Direct when possible'),
  line('M61 103H329V178', true, true), dot(329, 198),
  line('M329 218V271H61', true, true), note(166, 239, 'Relay fallback', 15),
  text(66, 300, 'Iroh endpoint', 20, 'bold'),
  hr(20, 312, 360), heading(20, 357, 'Browser client'),
  dot(42, 391), line('M42 410V435', true), dot(42, 455),
  text(70, 462, 'Relay, every connection', 19, 'bold'),
  line('M42 474V499', true), dot(42, 519), text(70, 527, 'Iroh endpoint', 20, 'bold'),
  hr(20, 557, 360), note(20, 590, 'Both paths: encrypted between client'),
  note(20, 616, 'and endpoint. For Python, the endpoint'),
  note(20, 642, 'is the bridge; the final hop to the'),
  note(20, 668, 'worker is separate loopback HTTP.'),
]));

const social = svg(1200, 630, title, desc, [
  `<rect width="1200" height="630" fill="${paper}"/>`,
  logo('farm', 48, 34, 35), heading(96, 62, 'Query.Farm', 28), logo('iroh', 1030, 29, 120, 41),
  heading(48, 151, 'SQL in your browser.', 56),
  heading(48, 214, 'Code and data on your machine.', 52), hr(48, 251, 1104),
  logo('haybarn', 50, 300, 75), logo('wasm', 151, 301, 87, 74),
  heading(50, 444, 'Your browser', 30), note(50, 473, 'Haybarn + WebAssembly', 18),
  line('M282 344H407', true), logo('iroh', 433, 306, 200, 200 * 32 / 93.26),
  line('M660 344H778', true),
  text(486, 444, 'vgi-rpc', 24, 'bold'), note(417, 473, 'Encrypted through a relay', 18),
  // Use the original 1197×880 artwork at its natural aspect ratio.
  logo('vgiLarge', 805, 271, 190, 190 * 880 / 1197), logo('grainlift', 1040, 300, 76),
  heading(805, 444, 'Your computer', 30), note(805, 473, 'VGI functions · Grainlift databases', 18),
  hr(48, 488, 1104), logo('arrow', 48, 510, 112, 59),
  text(187, 553, 'No public HTTPS endpoint. No worker certificate renewals.', 24),
  note(187, 591, 'Reach your code and databases by endpoint ID.', 20),
]);
writeFileSync(new URL('social.svg', socialDir), social);
// Supersample before the final reduction so detailed raster marks stay smooth.
const renderedSocial = new Resvg(social, { fitTo: { mode: 'width', value: 3600 } }).render().asPng();
writeFileSync(new URL('social.png', socialDir), await sharp(renderedSocial)
  .resize(1200, 630, { kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer());
console.log('Generated Iroh architecture, connection-path diagrams, and 1200×630 social image.');
