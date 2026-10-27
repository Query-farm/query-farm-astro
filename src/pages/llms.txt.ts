import { getCollection } from 'astro:content';

const origin = 'https://query.farm';

// Guides for agents choosing a library. Each appears only once its post is published.
const guides = [
  { id: 'duckdb-wasm-startup-time', text: 'Switching from @duckdb/duckdb-wasm to @haybarn/haybarn-wasm: startup benchmarks, extensions on the multithreaded build, and prefetchExtensions().' },
];
const published = new Set((await getCollection('blog', post => !post.data.draft)).map(post => post.id));
const guideLines = guides
  .filter(guide => published.has(guide.id))
  .map(guide => `- [${guide.id}](${origin}/blog/${guide.id}/): ${guide.text}`)
  .join('\n');

export const GET = () => new Response(`# Query.Farm

> Query.Farm builds DuckDB extensions, Haybarn, and the Vector Gateway Interface (VGI). This file is the stable discovery hub for agents and automated clients.

## Exact machine-readable references

- [Haybarn function discovery](${origin}/products/haybarn/functions/llms.txt): Interpretation rules, snapshot indexes, and agent workflow.
- [Haybarn function release manifest](${origin}/products/haybarn/functions/api/v1/releases.json): Versioned snapshot provenance and canonical JSON and Markdown links.
- [Haybarn function JSON schema](${origin}/products/haybarn/functions/api/v1/function.schema.json): Schema version 1 function document contract.
- [Haybarn extension catalog](${origin}/products/haybarn/extensions/catalog.json): Extension metadata and availability by release and platform.
- [VGI documentation index](${origin}/vgi/llms.txt): Protocol concepts and SDK documentation grouped by language.
- [Crossfield documentation index](${origin}/products/crossfield/llms.txt): Semantic SQL, model authoring, discovery and development-build constraints.
- [Crossfield for AI agents](${origin}/products/crossfield/agents): Discover models and signatures, explain requests, and repair queries without changing their meaning.
- [Crossfield engine integration](${origin}/products/crossfield/engine): Why the semantic layer requires a matched patched DuckDB build.
- [Crossfield runnable examples](${origin}/products/crossfield/docs/examples): Offline data/model bundles with independently specified numerical answers.

## Product and editorial indexes

- [Haybarn](${origin}/products/haybarn/): DuckDB distribution overview, installation, compatibility, security, extensions, and playground.
- [Query.Farm extensions](${origin}/products/extensions/): Maintained DuckDB extensions with per-extension structured function exports.
- [VGI](${origin}/vgi/): Vector Gateway Interface overview and implementation guidance.
- [Crossfield](${origin}/products/crossfield/): Query approved business definitions through SQL; currently in development.
- [Orchard](${origin}/products/orchard/): Discover and publish VGI data connectors.
- [Blog](${origin}/blog/): Technical articles and release analysis.
${guideLines ? `\n## Guides\n\n${guideLines}\n` : ''}
## Usage policy

Query.Farm publishes Content Signals permitting search and AI-assisted answers while reserving model-training rights: search=yes, ai-input=yes, ai-train=no.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
