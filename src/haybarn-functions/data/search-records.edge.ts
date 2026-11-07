// Search records for the Pages Functions bundle: fetched once per isolate from
// a static copy instead of bundled. See function-data-paths.mjs.
import { SEARCH_ASSET_PATH } from './function-data-paths.mjs';
import type { SearchRecord } from './search-records';

export type { SearchRecord };

let records: SearchRecord[] | undefined;
let pending: Promise<void> | undefined;

export function getSearchRecords(): SearchRecord[] {
  if (!records) throw new Error('Search records have not been loaded. Call loadSearchRecords() first.');
  return records;
}

/** A failed load is retried on the next request. */
export function loadSearchRecords(fetchJson: (path: string) => Promise<unknown>): Promise<void> {
  pending ??= fetchJson(SEARCH_ASSET_PATH).then(data => {
    if (!Array.isArray(data)) throw new Error('Bad static search records');
    records = data as SearchRecord[];
  }, error => {
    pending = undefined;
    throw error;
  });
  return pending;
}
