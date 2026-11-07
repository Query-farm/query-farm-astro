// Static copies of the Haybarn function data, for the Pages Functions.
//
// The machine routes (JSON/Markdown exports, comparisons, search) run as Pages
// Functions, and Cloudflare caps a Functions bundle at 25 MiB. Importing the
// release snapshots and the search index put it over 30 MiB, so the edge build
// gets only snapshot metadata and fetches the data from these static files
// through env.ASSETS on its first request. Astro, the tests and the preview
// server still import the data directly.
//
// scripts/haybarn-functions/generate-snapshot-module.mjs and
// generate-function-search.ts write the files under public/ (gitignored).
export const FUNCTION_DATA_ROOT = '/haybarn-function-data/';
export const FUNCTION_DATA_PUBLIC_DIR = 'public/haybarn-function-data';
/** @param {string} id */
export const snapshotAssetPath = id => `${FUNCTION_DATA_ROOT}snapshots/${id}.json`;
export const SEARCH_ASSET_PATH = `${FUNCTION_DATA_ROOT}search.json`;
