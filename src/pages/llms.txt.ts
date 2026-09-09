export const GET = () => new Response(`# Query.Farm

Products, DuckDB extensions, and developer documentation.

- [Haybarn function guide](/products/haybarn/functions/llms.txt): Engine-extracted signatures, arguments, examples, release snapshots, Markdown and JSON endpoints.
- [Haybarn](/products/haybarn/): Distribution overview, installation and extensions.
- [Extensions](/products/extensions/): Query.Farm extension documentation.
- [VGI documentation](/vgi/docs/concepts/): Protocol and SDK documentation.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
