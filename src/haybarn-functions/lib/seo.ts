import { defaultSnapshot, canonicalSnapshot, type Snapshot, type FunctionDoc } from './catalog';
import { usageFor } from './usage-guides';
import { referenceName } from '../../../scripts/haybarn-functions/notation.mjs';

export function referenceBrand(snapshot: Snapshot) {
  return canonicalSnapshot(snapshot) === defaultSnapshot ? 'Haybarn SQL' : snapshot.label;
}

export function functionMetadata(snapshot: Snapshot, fn: FunctionDoc) {
  const usage = usageFor(snapshot, fn.name);
  const brand = referenceBrand(snapshot);
  const summary = usage?.summary || fn.description || `Review ${fn.overloads.length} recorded ${fn.overloads.length === 1 ? 'signature' : 'signatures'}, argument types, return types, and release availability.`;
  const description = `${referenceName(fn.name)} in ${brand}: ${summary}`.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return {
    title: `${referenceName(fn.name)}: ${usage?.purpose ?? 'SQL reference'} | ${brand}`,
    description: description.length <= 200 ? description : `${description.slice(0, 197).replace(/\s+\S*$/, '').replace(/[.,;:]$/, '')}…`,
  };
}
