# Haybarn community extension discovery

The directory lives at `/products/haybarn/extensions`. It includes every
descriptor with a confirmed community artifact for the current published
Haybarn release on at least one platform. Older releases are not listed.
Category pages use the same complete catalog.
Query Farm extensions link to their existing `/products/extensions/<name>`
pages. SheetReader and Google Sheets are the first independent reference
pages; other entries link to the maintainer's documentation or repository.

## Refresh availability

```sh
npm run refresh:haybarn-extensions
```

Requires Git, Node, and uv. The script maintains its own clone under `.cache`,
reads the full `haybarn-community-extensions` descriptor census, verifies
the current published engine release, and probes every platform for that release.
A descriptor or a successful CI job is never sufficient for inclusion. Platform
exclusions do not conceal artifacts that were already published.

The generated catalog records artifact ETags, sizes, dates, source commit, and
the excluded names. Network errors fail the refresh and preserve the previous
snapshot. Static builds use the committed snapshot without network requests.
To use a clean existing checkout:

```sh
npm run refresh:haybarn-extensions -- --community-dir /path/to/haybarn-community-extensions
```

`src/data/haybarn-extensions/taxonomy.mjs` holds reviewed categories and search
synonyms. It never decides whether an extension is available. New uncategorized
entries remain in All extensions; review them after a refresh.

## Capture the reference prototypes

```sh
npm run capture:haybarn-extensions
npm run test:haybarn-extension-examples
```

The capture script derives the Haybarn Python wheel version from the catalog's
current published release. It force-installs and loads each prototype in an
isolated cache, records engine and extension versions and an artifact checksum,
and compares `duckdb_functions()`, settings, types, secret types, views, and
schemas against a baseline with the same loaded dependencies. Named arguments
are checked against binder candidate signatures. Registered metadata remains
in `inventories/*.json`; developer explanations never replace that inventory.

Some extension capabilities, including COPY handlers, are not exposed by these
catalog functions. The Google Sheets write examples come from its developer
documentation rather than an invented registered-function entry.

`import-docs.mjs` imports selected SQL and argument explanations from pinned
sources, checking that the source revision matches the installed extension's
version. The SheetReader sample workbook is generated and queried with the
published native engine. Google authentication and writes are not executed by
the documentation scripts. A published WASM artifact alone does not enable a
Run button.

## Templates, search, and checks

`src/components/haybarn-extensions/ExtensionPage.astro` composes the existing
Query Farm hero, function reference, argument tables, code blocks, result tables,
and Haybarn navigation. There is no second copy of the Query Farm extension
documentation. `Directory.astro` serves the index and category routes.

The existing Pagefind build adds one `kind: haybarn-extension` record per
available extension. Discovery searches this scope, including developer text
and captured function names. General Query Farm and Haybarn function searches
retain their existing independent scopes. The public `catalog.json` endpoint
provides the same names, destinations, and platform availability for the current
release. The refresh script follows the status feed’s latest release automatically.

```sh
npm run check
npm run test:haybarn-extensions
npm run build
npx playwright test tests/haybarn-extensions
```

The browser checks cover complete listing, existing Query Farm destinations,
Pagefind discovery, combined filters, shareable URLs, no-JavaScript category
navigation, reference contents, the sample download, and mobile overflow.
