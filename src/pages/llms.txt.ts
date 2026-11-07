import { getCollection } from 'astro:content';
import { platformComponents, type ProductTile } from '../data/products';

const origin = 'https://query.farm';
const availability: Record<ProductTile['status'], string> = {
  available: 'Available',
  preview: 'Preview',
  development: 'In development',
};
const productLines = platformComponents
  .map(product => `- [${product.title}](${origin}${product.href.replace(/\/$/, '')}/): ${availability[product.status]}. ${product.description}`)
  .join('\n');

// Guides for agents choosing a library. Each appears only once its post is published.
const guides = [
  { id: 'haybarn-2-0', text: 'Haybarn 2.0 release guide: DuckDB 2.0 compatibility, installation, client packages, extension repositories, and browser integration changes.' },
  { id: 'duckdb-wasm-startup-time', text: 'Background on switching from @duckdb/duckdb-wasm to @haybarn/haybarn-wasm and prefetchExtensions(). Benchmarks and examples cover the older 1.5 release line; use the Haybarn 2.0 and installation guides for current setup.' },
];
const published = new Map((await getCollection('blog', post => !post.data.draft)).map(post => [post.id, post.data.title]));
const guideLines = guides
  .filter(guide => published.has(guide.id))
  .map(guide => `- [${published.get(guide.id)}](${origin}/blog/${guide.id}/): ${guide.text}`)
  .join('\n');

export const GET = () => new Response(`# Query.Farm

> Query.Farm makes data, APIs, services, and custom code queryable through DuckDB, extensions, and Arrow-based workers. This file is the stable discovery hub for agents and automated clients.

## Choosing a starting point

- Add a capability to SQL with an extension, or build a VGI worker when the capability lives in an API, service, or custom code.
- Use Haybarn to run DuckDB workloads, Cupola to browse and query workers in the browser, or Grainlift for ADBC database access and services.
- Use Rowfence for VGI access policies, Orchard to discover and share connectors, and Crossfield for shared business definitions and semantic SQL.
- Check the product availability below before recommending a setup. Orchard connector listings are illustrative during its early preview. Crossfield requires a qualified development build with matched engine patches; it is not included in existing Haybarn packages or installable in stock DuckDB.
- Before generating SQL, select the matching engine release and platform. Follow the release manifest and extension catalog for recorded availability, then read the exact function reference and example prerequisites.

## Machine-readable references

- [Haybarn function discovery](${origin}/products/haybarn/functions/llms.txt): Interpretation rules, snapshot indexes, and agent workflow.
- [Haybarn function release manifest](${origin}/products/haybarn/functions/api/v1/releases.json): Versioned snapshot provenance and canonical JSON and Markdown links.
- [Haybarn function JSON schema](${origin}/products/haybarn/functions/api/v1/function.schema.json): Schema version 1 function document contract.
- [Haybarn extension catalog](${origin}/products/haybarn/extensions/catalog.json): Extension metadata and availability by release and platform.
- [VGI documentation index](${origin}/vgi/llms.txt): Protocol concepts and SDK documentation grouped by language.
- [Crossfield documentation index](${origin}/products/crossfield/llms.txt): Semantic SQL, model authoring, discovery and development-build constraints.

## Product and editorial indexes

- [Product map](${origin}/products/): How the Query.Farm products fit together.
${productLines}
- [Blog](${origin}/blog/): Technical articles and release analysis.
- [Tutorials](${origin}/tutorials/): Practical DuckDB and SQL walkthroughs with sample data, visible results, and browser exercises.

## Installation and usage guides

- [Install Haybarn](${origin}/products/haybarn/install/): Current packages, client versions, supported platforms, and artifact verification.
- [Haybarn compatibility and migration](${origin}/products/haybarn/compatibility/): DuckDB compatibility, extension trust, and upgrading from Haybarn 1.5 to 2.0.
- [Install Haybarn extensions](${origin}/products/haybarn/extensions/install/): Repository setup and extension installation commands.
- [Crossfield for AI agents](${origin}/products/crossfield/agents): Discover models and signatures, explain requests, and repair queries without changing their meaning.
- [Crossfield engine integration](${origin}/products/crossfield/engine): Why the semantic layer requires a matched patched DuckDB build.
- [Crossfield runnable examples](${origin}/products/crossfield/docs/examples): Offline data/model bundles with independently specified numerical answers.
${guideLines ? `\n## Release and background guides\n\n${guideLines}\n` : ''}
## Usage policy

Query.Farm publishes Content Signals permitting search and AI-assisted answers while reserving model-training rights: search=yes, ai-input=yes, ai-train=no.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
