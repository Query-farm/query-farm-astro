import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const versions = process.argv.slice(2);
if (!versions.length) versions.push('1.3.2', '1.4.4');
const platform = process.platform === 'darwin' ? 'osx-universal' :
  process.platform === 'linux' ? `linux-${process.arch === 'arm64' ? 'arm64' : 'amd64'}` : null;
if (!platform) throw new Error('Automatic download supports macOS and Linux. Use snapshot --binary on other platforms.');
for (const version of versions) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release: ${version}`);
  const directory = resolve(root, '.cache/releases', version);
  mkdirSync(directory, { recursive: true });
  const binary = resolve(directory, 'duckdb');
  const source = `https://github.com/duckdb/duckdb/releases/tag/v${version}`;
  if (!existsSync(binary)) {
    const url = `https://github.com/duckdb/duckdb/releases/download/v${version}/duckdb_cli-${platform}.zip`;
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
    const zip = resolve(directory, 'cli.zip');
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    execFileSync('unzip', ['-o', zip, 'duckdb', '-d', directory], { stdio: 'inherit' });
    chmodSync(binary, 0o755);
  }
  execFileSync(process.execPath, [resolve(root, 'scripts/haybarn-functions/snapshot.mjs'), '--binary', binary,
    '--engine', 'duckdb', '--id', `duckdb-${version}`, '--label', `DuckDB ${version}`, '--source', source], { stdio: 'inherit' });
}
