// Single source of truth for the version-scoped Haybarn URLs and the current
// release's display strings.
//
// The featured release is NOT hand-maintained here — it is snapshotted at
// build time from the status service (https://haybarn-status.query.farm/api/
// versions) by scripts/fetch-haybarn-versions.mjs, which writes
// haybarn-versions.generated.json (run via the npm `prebuild` hook; the
// committed JSON is the offline fallback). To re-point the site at a newer rc,
// just rebuild — no edit here.
//
// Everything downstream — the status page route, the /haybarn/status redirect,
// the hero RC pill, the install commands, the extension package-name suffix —
// derives from the generated values below. The site features only the single
// latest version (older /haybarn/status/<v> pages are not generated).

import generated from './haybarn-versions.generated.json';

export const LATEST_HAYBARN_VERSION = generated.latestVersion;       // v1.5.3
const LATEST_TAG = generated.latestTag;                              // haybarn-v1.5.3-rc10

// Map of version → latest rc tag. We feature a single version, so this has one
// entry; kept as a record because the status route's getStaticPaths iterates it.
export const HAYBARN_VERSION_TAGS: Record<string, string> = {
  [LATEST_HAYBARN_VERSION]: LATEST_TAG,
};

export const LATEST_STATUS_URL = `/haybarn/status/${LATEST_HAYBARN_VERSION}`;

// Derived display strings for the latest release.
export const LATEST_DUCKDB_VERSION = LATEST_HAYBARN_VERSION.replace(/^v/, '');         // 1.5.3
export const LATEST_RC = LATEST_TAG.replace(/^haybarn-v/, '');        // 1.5.3-rc10
export const LATEST_RC_PYPI = LATEST_RC.replace('-', '');             // 1.5.3rc10
export const LATEST_PKG_SUFFIX = 'h' + LATEST_DUCKDB_VERSION.replace(/\./g, '-');      // h1-5-3
