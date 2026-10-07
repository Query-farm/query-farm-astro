import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from '@shuding/opentype.js';

// One visual language for the article's overview, schema and implementation
// diagrams. Rules group related items; enclosures are reserved for boundaries.
// Outline the site's existing fonts so SVG <img> rendering is self-contained.
// OpenType is supplied by the site's Satori image-generation dependency.
const publicDir = new URL('../public/', import.meta.url);
const diagramDir = new URL('blog/query-cloudflare-from-duckdb/', publicDir);
const fonts = Object.fromEntries([
  ['body', 'NotoSans-400.ttf'], ['bold', 'NotoSans-600.ttf'], ['display', 'Petrona-600.ttf'],
].map(([key, file]) => {
  const bytes = readFileSync(new URL(`og-images/fonts/${file}`, import.meta.url));
  return [key, opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
}));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const ink = '#211a12';
const muted = '#5d4632';
const rule = '#b7aa94';
const dataUri = path => `data:${path.endsWith('.png') ? 'image/png' : 'image/svg+xml'};base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`;
// Existing product marks and official Cloudflare, Arrow and WebAssembly assets.
const logos = Object.fromEntries(Object.entries({
  haybarn: 'products/haybarn/haybarn-mark.svg', cupola: 'cupola/cupola-mark.svg',
  duckdb: 'vgi/icons/duckdb-mark.svg', grainlift: 'grainlift/grainlift-mark.svg',
  cloudflare: 'blog/query-cloudflare-from-duckdb/cloudflare-logo.png',
  arrow: 'blog/query-cloudflare-from-duckdb/apache-arrow-logo.svg',
  wasm: 'blog/query-cloudflare-from-duckdb/webassembly-logo.svg',
}).map(([name, path]) => [name, dataUri(path)]));
const { icons } = JSON.parse(readFileSync(new URL('../node_modules/@iconify-json/simple-icons/icons.json', import.meta.url), 'utf8'));
logos.python = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="#3776ab">${icons.python.body}</svg>`).toString('base64')}`;
const logo = (name, x, y, w, h = w) => `<image href="${logos[name]}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
function text(x, y, content, size = 16, face = 'body', anchor = 'start', color = ink) {
  const font = fonts[face];
  const width = font.getAdvanceWidth(content, size);
  const start = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  return `<g aria-label="${escape(content)}"><path d="${font.getPath(content, start, y, size).toPathData(2)}" fill="${color}"/></g>`;
}
const heading = (x, y, label, size = 23, anchor = 'start') => text(x, y, label, size, 'display', anchor);
const note = (x, y, label, size = 14, anchor = 'start') => text(x, y, label, size, 'body', anchor, muted);
const code = (x, y, label, size = 16, anchor = 'start') => `<text x="${x}" y="${y}" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="${size}" fill="${ink}" text-anchor="${anchor}">${escape(label)}</text>`;
const line = (d, arrow = false, color = ink, width = 1.3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
const hr = (x, y, width, heavy = false) => line(`M${x} ${y}h${width}`, false, heavy ? ink : rule, heavy ? 1.7 : 0.8);
function svg(width, height, title, desc, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escape(title)}</title><desc id="desc">${escape(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke="${ink}" stroke-width="1.2"/></marker></defs>
${content.join('\n')}
</svg>\n`;
}
const save = (name, content) => { const target = new URL(name, diagramDir); writeFileSync(target, content); console.log(`Generated ${fileURLToPath(target)}`); };

