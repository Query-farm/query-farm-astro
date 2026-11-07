# Haybarn community extension discovery

The directory lives at `/products/haybarn/extensions`. It includes every
descriptor with a confirmed community artifact for the current published
Haybarn release on at least one platform. Older releases are not listed.
The directory and categories show 20 full-width entries per page, with complete
descriptions, extension icons, category links, and release/platform information.
Numbered pages have static HTML, ordinary next/previous links, and their own canonical URLs:
`/products/haybarn/extensions/page/2` and
`/products/haybarn/extensions/category/files/page/2`, for example. Every entry
is reachable without JavaScript. Each page's structured list describes only
that page's entries.

Search and publisher filters cover the complete directory (or selected
category), with 20 matches per page. Filter changes return to page one; page
links preserve the filters. Query Farm is the first publisher, followed by GitHub
repository owners in alphabetical order. Publisher counts reflect the query and
category; selected query/publisher filters can be removed individually. Legacy
platform and release URL parameters are removed. The browser
builds entries from the same template as the static pages, and the complete scoped search data also supports fallback
search when Pagefind is unavailable. Category pages never include unrelated
entries in either HTML or filter data.
`public/robots.txt` disallows crawling directory URLs with search or publisher
parameters, and legacy platform/release parameters, following Google's faceted navigation
guidance. Clean category and pagination URLs remain crawlable and in the sitemap.
These crawl rules do not guarantee removal of an already indexed URL.
Query Farm extensions link to their existing `/products/extensions/<name>`
pages. Every other current entry has a local `/products/haybarn/extensions/<name>`
guide with installation commands, usage examples, published platform artifacts,
and upstream documentation and source links. SheetReader and Google Sheets
retain their richer captured references; the older Google Sheets reference is
labeled with its captured release and excluded from current-release discovery.

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
documentation. `CommunityExtensionPage.astro` provides the remaining guides,
with a single install/load block followed by the usage example in the main
column. Contributor-supplied example descriptions, reported results, and function
reference links appear when available; missing examples link to upstream docs.
Project context and resources follow the SQL, with build provenance in a disclosure.
Its platform sidebar uses the same `ExtensionPlatforms.astro` rows, icons, and
architecture badges as Query Farm's documentation; downloads and sizes live in
a disclosure. The sidebar follows the main content on small screens.
Maintainer prose is rendered as text; examples are attributed to the pinned
descriptor and labeled as unverified on Haybarn. Long walkthroughs remain at
the upstream source. Installation commands are supplied separately for the
current Haybarn release.

When an extension has a `wasm_eh` build matching the site's pinned browser engine,
its page header and installation block offer **Try in browser**. The header
link is rendered in the initial HTML and opens the same session, including
when clicked before hydration completes. This reuses `ExampleShellMounter`
in session mode: the signed extension loads on demand, then an interactive SQL
prompt opens. Contributor examples are not run automatically; local files,
credentials, and external services may require setup. Native-only, threads-only,
and mismatched-version artifacts do not enable the control. Known browser
restrictions in extension metadata (such as Cronjob's scheduler) still apply.
`browser.mjs` also records three reproduced LOAD failures, scoped to the exact
runtime and artifact ETags. These guides retain their published WASM availability
and show a browser compatibility note. Refreshing those artifacts or the engine
re-enables eligibility, so rerun the real browser checks when either changes.
The exhaustive extension browser tests verify actual extension loading for each
session launcher as well as execution for each runnable example.

```sh
npx playwright test tests/extensions/all-examples.spec.ts --grep '/products/haybarn/extensions/' --workers=3
```

`Directory.astro` serves the index and category routes. Reviewed task guidance
lives in `guides.mjs`; it does not decide availability. Directory and category
pages emit CollectionPage/ItemList structured data matching their static entries.
Individual guides emit TechArticle data and source-project metadata. Shared
layouts provide canonical URLs and breadcrumbs; all current destinations are
included in the sitemap.

The existing Pagefind build adds one `kind: haybarn-extension` record per
available extension. Discovery searches this scope, including developer text
and captured function names. General Query Farm and Haybarn function searches
retain their existing independent scopes. The public `catalog.json` endpoint
provides the same names, local destinations, upstream documentation, and platform availability for the current
release. The refresh script follows the status feed’s latest release automatically.

```sh
npm run check
npm run test:haybarn-extensions
npm run build
npx playwright test tests/haybarn-extensions
```

The browser checks traverse every static page to verify complete coverage,
existing Query Farm destinations, Pagefind discovery, combined filters,
shareable URLs, pagination and search fallback, no-JavaScript category
navigation, reference contents, the sample download, and mobile overflow.

## Link previews

The directory, categories, installation guide, and independent extension pages
have individual 1200 × 630 sharing cards. Additional community guides reuse
their category's sharing card (or the directory card when uncategorized), with
their own page titles and descriptions. Page copy comes from
`src/data/haybarn-extensions/sharing.mjs`, which the image generator also reads.
The shared layout emits canonical URLs, Open Graph and Twitter metadata, and
content hashes on image URLs so updated artwork gets a fresh preview URL.
Regenerate and commit the images after changing the page copy or categories:

```sh
npm run generate:og-haybarn-extensions
```
