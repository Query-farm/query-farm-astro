// Compare published versions, including rc2/rc10 and the final release. The
// WASM package version takes precedence over its underlying engine commit.
function releaseOrder(a, b) {
  const version = snapshot => (snapshot.runtime?.packageVersion ?? snapshot.engineVersion).replace(/^v/, '');
  const [baseA, ...previewA] = version(a).split('-');
  const [baseB, ...previewB] = version(b).split('-');
  return baseA.localeCompare(baseB, undefined, { numeric: true })
    || Number(previewB.length > 0) - Number(previewA.length > 0)
    || previewA.join('-').localeCompare(previewB.join('-'), undefined, { numeric: true });
}

export function comparisonSource(snapshots, current) {
  const earlier = snapshots.filter(snapshot => snapshot.engine === 'haybarn' && releaseOrder(snapshot, current) < 0);
  return earlier.sort((a, b) => releaseOrder(b, a))[0]
    ?? snapshots.filter(snapshot => snapshot.engine === 'duckdb').sort((a, b) => releaseOrder(b, a))[0];
}
