#!/usr/bin/env node
// Build-time fetch of the featured Haybarn release from the status service.
//
// The query.farm site features a single "latest" Haybarn release across the
// hero pill, install commands, status route, and extension package suffixes
// (all derived in src/data/haybarn-versions.ts). Rather than hand-bump a
// constant every time a new rc tag lands, we snapshot the latest version here
// at build time and write it to the generated JSON the .ts module imports.
//
// Source of truth: https://haybarn-status.query.farm/api/versions — derived
// from the engine's discovered `haybarn-v*` tags. See the haybarn-status repo.
//
// Resilience: the committed generated JSON is the fallback. If the fetch fails
// (offline dev, service blip), we keep whatever is already on disk and warn,
// so a build never breaks on a transient network failure. Only a missing file
// AND a failed fetch is fatal.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENDPOINT = 'https://haybarn-status.query.farm/api/versions';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'haybarn-versions.generated.json');
const TIMEOUT_MS = 10_000;

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  let payload;
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    const existing = await readExisting();
    if (existing) {
      console.warn(`[haybarn-versions] fetch failed (${err.message}); keeping committed snapshot ${existing.latestTag}`);
      return;
    }
    console.error(`[haybarn-versions] fetch failed (${err.message}) and no committed snapshot exists at ${OUT}`);
    process.exit(1);
  }

  const latest = payload?.latest;
  if (!latest?.version || !latest?.tag) {
    const existing = await readExisting();
    if (existing) {
      console.warn(`[haybarn-versions] endpoint returned no usable latest; keeping committed snapshot ${existing.latestTag}`);
      return;
    }
    console.error('[haybarn-versions] endpoint returned no usable latest version and no committed snapshot exists');
    process.exit(1);
  }

  const generated = {
    // Versions carry a `v` prefix throughout the site (e.g. v1.5.3); the
    // endpoint returns the bare X.Y.Z, so normalize here.
    latestVersion: `v${latest.version}`,
    latestTag: latest.tag,
    publishedAt: latest.publishedAt ?? null,
    fetchedAt: payload.fetchedAt ?? null,
    source: ENDPOINT,
  };

  // Only rewrite when the meaningful release fields change. fetchedAt alone
  // would dirty the committed snapshot on every build for no benefit (the .ts
  // module reads only latestVersion/latestTag), so skip a write when nothing
  // material moved.
  const existing = await readExisting();
  const material = (o) => o && `${o.latestVersion}|${o.latestTag}|${o.publishedAt}`;
  if (existing && material(existing) === material(generated)) {
    console.log(`[haybarn-versions] featured release unchanged: ${generated.latestVersion} (${generated.latestTag})`);
    return;
  }

  await writeFile(OUT, JSON.stringify(generated, null, 2) + '\n', 'utf8');
  console.log(`[haybarn-versions] featured release: ${generated.latestVersion} (${generated.latestTag})`);
}

main();
