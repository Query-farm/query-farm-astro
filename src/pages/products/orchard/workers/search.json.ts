// Full-text search documents for the Orchard worker directory: one per worker
// and one per catalog object (table, view, function, macro). Fetched lazily by
// src/scripts/orchard-worker-search.ts the first time someone searches.
import { searchDocuments } from '../../../../data/vgi-workers';

export function GET() {
  return new Response(JSON.stringify(searchDocuments()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
