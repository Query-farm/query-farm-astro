import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dist, readPage, publicExtensions, checkInstallation, checkExampleRepositories } from './installation-docs.mjs';

const extensions = publicExtensions();
// Not published to the Query.Farm repository (src/data/query-farm-repository.ts).
const communityOnly = new Set(['events', 'vgi']);
const names = extensions.map(extension => extension.name).filter(name => !communityOnly.has(name));

test('the catalog documents native setup and labels the older DuckDB syntax', () => {
  checkInstallation(readPage('products/extensions/index.html'), 'airport', { catalog: true });
});

for (const { name, path } of extensions.filter(({ name }) => !communityOnly.has(name))) {
  test(`${name}: copyable installation and later-session commands use the named repository`, () => {
    checkInstallation(readPage(path), name);
  });
}

test('current examples across all extension documentation use the named repository', () => {
  const root = 'products/extensions';
  for (const file of readdirSync(join(dist, root), { recursive: true })) {
    if (file.endsWith('.html')) {
      const path = `${root}/${file}`;
      checkExampleRepositories(readPage(path), names, path);
    }
  }
  checkExampleRepositories(readPage(`${root}/index.html`), names, `${root}/index.html`);
});

// Exercise the checks against the actual regression, so a future refactor of
// the audit cannot quietly turn a missing FROM into a passing test.
const a5Path = extensions.find(extension => extension.name === 'a5')?.path;
assert.ok(a5Path, 'A5 must remain available as the native installation smoke test.');
const a5 = readPage(a5Path);
test('the audit rejects the original bare LOAD regression', () => {
  const broken = a5.replaceAll('LOAD a5 FROM query_farm;', 'LOAD a5;');
  assert.notEqual(broken, a5);
  assert.throws(() => checkInstallation(broken, 'a5'), /native installation is missing/);
  assert.throws(() => checkExampleRepositories(broken, names, a5Path), /current examples must use query_farm/);
});

test('the audit rejects missing repository setup and stale cookbook instructions', () => {
  const broken = a5.replace('CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm', 'CREATE EXTENSION REPOSITORY IF NOT EXISTS wrong_repo');
  assert.notEqual(broken, a5);
  assert.throws(() => checkInstallation(broken, 'a5'), /native installation is missing/);
  assert.throws(() => checkExampleRepositories('<pre><code>INSTALL a5 FROM community; LOAD a5;</code></pre>', names, 'cookbook'),
    /current examples must use query_farm/);
});

test('the built A5 instructions install and reload in separate native DuckDB processes', { timeout: 150_000 }, () => {
  const { installSql, reloadSql } = checkInstallation(a5, 'a5');
  const directory = mkdtempSync(join(tmpdir(), 'query-farm-install-'));
  try {
    for (const [phase, sql] of [['install', installSql], ['reload', reloadSql]]) {
      const result = spawnSync(process.env.DUCKDB_TEST_PYTHON ?? 'python3',
        [fileURLToPath(new URL('./native-install.py', import.meta.url))], {
          input: JSON.stringify({ directory, sql }),
          encoding: 'utf8',
          timeout: 60_000,
        });
      assert.equal(result.status, 0,
        `${phase} must execute the published SQL unchanged on native DuckDB 2.0.0.\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /native-install-ok/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
