// Single source of truth for the version-scoped Haybarn URLs and the current
// release's display strings.
//
// The featured release is NOT hand-maintained here — it is snapshotted at
// release refresh time from the status service (https://haybarn-status.query.farm/api/
// versions) by scripts/fetch-haybarn-versions.mjs, which writes
// haybarn-versions.generated.json. Run `npm run fetch:versions` to feature a new
// release; builds use the committed snapshot.
//
// Everything downstream — the status page route, the /products/haybarn/status redirect,
// the hero RC pill, the install commands, the extension package-name suffix —
// derives from the generated values below. The site features only the single
// latest version (older /products/haybarn/status/<v> pages are not generated).

import generated from './haybarn-versions.generated.json';

export const LATEST_HAYBARN_VERSION = generated.latestVersion;
export const LATEST_TAG = generated.latestTag;

// Map of version → latest rc tag. We feature a single version, so this has one
// entry; kept as a record because the status route's getStaticPaths iterates it.
export const HAYBARN_VERSION_TAGS: Record<string, string> = {
  [LATEST_HAYBARN_VERSION]: LATEST_TAG,
};

export const LATEST_STATUS_URL = `/products/haybarn/status/${LATEST_HAYBARN_VERSION}`;

// Derived display strings for the latest release.
export const LATEST_DUCKDB_VERSION = LATEST_HAYBARN_VERSION.replace(/^v/, '');
export const LATEST_RC = LATEST_TAG.replace(/^haybarn-v/, '');
export const LATEST_RC_PYPI = LATEST_RC.replace('-', '');
export const LATEST_PKG_SUFFIX = 'h' + LATEST_DUCKDB_VERSION.replace(/\./g, '-');

// Base URL for a release asset on GitHub Releases. Asset names are stable across
// releases (haybarn_cli-<platform>.zip, libhaybarn-<platform>.zip, SHA256SUMS);
// only the tag moves, so the download picker composes URLs from this.
export const RELEASE_ASSET_BASE =
  `https://github.com/Query-farm-haybarn/haybarn/releases/download/${LATEST_TAG}`;
