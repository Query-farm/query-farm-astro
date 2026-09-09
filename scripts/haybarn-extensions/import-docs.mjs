// Import selected explanatory material from the exact source commit used by
// the published extension. Inventory always comes from capture.py instead.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const catalog = JSON.parse(await readFile('src/data/haybarn-extensions/catalog.generated.json', 'utf8'));
const output = {};
for (const name of ['sheetreader', 'gsheets']) {
  const entry = catalog.extensions.find(e => e.name === name);
  const inventory = JSON.parse(await readFile(`src/data/haybarn-extensions/inventories/${name}.json`, 'utf8'));
  const ref = entry.repo.haybarn_ref || entry.repo.ref;
  if (!ref.startsWith(inventory.extensionVersion)) throw new Error(`${name}: descriptor commit does not match the installed extension; review the source revision before importing documentation.`);
  const repo = entry.repo.haybarn_fork || entry.repo.github;
  const path = name === 'gsheets' ? 'docs/pages/index.md' : 'README.md';
  const source = `https://github.com/${repo}/blob/${ref}/${path}`;
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`);
  if (!response.ok) throw new Error(`${name}: documentation HTTP ${response.status}`);
  const markdown = await response.text();
  const parameters = {};
  if (name === 'sheetreader') {
    for (const line of `${entry.docs.extended_description ?? ''}\n${markdown}`.split('\n')) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim().replace(/^`|`$/g, ''));
      if (cells.length >= 4 && inventory.functions[0].parameters.includes(cells[0]) && !parameters[cells[0]]) parameters[cells[0]] = { description: cells[1], default: cells[3] };
    }
  }
  const sections = {};
  for (const heading of name === 'gsheets' ? ['Authenticate', 'Read', 'Write'] : ['Quickstart', 'Usage & Parameters']) {
    const start = markdown.indexOf(` ${heading}\n`);
    if (start < 0) throw new Error(`${name}: missing ${heading} section`);
    const section = markdown.slice(start).split(/\n#{1,3} /)[0];
    const blocks = [...section.matchAll(/```sql\s*\n([\s\S]*?)```/g)].map(match => match[1].trim());
    if (!blocks.length) throw new Error(`${name}: no SQL in ${heading}`);
    sections[heading] = blocks;
  }
  const parameterSource = name === 'sheetreader' ? `${catalog.source.repository}/blob/${catalog.source.commit}/extensions/${name}/description.yml` : source;
  output[name] = { source, parameterSource, ref, parameters, sections };
}
await mkdir('src/data/haybarn-extensions', { recursive: true });
await writeFile('src/data/haybarn-extensions/docs.generated.json', JSON.stringify(output, null, 2) + '\n');
console.log('Imported parameter explanations and SQL from the maintainers’ pinned documentation.');
