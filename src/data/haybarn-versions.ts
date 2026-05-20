// Single source of truth for the version-scoped Haybarn URLs.
//
// Add a row here when a new DuckDB version starts cutting RCs; the
// dynamic-route page (`src/pages/haybarn/status/[version].astro`) generates
// /haybarn/status/<key> for every entry, and `/haybarn/status` redirects to
// LATEST_VERSION.

export const HAYBARN_VERSION_TAGS: Record<string, string> = {
  'v1.5.2': 'haybarn-v1.5.2-rc13',
};

export const LATEST_HAYBARN_VERSION = 'v1.5.2';

export const LATEST_STATUS_URL = `/haybarn/status/${LATEST_HAYBARN_VERSION}`;
