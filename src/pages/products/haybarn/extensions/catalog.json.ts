import { catalog, extensions } from '../../../../data/haybarn-extensions';
export function GET() {
  return new Response(JSON.stringify({
    schemaVersion: 1, fetchedAt: catalog.fetchedAt, source: catalog.source,
    latestVersion: catalog.latestVersion, releases: catalog.releases,
    extensions: extensions.map(extension => ({
      name: extension.name, displayName: extension.displayName, description: extension.description,
      publisher: extension.publisher, categories: extension.categories, aliases: extension.aliases,
      href: extension.href, repository: extension.repository, license: extension.license,
      availability: extension.availability, searchContent: extension.searchContent,
    })),
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
