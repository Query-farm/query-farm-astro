import { defaultSnapshot, canonicalSnapshot, type Snapshot, type FunctionDoc } from './catalog';
import { usageFor } from './usage-guides';
import { isOperatorName, referenceName } from '../../../scripts/haybarn-functions/notation.mjs';

export function referenceBrand(snapshot: Snapshot) {
  return canonicalSnapshot(snapshot) === defaultSnapshot ? 'Haybarn SQL' : snapshot.label;
}

// Searchers look for "duckdb <function>", not Haybarn, so canonical pages lead
// with DuckDB. Archived release pages keep their release label for uniqueness.
function functionTitle(snapshot: Snapshot, fn: FunctionDoc, purpose: string | undefined) {
  const name = referenceName(fn.name);
  if (canonicalSnapshot(snapshot) !== defaultSnapshot) return `${name}: ${purpose ?? 'SQL reference'} | ${snapshot.label}`;
  if (purpose) return `DuckDB ${name}: ${purpose}`;
  return `DuckDB ${name} ${isOperatorName(fn.name) ? 'operator' : 'function'} reference`;
}

export function functionMetadata(snapshot: Snapshot, fn: FunctionDoc) {
  const usage = usageFor(snapshot, fn.name);
  const canonical = canonicalSnapshot(snapshot) === defaultSnapshot;
  const brand = canonical ? 'DuckDB' : referenceBrand(snapshot);
  const summary = usage?.summary || fn.description || `Review ${fn.overloads.length} recorded ${fn.overloads.length === 1 ? 'signature' : 'signatures'}, argument types, return types, and release availability.`;
  const description = `${referenceName(fn.name)} in ${brand}: ${summary}`.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return {
    title: functionTitle(snapshot, fn, usage?.purpose),
    description: description.length <= 200 ? description : `${description.slice(0, 197).replace(/\s+\S*$/, '').replace(/[.,;:]$/, '')}…`,
  };
}
