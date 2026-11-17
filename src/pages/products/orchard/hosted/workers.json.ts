// The slim worker list the hosted Orchard console and its Functions read:
// slug, name, ATTACH alias, open/paid, the latest release and the recent releases
// a customer may pick from. The full
// catalog.json is far too large to parse inside a Pages Function.
import { workers } from '../../../../data/vgi-workers';

export function GET() {
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      workers: workers.map(w => ({
        slug: w.slug,
        name: w.name,
        catalog: w.catalog,
        pricing: w.offering.pricing,
        version: w.release?.tag ?? null,
        versions: w.release?.versions?.length ? w.release.versions : w.release?.tag ? [w.release.tag] : [],
      })),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
}
