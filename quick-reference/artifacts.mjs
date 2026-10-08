import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, catalog } from './catalog.mjs';

const digest = data => createHash('sha256').update(data).digest('hex');
const read = file => readFileSync(join(root, file));
const snapshotPath = join(root, 'quick-reference/artifacts.json');
const bespoke = new Set(['lindel', 'stochastic']);

function sourceHash(slug, validation) {
  const files = [
    'quick-reference/template.typ', 'quick-reference/build.mjs',
    'quick-reference/edition.json', 'quick-reference/edition.mjs',
    'quick-reference/runtime.mjs',
    'quick-reference/fonts/JetBrainsMono-Regular.ttf',
    'scripts/og-images/fonts/Petrona-600.ttf',
    'scripts/og-images/fonts/Petrona-700.ttf',
    'scripts/og-images/fonts/NotoSans-400.ttf',
    'scripts/og-images/fonts/NotoSans-500.ttf',
    'scripts/og-images/fonts/NotoSans-600.ttf',
    'public/media-kit/logo/mark.svg',
    `quick-reference/assets/${slug}.svg`,
    ...(bespoke.has(slug) ? [
      `quick-reference/${slug}.typ`, 'quick-reference/examples.json',
      'quick-reference/prototypes.mjs',
      `quick-reference/assets/${slug === 'lindel' ? 'curves' : 'probability'}.svg`,
    ] : ['quick-reference/guide.typ', `quick-reference/content/${slug}.json`]),
  ];
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(read(file)).update('\0');
  const checked = validation[slug];
  hash.update(JSON.stringify({ status: checked?.status, duckdb: checked?.duckdb, extension: checked?.extension, source: checked?.source }));
  if (!bespoke.has(slug)) {
    const metadata = JSON.parse(read(`src/data/extensions/${slug}/augment/metadata.json`));
    // Only metadata used by the PDF belongs here; changes to web copy and
    // usage snapshots must not force unrelated PDF regeneration.
    hash.update(JSON.stringify({ source: metadata.githubUrl }));
  }
  return hash.digest('hex');
}

export function currentArtifacts() {
  const directory = JSON.parse(read('quick-reference/directory.json'));
  const slugs = catalog.map(entry => entry.slug);
  if (JSON.stringify(directory.map(entry => entry.slug)) !== JSON.stringify(slugs)) {
    throw new Error('Quick-reference directory does not match the public extension catalog.');
  }
  const validation = JSON.parse(read('quick-reference/validation.json'));
  const guides = directory.map(entry => {
    const file = `public/quick-reference/${entry.slug}.pdf`;
    const pdf = read(file);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${file} is not a PDF`);
    return { slug: entry.slug, pages: entry.pages, sourceSha256: sourceHash(entry.slug, validation),
      pdfSha256: digest(pdf), bytes: pdf.length };
  });
  const bundles = ['index.pdf', 'query-farm-extensions.pdf', 'query-farm-quick-references.zip'].map(name => {
    const data = read(`public/quick-reference/${name}`);
    return { name, sha256: digest(data), bytes: data.length };
  });
  return { schemaVersion: 1, indexSourceSha256: digest(Buffer.concat([
    read('quick-reference/index.typ'), read('quick-reference/directory.json'),
    read('quick-reference/assets/catalog.svg'),
  ])), guides, bundles };
}

export function recordArtifacts() {
  writeFileSync(snapshotPath, JSON.stringify(currentArtifacts(), null, 2) + '\n');
}

export function checkArtifacts() {
  const saved = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const current = currentArtifacts();
  const stale = current.guides.filter(guide => {
    const previous = saved.guides.find(item => item.slug === guide.slug);
    return JSON.stringify(previous) !== JSON.stringify(guide);
  }).map(guide => guide.slug);
  if (stale.length || JSON.stringify(current) !== JSON.stringify(saved)) {
    throw new Error(`Quick-reference artifacts are stale${stale.length ? `: ${stale.join(', ')}` : ' (directory or collection)'}.`);
  }
  return current;
}
