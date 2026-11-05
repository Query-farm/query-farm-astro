import { wasmVersion } from '../haybarn-functions/data/haybarn-release.mjs';

// Native client versions checked against their registries on 2026-11-04.
// Clients publish independently of the engine; do not derive these from its tag.
export const HAYBARN_CLIENT_VERSIONS = {
  python: '2.0.0rc11',
  node: '2.0.0-rc11',
  rust: '1.20000.0-rc.11',
  go: 'v2.20000.0-rc.11',
  jdbc: '2.0.0-rc11',
  odbc: '2.0.0.0-rc11',
  wasm: wasmVersion,
} as const;
