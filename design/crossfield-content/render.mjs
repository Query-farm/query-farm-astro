// Local editorial review only; generated output is ignored and is not a site route.
// Run from any directory: node design/crossfield-content/render.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Marked } from 'marked';

const source = dirname(fileURLToPath(import.meta.url));
const output = resolve(source, '../../.cache/crossfield-content-review/index.html');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sections = [];
for (const [id, file] of [['plan', 'PLAN.md'], ['copy', 'COPY.md']]) {
  const parser = new Marked();
  const headings = [];
  parser.use({ renderer: {
    heading(token) {
      const anchor = `${id}-${headings.length + 1}`;
      headings.push({ anchor, depth: token.depth, text: token.text });
      const depth = Math.min(6, token.depth + 1);
      return `<h${depth} id="${anchor}">${this.parser.parseInline(token.tokens)}</h${depth}>`;
    },
  } });
  let body = await parser.parse(await readFile(resolve(source, file), 'utf8'));
  body = body.replaceAll('href="COPY.md"', 'href="#copy"').replaceAll('href="PLAN.md"', 'href="#plan"');
  body = body.replaceAll('href="../crossfield.md"', `href="${new URL('../crossfield.md', import.meta.url).href}"`);
  body = body.replaceAll('href="/', 'href="http://localhost:4455/');
  body = body.replaceAll('<table>', '<div class="table-scroll"><table>').replaceAll('</table>', '</table></div>');
  sections.push({ id, body, headings });
}

const navigation = sections.map(section => `<details open><summary>${section.id === 'plan' ? 'Content plan' : 'Proposed copy'}</summary><ul>${section.headings.filter(h => h.depth === 2).map(h => `<li><a href="#${h.anchor}">${escape(h.text)}</a></li>`).join('')}</ul></details>`).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Crossfield — content strategy review</title>
<style>
:root{color-scheme:light;--paper:#faf7f2;--ink:#211a12;--line:#ddd3c5;--link:#275b39}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:2rem}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 system-ui,-apple-system,sans-serif}
a{color:var(--link);text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid var(--link);outline-offset:4px}
header{padding:3rem max(1.5rem,calc((100vw - 1320px)/2));border-bottom:1px solid var(--line);background:#f0e9dc}
.eyebrow{font-size:.78rem;letter-spacing:.07em;text-transform:uppercase;color:#725014}
h1{font:600 clamp(2rem,4vw,3.7rem)/1.15 Georgia,serif;max-width:23ch;margin:.75rem 0 1.2rem}
.intro{max-width:78ch;font-size:1.12rem}.meta{font-size:.85rem}.overview{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;max-width:1150px;margin:2rem 0 0}
.overview div{border-left:3px solid #6e8b55;padding-left:1rem}.overview strong{display:block}.overview p{margin:.4rem 0;font-size:.9rem}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:3rem;max-width:1320px;margin:auto;padding:2.5rem 1.5rem}
nav{position:sticky;top:1.5rem;align-self:start;max-height:94vh;overflow:auto;font-size:.82rem}nav ul{list-style:none;padding:0}nav li{margin:.5rem 0}nav details{margin-bottom:1.5rem}nav summary{cursor:pointer;font-weight:650}
main{min-width:0}article+article{margin-top:4rem;padding-top:3rem;border-top:2px solid var(--line)}
h2,h3,h4{font-family:Georgia,serif;line-height:1.3;margin-top:2.3rem}h2{font-size:2.2rem}h3{font-size:1.65rem}h4{font-size:1.25rem}
p,li{max-width:85ch}pre{background:#1a1512;color:#f4ece0;padding:1.25rem;overflow:auto;border-radius:5px;font-size:.84rem;line-height:1.7}
code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.9em;overflow-wrap:anywhere}pre code{overflow-wrap:normal}
.table-scroll{overflow-x:auto;margin:1.5rem 0}table{border-collapse:collapse;width:100%;min-width:620px;font-size:.88rem;font-variant-numeric:tabular-nums}th,td{padding:.75rem;vertical-align:top;border-bottom:1px solid var(--line);text-align:left}th{background:#eee6d8}
li+li{margin-top:.4rem}blockquote{border-left:3px solid var(--link);margin-left:0;padding-left:1rem}
@media(max-width:900px){.layout{display:block}nav{position:static;max-height:none;padding-bottom:1rem;border-bottom:1px solid var(--line)}nav details{margin:.5rem 0}.overview{grid-template-columns:1fr;gap:.7rem}header{padding:2rem 1.5rem}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{nav{display:none}.layout{display:block}body{font-size:10pt}header{padding:1rem}pre{white-space:pre-wrap}.table-scroll{overflow:visible}table{min-width:0}a{color:inherit}h2,h3,h4{break-after:avoid}}
</style></head><body>
<header><div class="eyebrow">Query.Farm / Crossfield / editorial review</div>
<h1>A product story built around definitions people can query and inspect.</h1>
<p class="intro">The proposed pitch, website structure, proof examples and documentation plan. The existing product pages remain intact while this proposal is reviewed.</p>
<p class="meta">Branch: <code>feat/crossfield-content-strategy</code> · October 24, 2026 · Local draft; not published</p>
<p><a href="#plan">Read the plan</a> · <a href="#copy">Read proposed copy</a> · <a href="http://localhost:4455/products/crossfield">Existing website preview</a></p>
<div class="overview"><div><strong>The user problem</strong><p>Valid SQL can apply the wrong definition or multiply a measure after a join.</p></div><div><strong>The product</strong><p>Approved models queried through Crossfield inside a matching DuckDB build.</p></div><div><strong>The proof</strong><p>Real SQL, checked values, inspectable expansion, definition comparisons and useful rejections.</p></div></div>
</header><div class="layout"><nav aria-label="Review contents">${navigation}</nav><main>${sections.map(s => `<article id="${s.id}">${s.body}</article>`).join('')}</main></div></body></html>`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(output);
