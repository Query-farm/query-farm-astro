// Machine-readable index of every Orchard worker — for agents, LLM tools and
// anyone scripting against the directory. Mirrors haybarn/extensions/catalog.json.
import { workers, generatedAt, VGI_SETUP } from '../../../../data/vgi-workers';

const SITE = 'https://query.farm';

export function GET() {
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt,
      workers: workers.map(w => ({
        name: w.name,
        repo: w.repo,
        slug: w.slug,
        catalog: w.catalog,
        title: w.displayTitle,
        description: w.blurb,
        language: w.language,
        categories: w.categoryIds,
        keywords: w.keywords,
        offering: w.offering,
        href: `${SITE}/products/orchard/connectors/${w.slug}`,
        repository: w.repo_url,
        license: w.license ?? null,
        release: w.release ? { tag: w.release.tag, publishedAt: w.release.published_at ?? null } : null,
        platforms: w.platforms,
        image: w.image ?? null,
        // Runnable as-is on stock DuckDB 2.0; Haybarn uses setup.haybarn instead.
        attachSql: `${VGI_SETUP.duckdb}\n\n${w.attachSql}`,
        setup: VGI_SETUP,
        // Declared secret types (vgi_secret_types()): keys, functions that need
        // them, and a ready-to-fill CREATE SECRET. Empty when none are needed.
        credentials: w.credentials.map(c => ({
          secretType: c.type,
          description: c.description,
          docUrl: c.docUrl,
          parameters: c.params,
          requiredBy: c.neededBy.map(f => f.name),
          createSecret: c.createSql,
        })),
        objects: w.objects.map(o => ({ schema: o.schema, name: o.name, kind: o.kind, signature: o.signature, description: o.comment || null })),
      })),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
}
