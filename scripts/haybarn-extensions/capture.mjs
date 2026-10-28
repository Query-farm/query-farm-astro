import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const catalog = JSON.parse(await readFile('src/data/haybarn-extensions/catalog.generated.json', 'utf8'));
const release = catalog.releases.find(release => release.version === catalog.latestVersion);
const wheelVersion = release.tag.replace(/^haybarn-v/, '').replace('-rc', 'rc');
if (process.argv.includes('--check-examples')) {
  execFileSync('uv', ['run', '--with', `haybarn==${wheelVersion}`, '--with', 'xlsxwriter>=3.2,<4', 'python', 'scripts/haybarn-extensions/check-examples.py'], { stdio: 'inherit', timeout: 120_000 });
  process.exit(0);
}
for (const name of ['sheetreader', 'gsheets']) {
  if (!catalog.extensions.some(entry => entry.name === name && entry.availability.some(item => item.version === catalog.latestVersion))) {
    const historical = JSON.parse(await readFile('src/data/haybarn-extensions/reference-releases.generated.json', 'utf8'));
    const inventory = JSON.parse(await readFile(`src/data/haybarn-extensions/inventories/${name}.json`, 'utf8'));
    if (!historical.extensions.some(entry => entry.name === name && entry.availability.some(item => `v${item.version}` === inventory.engine.library_version))) throw new Error(`${name} has no published reference build`);
    console.log(`${name}: retaining the captured ${inventory.engine.library_version} reference.`);
    continue;
  }
  execFileSync('uv', ['run', '--with', `haybarn==${wheelVersion}`, 'python', 'scripts/haybarn-extensions/capture.py', name, '--version', catalog.latestVersion], { stdio: 'inherit', timeout: 120_000 });
}
execFileSync(process.execPath, ['scripts/haybarn-extensions/import-docs.mjs'], { stdio: 'inherit' });
