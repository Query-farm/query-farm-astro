// Single source of truth for the version-scoped Haybarn URLs and the current
// release's display strings.
//
// To feature a new release: add a row to HAYBARN_VERSION_TAGS and bump
// LATEST_HAYBARN_VERSION. Everything downstream — the status page routes,
// the /haybarn/status redirect, the hero RC pill, the install commands, the
// extension package-name suffix — derives from here. Keep older versions in
// the map so their /haybarn/status/<version> pages stay live.

export const HAYBARN_VERSION_TAGS: Record<string, string> = {
  'v1.5.2': 'haybarn-v1.5.2-rc13',
  'v1.5.3': 'haybarn-v1.5.3-rc1',
};

export const LATEST_HAYBARN_VERSION = 'v1.5.3';

export const LATEST_STATUS_URL = `/haybarn/status/${LATEST_HAYBARN_VERSION}`;

// Derived display strings for the latest release. Computed from the entries
// above so a version bump never has to touch these.
const LATEST_TAG = HAYBARN_VERSION_TAGS[LATEST_HAYBARN_VERSION];      // haybarn-v1.5.3-rc1
export const LATEST_DUCKDB_VERSION = LATEST_HAYBARN_VERSION.replace(/^v/, '');         // 1.5.3
export const LATEST_RC = LATEST_TAG.replace(/^haybarn-v/, '');        // 1.5.3-rc1
export const LATEST_RC_PYPI = LATEST_RC.replace('-', '');             // 1.5.3rc1
export const LATEST_PKG_SUFFIX = 'h' + LATEST_DUCKDB_VERSION.replace(/\./g, '-');      // h1-5-3
