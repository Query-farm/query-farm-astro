// Run explicitly when publishing new extensions/releases. Builds consume the
// committed snapshot so transient CDN failures cannot erase the directory.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const repository = 'https://github.com/Query-farm-haybarn/haybarn-community-extensions';
const cache = resolve('.cache/haybarn-extensions');
await mkdir(cache, { recursive: true });
const arg = process.argv.indexOf('--community-dir');
const checkout = arg >= 0 ? resolve(process.argv[arg + 1]) : `${cache}/community`;
if (arg < 0) {
  if (!existsSync(`${checkout}/.git`)) execFileSync('git', ['clone', '--depth', '1', repository, checkout], { stdio: 'inherit' });
  else {
    execFileSync('git', ['-C', checkout, 'fetch', '--depth', '1', 'origin', 'main'], { stdio: 'inherit' });
    execFileSync('git', ['-C', checkout, 'reset', '--hard', 'FETCH_HEAD'], { stdio: 'inherit' });
  }
}
const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', checkout, 'status', '--porcelain', '--', 'extensions'], { encoding: 'utf8' }).trim();
if (dirty) throw new Error('Use a clean community checkout so the metadata has a reproducible source commit.');
const descriptors = JSON.parse(execFileSync('uv', ['run', '--script', 'scripts/haybarn-extensions/descriptors.py', checkout], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const versionsURL = 'https://haybarn-status.query.farm/api/versions';
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
const versions = await json(versionsURL);
// Only the current release belongs in discovery. Verify that its tag refers
// to a published engine release before probing extension artifacts.
const latest = versions.latest;
if (!latest?.version || !latest.tag) throw new Error('Could not establish the current Haybarn release.');
const published = await json(`https://api.github.com/repos/Query-farm-haybarn/haybarn/releases/tags/${encodeURIComponent(latest.tag)}`);
if (published.draft || !published.published_at) throw new Error('The current Haybarn release has not been published.');
const supported = [{ version: latest.version, tag: latest.tag, publishedAt: published.published_at }];
const platforms = ['linux_amd64', 'linux_arm64', 'linux_amd64_musl', 'linux_arm64_musl', 'osx_amd64', 'osx_arm64', 'windows_amd64', 'windows_arm64', 'windows_amd64_mingw', 'wasm_mvp', 'wasm_eh', 'wasm_threads'];
const status = await json(`https://haybarn-status.query.farm/api/r/${supported[0].tag}`);
const statusNames = status.sidePanel.community.extensions.map(e => e.name);
const names = new Set(descriptors.map(d => d.name));
if (statusNames.some(name => !names.has(name))) throw new Error('The status feed contains extensions missing from the descriptor checkout. Refresh the checkout.');
const discoveredPlatforms = new Set(status.sidePanel.community.extensions.flatMap(e => e.jobs ?? []).map(j => j.name.match(/\((\w+),/)?.[1]).filter(Boolean));
for (const platform of discoveredPlatforms) if (!platforms.includes(platform)) platforms.push(platform);
const entries = descriptors.map(d => ({ ...d, availability: [] }));
const jobs = entries.flatMap(entry => supported.flatMap(release => platforms.map(platform => ({ entry, release, platform }))));
let next = 0, completed = 0;
const errors = [];
console.log(`Checking ${entries.length} extensions × ${platforms.length} platforms for Haybarn ${latest.version}.`);
async function probe(job) {
  const { entry, release, platform } = job;
  const url = `https://haybarn-extensions.query.farm/community/v${release.version}/${platform}/${entry.name}.duckdb_extension.${platform.startsWith('wasm_') ? 'wasm' : 'gz'}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
      if (response.status === 404) return;
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const bytes = Number(response.headers.get('content-length'));
      const contentType = response.headers.get('content-type');
      if (bytes < 512 || (contentType && !/^application\/(gzip|x-gzip|wasm|octet-stream)/.test(contentType))) throw new Error('Response is not an extension artifact');
      // Some older uploads omit Content-Type. Check the file magic using a
      // bounded range read instead of rejecting a published binary.
      if (!contentType) {
        const sample = await fetch(url, { headers: { Range: 'bytes=0-3' }, signal: AbortSignal.timeout(20_000) });
        if (![200, 206].includes(sample.status)) throw new Error(`Artifact sample HTTP ${sample.status}`);
        const reader = sample.body.getReader();
        const { value } = await reader.read();
        await reader.cancel();
        const valid = platform.startsWith('wasm_')
          ? value?.[0] === 0 && value?.[1] === 97 && value?.[2] === 115 && value?.[3] === 109
          : value?.[0] === 31 && value?.[1] === 139;
        if (!valid) throw new Error('Artifact file magic does not match its format');
      }
      entry.availability.push({ version: release.version, platform, bytes, etag: response.headers.get('etag'), modifiedAt: response.headers.get('last-modified') });
      return;
    } catch (error) {
      if (attempt === 2) { errors.push(`${url}: ${error.message}`); return; }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
await Promise.all(Array.from({ length: 20 }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    await probe(job);
    completed++;
    if (completed % 1000 === 0) console.log(`${completed}/${jobs.length} checked`);
  }
}));
if (errors.length) {
  await writeFile(`${cache}/probe-errors.json`, JSON.stringify(errors, null, 2));
  throw new Error(`${errors.length} probes failed; the previous catalog was preserved. See .cache/haybarn-extensions/probe-errors.json`);
}
for (const entry of entries) entry.availability.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || a.platform.localeCompare(b.platform));
const snapshot = {
  schemaVersion: 1, fetchedAt: new Date().toISOString(),
  source: { repository, commit, versionsURL },
  latestVersion: supported[0].version, releases: supported, platforms,
  scanned: entries.length,
  unavailable: entries.filter(e => !e.availability.length).map(e => e.name),
  extensions: entries.filter(e => e.availability.length),
};
const destination = 'src/data/haybarn-extensions/catalog.generated.json';
await mkdir('src/data/haybarn-extensions', { recursive: true });
await writeFile(`${destination}.tmp`, JSON.stringify(snapshot, null, 2) + '\n');
await rename(`${destination}.tmp`, destination);
console.log(`Published catalog: ${snapshot.extensions.length} available, ${snapshot.unavailable.length} unpublished. ${destination}`);
