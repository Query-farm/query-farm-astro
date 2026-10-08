import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import opentype from '@shuding/opentype.js';
import { Resvg } from '@resvg/resvg-js';

// Real product marks, outlined site fonts, and simple rules for the two runtimes.
const publicDir = new URL('../public/', import.meta.url);
const articleDir = new URL('blog/native-adbc-in-your-browser/', publicDir);
const socialDir = new URL('media/posts/native-adbc-in-your-browser/', publicDir);
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
  haybarn: 'products/haybarn/haybarn-mark.svg', cupola: 'cupola/cupola-mark.svg',
  grainlift: 'grainlift/grainlift-mark.svg', farm: 'media-kit/logo/mark.svg',
  duckdb: 'vgi/icons/duckdb-mark.svg',
  arrow: 'blog/query-cloudflare-from-duckdb/apache-arrow-logo.svg',
  wasm: 'blog/query-cloudflare-from-duckdb/webassembly-logo.svg',
}).map(([name, path]) => [name, `data:image/svg+xml;base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`]));
const { icons } = JSON.parse(readFileSync(new URL('../node_modules/@iconify-json/simple-icons/icons.json', import.meta.url)));
for (const [name, color] of [['postgresql', '#4169e1'], ['uv', '#6f35a5']]) {
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}">${icons[name].body.replaceAll('currentColor', color)}</svg>`;
  logos[name] = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`;
  writeFileSync(new URL(`${name}.svg`, articleDir), mark + '\n');
}
const logo = (name, x, y, w, h = w) => `<image href="${logos[name]}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
function text(x, y, content, size = 18, face = 'body', color = ink) {
  return `<g aria-label="${escape(content)}"><path d="${fonts[face].getPath(content, x, y, size).toPathData(2)}" fill="${color}"/></g>`;
}
const heading = (x, y, label, size = 29) => text(x, y, label, size, 'display');
const note = (x, y, label, size = 16) => text(x, y, label, size, 'body', muted);
const line = (d, arrow = false, color = ink) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
const hr = (x, y, w) => line(`M${x} ${y}h${w}`, false, rule);
function svg(width, height, title, desc, parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(desc)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke="${ink}" stroke-width="1.2"/></marker></defs>${parts.join('\n')}</svg>\n`;
}
const title = 'ADBC in the browser: use your existing drivers';
const desc = 'Haybarn and Cupola use the WebAssembly build of the Grainlift ADBC driver. vgi-rpc carries requests over HTTP and Arrow results back to the browser. A Grainlift gateway on your computer or server loads an existing native ADBC driver, which connects to its database. PostgreSQL and DuckDB are two examples.';
writeFileSync(new URL('architecture.svg', articleDir), svg(1000, 540, title, desc, [
  heading(28, 47, 'In your browser'), hr(28, 64, 268),
  heading(564, 47, 'On your computer or server'), hr(564, 64, 408),
  logo('haybarn', 28, 92, 43), text(83, 121, 'Haybarn', 20),
  logo('cupola', 28, 154, 43), text(83, 183, 'Cupola', 20),
  line('M51 210V248', true),
  logo('grainlift', 28, 268, 45), heading(85, 295, 'Grainlift', 27),
  note(85, 321, 'Browser ADBC driver'),
  logo('wasm', 28, 351, 57, 47), note(99, 380, 'WebAssembly'),
  note(28, 446, 'Plans queries and works'), note(28, 471, 'with the returned data.'),
  text(340, 212, 'vgi-rpc', 22, 'bold'), note(340, 241, 'HTTP(S) requests', 16),
  line('M312 269H544', true), line('M544 305H312', true),
  logo('arrow', 348, 329, 118, 60), note(356, 411, 'Arrow results'),
  logo('grainlift', 564, 222, 48), heading(628, 252, 'Grainlift gateway', 27),
  note(628, 280, 'Loads a shared library'), line('M588 297V320', true),
  heading(564, 347, 'Your existing ADBC driver', 27),
  note(564, 374, 'Normal filesystem and networking access'),
  line('M754 390V408H640V434', true), line('M754 408H860V434', true),
  logo('postgresql', 575, 454, 36), heading(624, 480, 'PostgreSQL', 23),
  logo('duckdb', 806, 454, 36), heading(854, 480, 'DuckDB', 23),
  note(575, 518, 'For example. Each uses its own native driver.', 16),
]));
writeFileSync(new URL('architecture-mobile.svg', articleDir), svg(400, 790, title, desc, [
  heading(20, 40, 'In your browser'), hr(20, 56, 360),
  logo('haybarn', 20, 77, 35), text(66, 102, 'Haybarn', 19),
  logo('cupola', 216, 77, 35), text(262, 102, 'Cupola', 19),
  logo('grainlift', 20, 142, 43), heading(78, 169, 'Grainlift', 26),
  note(78, 195, 'Browser ADBC driver'), logo('wasm', 301, 145, 62, 48),
  line('M48 221V342', true), line('M79 342V221', true),
  text(105, 249, 'vgi-rpc', 20, 'bold'), note(105, 276, 'HTTP(S) requests'),
  logo('arrow', 263, 222, 104, 54), note(105, 313, 'Arrow results return to the browser'),
  hr(20, 366, 360), heading(20, 405, 'On your computer or server', 26),
  logo('grainlift', 20, 435, 43), heading(78, 461, 'Grainlift gateway', 26),
  note(78, 487, 'Loads a shared library'), line('M43 501V539', true),
  heading(20, 576, 'Your existing ADBC driver', 26), note(20, 603, 'Normal filesystem and networking access', 15),
  line('M200 622V641H94V671', true), line('M200 641H284V671', true),
  logo('postgresql', 22, 692, 31), heading(63, 716, 'PostgreSQL', 22),
  logo('duckdb', 231, 692, 31), heading(274, 716, 'DuckDB', 22),
  note(22, 756, 'For example. Each has its own native driver.', 15),
]));

const social = svg(1200, 630, title, desc, [
  '<rect width="1200" height="630" fill="'+paper+'"/>',
  logo('farm', 48, 34, 35), heading(96, 62, 'Query.Farm', 28), note(962, 61, 'GRAINLIFT / ADBC', 17),
  heading(48, 151, 'Your existing ADBC drivers,', 54), heading(48, 213, 'from the browser.', 57),
  hr(48, 250, 1104),
  logo('haybarn', 50, 294, 59), logo('cupola', 135, 294, 59), logo('wasm', 220, 294, 73, 59),
  heading(50, 401, 'Your browser', 32), note(50, 437, 'Haybarn · Cupola · WebAssembly', 19),
  line('M322 341H458', true), line('M458 372H322', true), note(326, 410, 'vgi-rpc', 18),
  logo('grainlift', 524, 290, 85), heading(493, 401, 'Grainlift', 34), note(493, 437, 'Native gateway', 19),
  line('M687 341H828', true), line('M828 372H687', true), note(696, 410, 'ADBC', 18),
  logo('postgresql', 872, 294, 55), logo('duckdb', 975, 294, 55),
  heading(872, 401, 'Your database', 32), note(872, 437, 'Native ADBC driver', 19),
  hr(48, 494, 1104), logo('arrow', 48, 523, 112, 59),
  text(187, 559, 'Keep the driver native. Bring the results to the browser.', 24),
]);
writeFileSync(new URL('social.svg', socialDir), social);
writeFileSync(new URL('social.png', socialDir), new Resvg(social).render().asPng());
console.log('Generated native ADBC architecture diagrams and 1200×630 social image.');
