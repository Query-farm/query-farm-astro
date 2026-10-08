#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, catalog } from './catalog.mjs';
import { recordArtifacts } from './artifacts.mjs';
import { creationTimestamp, revisionLabel } from './edition.mjs';
import { extensionRuntime } from './runtime.mjs';

const args = process.argv.slice(2);
let check = false;
let only;
let extensionDir;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') check = true;
  else if (args[i] === '--only' && args[i + 1]) only = args[++i];
  else if (args[i] === '--extension-dir' && args[i + 1]) extensionDir = args[++i];
  else throw new Error('Usage: node quick-reference/build.mjs [--check] [--only slug] [--extension-dir path]');
}
const runtime = extensionRuntime(extensionDir);
if (only && !catalog.some(item => item.slug === only)) throw new Error(`Not a public extension: ${only}`);
const selected = catalog.filter(item => !only || item.slug === only);
const prototypes = new Set(['lindel', 'stochastic']);
const output = join(root, 'public/quick-reference');
mkdirSync(output, { recursive: true });
const reportPath = join(root, 'quick-reference/validation.json');
let report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};

function compile(source, destination, inputs = {}) {
  execFileSync('typst', ['compile', '--root', root,
    '--creation-timestamp', creationTimestamp,
    '--font-path', join(root, 'scripts/og-images/fonts'),
    '--font-path', join(root, 'quick-reference/fonts'),
    ...Object.entries(inputs).flatMap(([key, value]) => ['--input', `${key}=${value}`]),
    join(root, source), join(output, destination),
  ], { cwd: root, stdio: 'inherit' });
}

function validateContent(data, slug) {
  for (const key of ['title', 'subtitle', 'intro']) if (!data[key]) throw new Error(`${slug}: missing ${key}`);
  if (data.flow?.length !== 3) throw new Error(`${slug}: flow needs three stages`);
  for (const key of ['reference', 'notes', 'examples']) if (!data[key]?.length) throw new Error(`${slug}: missing ${key}`);
  for (const example of data.examples) {
    if (!['local', 'external', 'manual'].includes(example.mode)) throw new Error(`${slug}: invalid example mode`);
    if (example.mode !== 'local' && !example.reason) throw new Error(`${slug}: nonlocal example needs reason`);
    if (!example.title || !example.sql || !example.caption) throw new Error(`${slug}: incomplete example`);
  }
}

function checkContent(data, slug) {
  const extension = runtime(slug);
  const temporary = mkdtempSync(join(tmpdir(), `qf-${slug}-`));
  const local = data.examples.filter(example => example.mode === 'local');
  const deferred = data.examples.filter(example => example.mode !== 'local').map(({ title, mode, reason }) => ({ title, mode, reason }));
  try {
    let version;
    try {
      const text = execFileSync('duckdb', [...extension.args, '-json', '-c', `${extension.load} SELECT version() AS duckdb, extension_version AS extension FROM duckdb_extensions() WHERE extension_name='${slug}';`],
        { cwd: temporary, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
      version = JSON.parse(text)[0];
    } catch (error) {
      if (local.length) throw new Error(`${slug}: cannot run local examples: ${error.stderr || error.message}`);
      report[slug] = { status: 'source-reviewed', localExamples: 0, deferred, reason: `Extension unavailable on the validation host (${process.platform}, ${process.arch}).` };
      console.log(`${slug}: source-reviewed; ${deferred.length} examples require external setup or interaction`);
      return;
    }
    const sql = [
      ...(data.dependencies || []).map(dependency => `LOAD ${dependency};`),
      extension.load, data.setup || '',
      ...local.map(example => example.sql),
      ...(Array.isArray(data.assertions) ? data.assertions : [data.assertions || '']),
    ].join('\n');
    execFileSync('duckdb', [...extension.args, '-bail', '-batch', '-c', sql], {
      cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    });
    report[slug] = { status: local.length ? 'passed' : 'source-reviewed', ...version, ...extension.provenance, localExamples: local.length, deferred };
    console.log(`${slug}: ${local.length} local examples passed; ${deferred.length} require setup/interaction`);
  } catch (error) {
    throw new Error(`${slug} validation failed:\n${error.stderr || error.message}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (selected.some(item => prototypes.has(item.slug))) {
  execFileSync(process.execPath, [join(root, 'quick-reference/prototypes.mjs'), ...(check ? ['--check'] : []),
    ...(extensionDir ? ['--extension-dir', extensionDir] : [])], { cwd: root, stdio: 'inherit' });
  if (check) {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  }
}
for (const item of selected) {
  if (prototypes.has(item.slug)) continue;
  const source = join(root, `quick-reference/content/${item.slug}.json`);
  if (!existsSync(source)) throw new Error(`Missing reference content for public extension ${item.slug}`);
  const data = JSON.parse(readFileSync(source, 'utf8'));
  validateContent(data, item.slug);
  if (check) {
    checkContent(data, item.slug);
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  const checked = report[item.slug];
  const revision = revisionLabel(item.slug, checked);
  compile('quick-reference/guide.typ', `${item.slug}.pdf`, { extension: item.slug, revision });
  console.log(`Rendered ${item.slug}.pdf`);
}
if (check) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

// A directory and combined volume accompany the standalone references.
if (!only) {
  let start = 2;
  const directory = catalog.map(item => {
    const info = execFileSync('pdfinfo', [join(output, `${item.slug}.pdf`)], { encoding: 'utf8' });
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!pages) throw new Error(`Cannot determine page count for ${item.slug}`);
    if (pages !== (item.slug === 'stochastic' ? 2 : 1)) throw new Error(`${item.slug}: unexpected ${pages} pages; inspect layout`);
    const title = prototypes.has(item.slug) ? item.displayName : JSON.parse(readFileSync(join(root, `quick-reference/content/${item.slug}.json`), 'utf8')).title;
    const entry = { slug: item.slug, title, page: start, pages, category: item.category };
    start += pages;
    return entry;
  });
  writeFileSync(join(root, 'quick-reference/directory.json'), JSON.stringify(directory, null, 2) + '\n');
  copyFileSync(join(root, 'public/media-kit/logo/mark.svg'), join(root, 'quick-reference/assets/catalog.svg'));
  compile('quick-reference/index.typ', 'index.pdf');
  execFileSync('pdfunite', [join(output, 'index.pdf'), ...catalog.map(item => join(output, `${item.slug}.pdf`)), join(output, 'query-farm-extensions.pdf')]);
  const zip = join(output, 'query-farm-quick-references.zip');
  if (existsSync(zip)) rmSync(zip);
  execFileSync('zip', ['-q', '-j', zip, ...catalog.map(item => join(output, `${item.slug}.pdf`)), join(output, 'index.pdf')]);
  recordArtifacts();
  console.log(`Collection: ${catalog.length} extension PDFs, ${start - 1} pages including directory.`);
}
