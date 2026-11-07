// Machine-readable index of every Orchard worker — for agents, LLM tools and
// anyone scripting against the directory. Mirrors haybarn/extensions/catalog.json.
import { workers, generatedAt } from '../../../../data/vgi-workers';

const SITE = 'https://query.farm';

export function GET() {
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt,
      workers: workers.map(w => ({
        name: w.repo,
        slug: w.slug,
        catalog: w.catalog,
        title: w.displayTitle,
        description: w.blurb,
        language: w.language,
        categories: w.categoryIds,
        keywords: w.keywords,
        offering: w.offering,
        href: `${SITE}/products/orchard/workers/${w.slug}`,
        repository: w.repo_url,
        license: w.license ?? null,
        release: w.release ? { tag: w.release.tag, publishedAt: w.release.published_at ?? null } : null,
        platforms: w.platforms,
        image: w.image ?? null,
        attachSql: w.attachSql,
        objects: w.objects.map(o => ({ schema: o.schema, name: o.name, kind: o.kind, signature: o.signature, description: o.comment || null })),
      })),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
}
