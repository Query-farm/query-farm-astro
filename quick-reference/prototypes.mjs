#!/usr/bin/env node
// Original bespoke sheets and their result checks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creationTimestamp, revisionLabel } from './edition.mjs';
import { extensionRuntime } from './runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examples = JSON.parse(readFileSync(join(root, 'quick-reference/examples.json'), 'utf8'));
const extensions = ['lindel', 'stochastic'];
const flags = process.argv.slice(2);
let check = false;
let extensionDir;
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === '--check') check = true;
  else if (flags[i] === '--extension-dir' && flags[i + 1]) extensionDir = flags[++i];
  else throw new Error('Usage: node quick-reference/prototypes.mjs [--check] [--extension-dir path]');
}
const runtime = extensionRuntime(extensionDir);
const reportPath = join(root, 'quick-reference/validation.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};

// Run the exact SQL printed in the PDFs in a throwaway directory. COPY and
// CREATE TABLE examples cannot overwrite files or tables in the workspace.
if (check) {
  const temporary = mkdtempSync(join(tmpdir(), 'query-farm-reference-'));
  try {
    for (const slug of extensions) {
      const extension = runtime(slug);
      const assertions = slug === 'lindel' ? `
        SELECT CASE WHEN
          hilbert_encode([10,20]::UINTEGER[2]) = 884
          AND morton_encode([10,20]::UINTEGER[2]) = 408
          AND hilbert_decode(hilbert_encode([10,20]::UINTEGER[2]),2,false,true) = [10,20]::UINTEGER[2]
          AND morton_decode(morton_encode([10,20]::UINTEGER[2]),2,false,true) = [10,20]::UINTEGER[2]
          AND hilbert_decode(hilbert_encode([-10,20]::INTEGER[2]),2,false,false) = [-10,20]::INTEGER[2]
          AND hilbert_decode(hilbert_encode([-1]::INTEGER[1]),1,false,false) = [-1]::INTEGER[1]
          AND morton_decode(morton_encode([-1]::INTEGER[1]),1,false,false) = [-1]::INTEGER[1]
          AND hilbert_decode(hilbert_encode([1.25,-2.5]::DOUBLE[2]),2,true,false) = [1.25,-2.5]::DOUBLE[2]
          AND typeof(hilbert_encode([1,2]::UTINYINT[2])) = 'USMALLINT'
          AND typeof(hilbert_encode([1,2,3]::UINTEGER[3])) = 'UHUGEINT'
          AND typeof(hilbert_encode([1,2]::DOUBLE[2])) = 'UHUGEINT'
          AND (SELECT count(*) FROM 'points.parquet') = 6
          AND (SELECT count(*) FROM 'points.parquet' WHERE x BETWEEN 1 AND 3 AND y BETWEEN 1 AND 6) = 3
        THEN 'passed' ELSE error('Lindel reference assertion failed') END;
      ` : `
        SELECT CASE WHEN
          abs(dist_normal_quantile(0,1,0.95) - 1.6448536269514729) < 1e-12
          AND abs(dist_normal_cdf(0,1,1.96) - 0.9750021048517795) < 1e-12
          AND abs(dist_binomial_cdf(10,0.3,5) - 0.9526510126000001) < 1e-12
          AND abs(dist_poisson_cdf_complement(2.5,4) - 0.10882198108584878) < 1e-12
          AND dist_gamma_mean(2,3) = 6
          AND abs(dist_pareto_pdf(3,1,4) - 0.1875) < 1e-12
          AND abs(dist_uniform_int_pdf(1,6,3) - 1.0/6) < 1e-12
          AND abs(dist_uniform_int_cdf(1,6,3) - 0.5) < 1e-12
          AND abs(dist_uniform_int_mean(1,6) - 3.5) < 1e-12
          AND abs(dist_uniform_int_variance(1,6) - 35.0/12) < 1e-12
          AND (SELECT count(*) FROM synthetic_users) = 10000
          AND (SELECT count(DISTINCT height_cm) FROM synthetic_users) > 9900
          AND (SELECT bool_and(sessions >= 0) FROM synthetic_users)
          AND (SELECT typeof(converted) FROM synthetic_users LIMIT 1) = 'BOOLEAN'
          AND (SELECT count(*) FROM duckdb_functions() WHERE function_name LIKE 'dist_%_sample') = 22
        THEN 'passed' ELSE error('Stochastic reference assertion failed; review versioned caveats') END;
      `;
      execFileSync('duckdb', [...extension.args, '-bail', '-batch', '-c',
        `${extension.load}\n${Object.values(examples[slug]).join('\n')}\n${assertions}`],
      { cwd: temporary, stdio: ['ignore', 'pipe', 'inherit'] });
      const version = JSON.parse(execFileSync('duckdb', [...extension.args, '-json', '-c',
        `${extension.load} SELECT version() AS duckdb, extension_version AS extension FROM duckdb_extensions() WHERE extension_name='${slug}';`],
      { cwd: temporary, encoding: 'utf8', timeout: 30000 }))[0];
      report[slug] = { status: 'passed', ...version, ...extension.provenance, localExamples: Object.keys(examples[slug]).length, deferred: [] };
      console.log(`${slug}: all printed SQL examples and reference assertions passed`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}

mkdirSync(join(root, 'public/quick-reference'), { recursive: true });
for (const slug of extensions) {
  execFileSync('typst', [
    'compile', '--root', root,
    '--creation-timestamp', creationTimestamp,
    '--font-path', join(root, 'scripts/og-images/fonts'),
    '--font-path', join(root, 'quick-reference/fonts'),
    '--input', `revision=${revisionLabel(slug, report[slug])}`,
    join(root, `quick-reference/${slug}.typ`),
    join(root, `public/quick-reference/${slug}.pdf`),
  ], { cwd: root, stdio: 'inherit' });
  console.log(`Rendered public/quick-reference/${slug}.pdf`);
}
