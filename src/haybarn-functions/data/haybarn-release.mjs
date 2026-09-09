import packageJson from '../../../package.json' with { type: 'json' };

// The installed package, default catalog, labels, capture tools and tests share
// one release pin. Historical snapshots retain their original version metadata.
export const wasmVersion = packageJson.dependencies['@haybarn/haybarn-wasm'];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(wasmVersion)) {
  throw new Error('Pin @haybarn/haybarn-wasm to an exact published version (npm install --save-exact).');
}
export const defaultSnapshotId = `haybarn-${wasmVersion}`;
