import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { captureBindings } from './bindings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: { binary: { type: 'string' }, id: { type: 'string' } } });
if (!values.binary || !values.id || !/^[a-z0-9][a-z0-9.-]*$/.test(values.id)) throw new Error('Usage: node scripts/haybarn-functions/capture-bindings.mjs --binary /path/to/cli --id snapshot-id');
captureBindings({ binary: resolve(values.binary), snapshot: JSON.parse(readFileSync(resolve(root, `src/haybarn-functions/data/snapshots/${values.id}.json`), 'utf8')), root });
