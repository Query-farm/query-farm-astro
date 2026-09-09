# Haybarn function guide

The function guide is built and deployed by this Astro project. Its source is
under `src/haybarn-functions/`; the former `duckdb-function-docs` project is no
longer needed to build, test, or refresh it. Catalog descriptions, overloads,
and macro definitions come from `duckdb_functions()`. Named table arguments
are confirmed against the engine binder. SQLGlot translations retain their
source revision and are not presented as execution-verified equivalents.

## Routes

| Resource | Path |
| --- | --- |
| Find and try functions | `/products/haybarn/functions/` |
| Full current catalog | `/products/haybarn/functions/catalog/` |
| Current function | `/products/haybarn/functions/strftime/` |
| Explicit release catalog | `/products/haybarn/functions/releases/<release>/` |
| Explicit release function | `/products/haybarn/functions/releases/<release>/strftime/` |
| Recipes | `/products/haybarn/recipes/` |
| Playground | `/products/haybarn/playground/` |
| Function changes | `/products/haybarn/function-changes/` |
| Release manifest | `/products/haybarn/functions/api/v1/releases.json` |
| Agent discovery | `/products/haybarn/functions/llms.txt` |

The current function and catalog URLs follow the package pin. Explicit release
URLs remain available for every committed snapshot, including the current one.
JSON and Markdown links retain explicit releases so agent requests are
reproducible. The root `/llms.txt` points to the guide's discovery document.
The current release archive uses the stable page as its canonical and stays
out of the sitemap; older releases retain their own canonical URLs.
Open Graph metadata and favicons come from the shared site layout; function
pages supply their own titles, descriptions, and Haybarn sharing image.

## Search

One Pagefind index at `/pagefind/` serves two search experiences:

- Query Farm search includes `kind:page`, plus existing extension records
  (`kind:function`) when explicitly enabled. It excludes individual Haybarn
  function references even when that extension-function checkbox is enabled.
  The Haybarn guide landing page remains discoverable.
- Function search requires `scope:haybarn`, with the page's release and guide
  pages selected by default. Readers can explicitly include other releases.
  Function records contain all overloads, arguments, examples, macro bodies,
  aliases, and dialect translations. Reference HTML copies are not indexed
  again, so each function has one search record per snapshot.

The shared header opens company search. The Haybarn subnavigation and sidebar
open function search. `Cmd/Ctrl+K` and `/` open function search while inside the
guide. The dialogs have separate IDs and keyboard ownership. Development
serves the latest built index; run `npm run build` after changing searchable
content. Indexing failures fail the build.

## Updating the browser release

The exact `@haybarn/haybarn-wasm` version in `package.json` is the single pin
for both the function guide and Query Farm's existing browser examples.
`src/haybarn-functions/data/haybarn-release.mjs` derives the default snapshot
ID from it. Native CLI/install-channel versions continue to use the existing
Haybarn product snapshot; those releases can differ from the WASM package.

```sh
npm install --save-exact @haybarn/haybarn-wasm@NEW_VERSION
npx playwright install chromium
npm run refresh:haybarn-functions
npm run check
npm run test:haybarn-functions
npm run build
npm run test:haybarn-exports
npm run test:haybarn-browser
```

Refresh requires Python 3 and Git. It checks out the captured SQLGlot revision
under `.cache/sqlglot`, captures the installed WASM package through a private
Vite server, records named-argument bindings, prepares example inputs, and
executes candidate examples. This capture server can start before a new
release has a catalog. Older snapshots are retained. Review the generated
snapshot, bindings, example verification, package pin, and lockfile together.

To capture a published native engine, use `npm run snapshot:haybarn-functions
-- --binary /path/to/cli --engine duckdb --id duckdb-VERSION --label
"DuckDB VERSION" --source https://...`. The convenience command
`npm run snapshot:duckdb-functions` captures the release list maintained in
`scripts/haybarn-functions/capture-releases.mjs`.

## WASM delivery

`src/lib/repl/haybarn-bundles.ts` provides the same EH/MVP artifact URLs to both
browser runners. Workers and binaries load from the exact package version on
unpkg; `createWorker()` creates a same-origin blob worker. The guide retains
its isolated examples, Stop/reset behavior, and lazy engine startup.

Cloudflare Pages cannot host the 42–47 MiB binaries as site assets. They are
not bundled into `dist/`. `PUBLIC_HAYBARN_WASM_BASE_URL` can select another
artifact host; it must serve the matching package files with JavaScript/WASM
content types and appropriate CORS headers. The capture server instead serves
the installed package bytes locally. The postbuild manifest at
`/products/haybarn/functions/build-info.json` records versioned artifact URLs
and SHA-256 hashes; the build checks for accidentally bundled oversized assets.

## Verification

The browser suite covers SQL execution, Stop/restart, data formatting, named
arguments, varargs, operators, visible overloads, release comparisons,
translations, no-JavaScript references, mobile navigation, search isolation,
shared branding, and JSON/Markdown discovery. WASM transport is intercepted
in CI to serve the installed package; the SQL engine itself is real. A live
CDN browser smoke check should also accompany changes to artifact hosting.

`npm run check:examples` remains the separate native-extension documentation
checker. It uses its Python Haybarn environment, not the npm WASM runtime.
