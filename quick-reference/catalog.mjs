import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/data/extensions.ts'), 'utf8');
const hiddenDeclaration = source.match(/const HIDDEN_FROM_LISTING = new Set\(\[([^\]]+)\]\)/);
if (!hiddenDeclaration) throw new Error('Public catalog filter changed; review quick-reference/catalog.mjs');
const hidden = new Set([...hiddenDeclaration[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
export const catalog = readdirSync(join(root, 'src/data/extensions')).flatMap(slug => {
  let meta;
  try { meta = JSON.parse(readFileSync(join(root, 'src/data/extensions', slug, 'augment/metadata.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (hidden.has(slug) || /^\s*TODO\b/i.test(meta.description)) return [];
  return [{ slug, ...meta }];
}).sort((a, b) => a.slug.localeCompare(b.slug));
