import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultSnapshotId, wasmVersion } from '../../src/haybarn-functions/data/haybarn-release.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
const python = process.env.PYTHON || 'python3';
run(python, ['--version']);
mkdirSync('.cache', { recursive: true });
// Reuse the existing research checkout. Bootstrap new workspaces at the same
// SQLGlot revision used by the captured translations, without moving that pin.
if (!existsSync('.cache/sqlglot/sqlglot/__init__.py')) {
  const translations = JSON.parse(readFileSync('src/haybarn-functions/data/translations.json', 'utf8'));
  const commit = translations[0].provenance.commit;
  if (!existsSync('.cache/sqlglot/.git')) run('git', ['clone', '--no-checkout', 'https://github.com/tobymao/sqlglot.git', '.cache/sqlglot']);
  run('git', ['-C', '.cache/sqlglot', 'checkout', '--detach', commit]);
}
console.log(`Refreshing ${defaultSnapshotId} from the installed Haybarn WASM ${wasmVersion} package.`);
run(process.execPath, ['scripts/haybarn-functions/capture-wasm.mjs']);
run(python, ['scripts/haybarn-functions/example-candidates.py']);
run(process.execPath, ['scripts/haybarn-functions/verify-examples.mjs']);
console.log(`Ready to build ${defaultSnapshotId}. Existing release catalogs are retained.`);
