// Search records for Node (tests, the preview server). The Pages Functions
// bundle resolves #haybarn-search to search-records.edge.ts instead, which
// fetches a static copy. See function-data-paths.mjs.
import records from './search.generated.json';

export interface SearchRecord {
  snapshotId: string;
  release: string;
  name: string;
  description: string;
  url: string;
  content: string;
}

export function getSearchRecords(): SearchRecord[] {
  return records as SearchRecord[];
}

/** The records are imported above, so there is nothing to fetch. */
export async function loadSearchRecords(_fetchJson: (path: string) => Promise<unknown>): Promise<void> {}