function browser(x, y, width = 336) {
  return [hr(x, y, width, true), heading(x, y + 31, 'In your browser'),
    logo('haybarn', x + 2, y + 53, 31), text(x + 41, y + 76, 'Haybarn', 16),
    logo('cupola', x + 143, y + 53, 31), text(x + 183, y + 76, 'Cupola', 16),
    logo('wasm', x + 270, y + 45, 64, 45),
    note(x, y + 112, 'Grainlift compiled into WebAssembly'), hr(x, y + 132, width)].join('\n');
}
function native(x, y, width = 336) {
  return [hr(x, y, width, true), heading(x, y + 31, 'Native applications'),
    ...[['haybarn', 'Haybarn'], ['duckdb', 'DuckDB'], ['python', 'Python']].map(([mark, label], i) =>
      logo(mark, x + i * 114, y + 56, 26) + text(x + 34 + i * 114, y + 76, label, 14)),
    note(x, y + 112, 'adbc_scanner or your ADBC driver manager', 13), hr(x, y + 132, width)].join('\n');
}
const overviewTitle = 'From your browser or native application to Cloudflare';
const overviewDesc = 'Haybarn and Cupola use WebAssembly in the browser. Native Haybarn, DuckDB, Python and other ADBC applications load the Grainlift driver. vgi-rpc carries requests over HTTP(S), and Apache Arrow results return to the client. The Cloudflare Worker and gateway Durable Object reach application Durable Objects and D1 for reads and writes, or Analytics Engine for read-only queries.';
save('overview.svg', svg(760, 626, overviewTitle, overviewDesc, [
  browser(24, 22), native(400, 22),
  line('M192 154V184H380'), line('M568 154V184H380V219', true),
  logo('grainlift', 241, 231, 53), heading(312, 265, 'Grainlift', 38), note(314, 291, 'ADBC driver', 16),
  line('M312 305h43', false, '#a9762e', 3),
  line('M366 316V416', true), line('M394 416V318', true),
  text(331, 353, 'vgi-rpc', 17, 'bold', 'end'), note(331, 377, 'Requests over HTTP(S)', 14, 'end'),
  logo('arrow', 435, 328, 107, 55), note(440, 400, 'Arrow results', 14),
  hr(24, 428, 712, true), logo('cloudflare', 24, 443, 145, 49),
  heading(215, 456, 'Grainlift gateway', 25), note(215, 481, 'Cloudflare Worker + session Durable Object', 15),
  line('M380 491V510H132V534', true), line('M380 510V534', true), line('M380 510H628V534', true),
  ...[[24, 'Durable Objects', 'SQLite · read + write'], [272, 'D1', 'SQLite · read + write'], [520, 'Analytics Engine', 'Events · read-only']].map(([x, title, detail]) =>
    hr(x, 543, 216) + heading(x, 570, title, 23) + note(x, 595, detail, 14)),
]));
save('overview-mobile.svg', svg(400, 872, overviewTitle, overviewDesc, [
  browser(18, 20), native(18, 175),
  line('M356 91H383V326H200V352', true), line('M356 246H383'),
  logo('grainlift', 70, 365, 51), heading(140, 398, 'Grainlift', 36), note(142, 423, 'ADBC driver', 15),
  line('M183 441V532', true), line('M217 532V443', true),
  text(162, 475, 'vgi-rpc', 17, 'bold', 'end'), note(162, 498, 'HTTP(S) requests', 13, 'end'),
  logo('arrow', 245, 449, 102, 53), note(295, 520, 'Arrow results', 13, 'middle'),
  hr(18, 548, 364, true), logo('cloudflare', 18, 565, 128, 44),
  heading(172, 580, 'Grainlift gateway', 22), note(172, 603, 'Cloudflare Worker', 14), note(172, 624, '+ session Durable Object', 13),
  line('M42 632V816'),
  ...[[654, 'Durable Objects', 'SQLite · read + write'], [728, 'D1', 'SQLite · read + write'], [802, 'Analytics Engine', 'Events · read-only']].map(([y, title, detail]) =>
    line(`M42 ${y + 14}H69`, true) + heading(84, y + 20, title, 23) + note(84, y + 43, detail) + hr(84, y + 54, 298)),
]));

const schemaTitle = 'Tables in the coffee-shop demo';
const schemaDesc = 'Each order references one product: orders.product_id refers to products.id. A product can appear in many orders. Products store names, categories and prices in cents. Orders store quantities and cities. The visitor_notes and demo_info tables are independent; they hold visitor notes and the next reset time.';
function table(x, y, width, name, rows, fields, annotations = {}) {
  return [code(x, y, name, 19), note(x + width, y, rows, 13, 'end'), hr(x, y + 14, width, true),
    ...fields.map((field, i) => code(x, y + 43 + i * 25, field, 16)
      + (annotations[field] ? note(x + width, y + 43 + i * 25, annotations[field], 12, 'end') : '')),
    hr(x, y + 57 + (fields.length - 1) * 25, width)].join('\n');
}
save('demo-schema.svg', svg(760, 416, schemaTitle, schemaDesc, [
  table(24, 36, 276, 'products', '6 rows', ['id', 'name', 'category', 'price_cents'], {id:'primary key'}),
  table(460, 36, 276, 'orders', '12 rows', ['id', 'product_id', 'quantity', 'city'], {id:'primary key',product_id:'foreign key'}),
  line('M307 75H379V100H451', true),
  note(380, 61, 'one product', 13, 'middle'), note(380, 137, 'many orders', 13, 'middle'),
  note(24, 227, 'Two independent tables for notes and the reset schedule:'),
  table(24, 275, 336, 'visitor_notes', '', ['id', 'note', 'created_at'], {id:'primary key'}),
  table(412, 275, 324, 'demo_info', '', ['description', 'next_reset_at']),
]));
save('demo-schema-mobile.svg', svg(400, 602, schemaTitle, schemaDesc, [
  table(24, 34, 352, 'products', '6 rows', ['id', 'name', 'category', 'price_cents'], {id:'primary key'}),
  line('M42 180V222', true), note(63, 207, 'One product can appear in many orders.', 13),
  table(24, 252, 352, 'orders', '12 rows', ['id', 'product_id', 'quantity', 'city'], {id:'primary key', product_id:'references products.id'}),
  note(24, 423, 'Independent tables', 14),
  table(24, 466, 165, 'visitor_notes', '', ['id', 'note', 'created_at'], {id:'primary key'}),
  table(220, 466, 156, 'demo_info', '', ['description', 'next_reset_at']),
]));

