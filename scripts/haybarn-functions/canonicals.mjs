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

export function currentReferenceIds(snapshots, currentId) {
  const current = snapshots.find(snapshot => snapshot.id === currentId);
  if (!current) throw new Error(`Missing reference snapshot: ${currentId}`);
  return new Set(snapshots.filter(snapshot => snapshot.id === currentId || equivalentReference(snapshot, current)).map(snapshot => snapshot.id));
}
