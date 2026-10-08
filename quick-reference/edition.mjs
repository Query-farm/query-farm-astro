import { readFileSync } from 'node:fs';

export const { date: editionDate } = JSON.parse(readFileSync(new URL('./edition.json', import.meta.url), 'utf8'));
const timestamp = Date.parse(`${editionDate}T00:00:00Z`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(editionDate) || !Number.isFinite(timestamp)) {
  throw new Error('quick-reference/edition.json must contain an ISO date.');
}
export const creationTimestamp = String(timestamp / 1000);
export function revisionLabel(slug, checked) {
  return checked?.status === 'passed'
    ? `${editionDate} · DuckDB ${checked.duckdb.replace(/^v/, '')} · ${slug} ${checked.extension}${checked.source === 'local-build' ? ' · source build' : ''}`
    : `${editionDate} · Source-reviewed API reference`;
}
