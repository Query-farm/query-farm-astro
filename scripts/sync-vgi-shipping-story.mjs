import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-vgi-shipping-story.mjs /path/to/vgi-skills');
const root = resolve(process.argv[2], 'examples/shipping-margin');
const result = JSON.parse(await readFile(resolve(root, 'verification.json'), 'utf8'));
if (result.status !== 'passed' || result.engine !== 'duckdb') throw new Error('Require a passing stock DuckDB verification');
const names = ['one quote', 'quotes for orders', 'orders needing attention'];
const scenes = names.map(name => {
  const check = result.checks.find(check => check.name === name);
  if (!check || check.status !== 'passed') throw new Error(`Missing passed check: ${name}`);
  return { name, sql: check.sql, columns: check.columns, rows: check.rows };
});
const data = { engine: result.engine, engineVersion: result.engine_version, extensionVersion: result.extension_version, platform: result.platform, checksPassed: result.checks.length, note: 'Fictional orders and USD rates. Saved output from real SQL checks; the page does not execute a worker in the browser.', setup: await readFile(resolve(root, 'orders.sql'), 'utf8'), scenes };
await writeFile(new URL('../src/data/vgi-shipping-story.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log(`Imported ${scenes.length} verified story scenes.`);