const archTitle = 'How the Cloudflare gateway reaches your data';
const archDesc = 'Browser and native ADBC clients connect over HTTPS to the Cloudflare Worker. The Worker forwards requests to GrainliftGateway, a Durable Object holding sessions and permissions. The gateway calls SQL RPC methods on a separate application Durable Object, uses a D1 binding, or calls the Analytics Engine SQL API over HTTPS. Arrow results return to the client.';
save('architecture.svg', svg(760, 590, archTitle, archDesc, [
  ...[[24,'This article','Haybarn-WASM + Grainlift'],[278,'Cupola','Browser catalog + SQL editor'],[526,'Native ADBC','Python / Haybarn / DuckDB']].map(([x,title,detail]) =>
    hr(x, 20, 210, true) + heading(x, 50, title, 23) + note(x, 74, detail, 13)),
  line('M130 88V105H382'), line('M632 88V105H382V137', true), line('M382 88V105'),
  text(380, 161, 'HTTPS / vgi-rpc · SQL requests and Arrow results', 14, 'body', 'middle'),
  // Corner brackets mark the account boundary; the data is not in the gateway.
  line('M48 190H24V563H48M712 190H736V563H712', false, rule),
  note(48, 211, 'Your Cloudflare account', 13),
  heading(380, 248, 'Cloudflare Worker', 25, 'middle'), note(380, 272, 'HTTPS entry point', 14, 'middle'),
  line('M380 282V303', true), code(380, 332, 'GrainliftGateway', 21, 'middle'),
  note(380, 358, 'Durable Object · sessions + permissions', 14, 'middle'),
  line('M380 371V390H146V413', true), line('M380 390V413', true), line('M380 390H614V413', true),
  ...[[48, 'SQL RPC methods', 'Application object', 'Its own SQLite database', 'Demo resets every 4 hours'],
    [282, 'D1 binding', 'D1', 'Bound SQLite databases', 'Read + write'],
    [516, 'SQL API over HTTPS', 'Analytics Engine', 'Event datasets', 'Read-only']].map(([x,via,title,detail,foot]) =>
      note(x, 437, via, 13) + hr(x, 450, 196, true) + heading(x, 480, title, 22)
      + note(x, 504, detail, 13) + note(x, 529, foot, 13)),
]));
save('architecture-mobile.svg', svg(400, 858, archTitle, archDesc, [
  hr(24, 20, 352, true), heading(24, 53, 'Your database client', 26),
  note(24, 82, 'Haybarn-WASM · Cupola · native ADBC', 15),
  line('M41 98V155', true), text(65, 120, 'HTTPS / vgi-rpc', 15, 'bold'), note(65, 145, 'SQL requests, Arrow results', 14),
  line('M35 178H16V836H35M365 178H384V836H365', false, rule),
  note(35, 201, 'Your Cloudflare account', 13),
  heading(200, 244, 'Cloudflare Worker', 25, 'middle'), note(200, 270, 'HTTPS entry point', 14, 'middle'),
  line('M200 284V311', true), code(200, 341, 'GrainliftGateway', 22, 'middle'),
  note(200, 368, 'Durable Object', 15, 'middle'), note(200, 393, 'Sessions + permissions', 14, 'middle'),
  line('M48 413V763'), line('M200 408V424H48'),
  ...[[444, 'SQL RPC methods', 'Application object', 'Its own SQLite database', 'Demo resets every 4 hours'],
    [584, 'D1 binding', 'D1', 'Bound SQLite databases', 'Read + write'],
    [717, 'SQL API over HTTPS', 'Analytics Engine', 'Event datasets', 'Read-only']].map(([y,via,title,detail,foot]) =>
      line(`M48 ${y + 46}H75`, true) + note(92, y, via, 13) + hr(92, y + 12, 260, true)
      + heading(92, y + 44, title, 24) + note(92, y + 68, detail, 14) + note(92, y + 91, foot, 14)),
]));
