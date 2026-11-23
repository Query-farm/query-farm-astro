import { groupFunctions } from './catalog.mjs';

// A package-only release may leave the reference unchanged. Never infer this
// from version numbers or signatures alone: descriptions and profiles matter.
export function equivalentReference(a, b) {
  if (!a.binarySha256 || !b.binarySha256) return false;
  // Most archives differ here. Avoid serializing their large catalogs at all.
  for (const key of ['engine', 'engineVersion', 'sourceId', 'binarySha256', 'scope']) {
    if (a[key] !== b[key]) return false;
  }
  const evidence = snapshot => [
    snapshot.runtime?.engine ?? null, snapshot.runtime?.bundle ?? null,
    snapshot.requestedExtensions, snapshot.loadedExtensions, snapshot.functions];
  return JSON.stringify(evidence(a)) === JSON.stringify(evidence(b));
}

// Function pages consolidate one function at a time. Each release archive is
// a near-copy of the current reference, so while a function still exists in
// the current release its archived pages name the current page as canonical
// and stay out of the sitemap; otherwise Google splits ranking across every
// release and favours stale copies. Functions that exist only in older
// releases keep their own archived page.
export function currentFunctionSlugs(snapshots, currentId) {
  const current = snapshots.find(snapshot => snapshot.id === currentId);
  if (!current) throw new Error(`Missing reference snapshot: ${currentId}`);
  return new Set(groupFunctions(current.functions).map(fn => fn.slug));
}

export function currentReferenceIds(snapshots, currentId) {
  const current = snapshots.find(snapshot => snapshot.id === currentId);
  if (!current) throw new Error(`Missing reference snapshot: ${currentId}`);
  return new Set(snapshots.filter(snapshot => snapshot.id === currentId || equivalentReference(snapshot, current)).map(snapshot => snapshot.id));
}
