#!/usr/bin/env node
// LinkedIn document-post edition of the quick references: one 4:5 slide per
// extension with large type, built from the same curated content as the PDFs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, catalog } from './catalog.mjs';
import { creationTimestamp } from './edition.mjs';

const MAX_LINES = 12;
const MAX_WIDTH = 47;
const categories = ['connectors', 'transformation', 'analytics', 'performance', 'quality', 'devtools'];
const categoryLabels = {
  connectors: 'Connectors', transformation: 'Transformation', analytics: 'Analytics',
  performance: 'Performance', quality: 'Data quality', devtools: 'Developer tools',
};
const examples = JSON.parse(readFileSync(join(root, 'quick-reference/examples.json'), 'utf8'));
// The bespoke sheets have no content JSON; give them the same shape.
const bespoke = {
  lindel: {
    subtitle: 'Space-filling curves for faster range filters.',
    intro: 'Hilbert and Morton encodings turn several columns into one sortable key. Ordering Parquet by that key keeps nearby points in the same row groups, so range filters skip more of the file.',
    flow: ['Multi-column keys', 'Hilbert order', 'Pruned Parquet'],
    examples: [{ title: 'Cluster a Parquet file on two columns', sql: examples.lindel.parquet }],
  },
  stochastic: {
    subtitle: 'Probability distributions as SQL functions.',
    intro: 'Densities, cumulative probabilities, quantiles and random samples for common continuous and discrete distributions, callable from any query.',
    flow: ['Distributions', 'PDF · CDF · quantile', 'Sampling'],
    examples: [{ title: 'Estimate π with a Monte Carlo query', sql: examples.stochastic.monte_carlo }],
  },
};

function pickExample(slug, list) {
  const fits = list.filter(example => {
    const lines = example.sql.trim().split('\n');
    return lines.length <= MAX_LINES && Math.max(...lines.map(line => line.length)) <= MAX_WIDTH;
  });
  if (!fits.length) throw new Error(`${slug}: no example fits a slide`);
  // The longest example that fits shows the most.
  const score = example => example.sql.split('\n').length;
  return fits.reduce((best, example) => (score(example) > score(best) ? example : best));
}

const slides = catalog.map(item => {
  const data = bespoke[item.slug] ?? JSON.parse(readFileSync(join(root, `quick-reference/content/${item.slug}.json`), 'utf8'));
  const example = pickExample(item.slug, data.examples);
  return {
    slug: item.slug,
    title: data.title ?? item.displayName,
    subtitle: data.subtitle.replace(/\.?$/, '.'),
    category: item.category,
    categoryLabel: categoryLabels[item.category] ?? item.category,
    flow: data.flow,
    intro: data.intro,
    exampleTitle: example.title,
    sql: example.sql.trim(),
    setup: Boolean(example.mode && example.mode !== 'local'),
  };
}).sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || a.title.localeCompare(b.title));

const work = join(root, 'quick-reference/linkedin.json');
writeFileSync(work, JSON.stringify({
  slides,
  groups: categories.map(key => ({ label: categoryLabels[key], items: slides.filter(s => s.category === key).map(({ slug, title }) => ({ slug, title })) })),
}, null, 2) + '\n');

const outputDir = join(root, 'public/media/posts/duckdb-extension-quick-references');
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, 'query-farm-duckdb-extensions-linkedin.pdf');
execFileSync('typst', ['compile', '--root', root,
  '--creation-timestamp', creationTimestamp,
  '--font-path', join(root, 'scripts/og-images/fonts'),
  '--font-path', join(root, 'quick-reference/fonts'),
  join(root, 'quick-reference/linkedin.typ'), output,
], { cwd: root, stdio: 'inherit' });
console.log(`Rendered ${slides.length + 3} slides → ${output.replace(root + '/', '')}`);
