# Query.Farm website

The static Astro site for [query.farm](https://query.farm): product pages,
DuckDB extension marketplace and reference material, Haybarn SQL functions, the VGI SDK docs, blog,
and company pages.

## Requirements

- Node.js 22
- npm
- Optional: `uv` for refreshing generated extension snapshots

Install dependencies with `npm ci`.

## Development

```sh
npm run dev       # local server at http://localhost:4321
npm run check     # Astro and TypeScript diagnostics
npm run build     # deterministic production build plus Pagefind index
npm run validate  # current CI gate: deterministic production build
npm run preview   # serve dist/ plus Pages Functions locally
```

`npm run build` consumes only files committed to the repository. It does not
fetch or rewrite release, usage, or binary-size data.

The Grainlift product prototype is at `/products/grainlift`. Its landing page
uses the shared site layout, product navigation, and design tokens; its catalog
entry lives in `src/data/products.ts`. It presents database proxying and custom
ADBC services, with an interactive architecture diagram and benchmark explorer.
Framework links lead to source repositories and runnable examples. Benchmark
provenance and illustration details are in `design/grainlift.md`.

## Generated data

Each extension under `src/data/extensions/<slug>/` has two inputs:

- `generated/` contains machine-produced function, compatibility, and usage
  snapshots. Do not hand-edit these files.
- `augment/` contains curated metadata, descriptions, examples, and category
  information.

Refresh all remote snapshots explicitly with:

```sh
npm run refresh:snapshots
```

This command can rewrite tracked files and requires `uv`; usage refreshes also
read `CF_API_TOKEN` and `CF_ACCOUNT_ID` from `.env`. Review and commit the
resulting snapshot changes separately from application changes. Individual
refresh commands are `fetch:versions`, `snapshot:usage`, and
`snapshot:binary-sizes`.

## Project map

- `src/pages/` — Astro routes and static endpoints
- `src/components/` — layout, product, documentation, diagram, and UI pieces
- `src/content/` — blog and Starlight VGI documentation
- `src/data/` — typed product data and extension discovery/merging
- `src/lib/repl/` — in-browser Haybarn/DuckDB shell
- `src/haybarn-functions/` — extracted function catalogs, guide components, and scoped search
- `scripts/haybarn-functions/` — function capture, verification, and indexing
- `scripts/` — snapshot, documentation-generation, and search-index tooling
- `extension-diff-tools/` — extension introspection and example validation
- `quick-reference/` — Typst sources, curated content, fonts, build tools, and validation records
- `public/quick-reference/` — extension PDFs, combined collection, and download archive

The extension loader validates merged data with Zod and intentionally fails the
build on schema mismatches. VGI SDK reference pages are generated from their
language repositories; see `VGI_DOCS_GUIDE.md` before editing those pages.
Visual changes should follow `DESIGN_BRIEF.md`.

## DuckDB release report

Preview `/blog/duckdb-2-release-activity/` with `npm run dev`. The old research
preview URL redirects to the blog post. It includes
the saved release analysis, interactive comparisons, a project-discussion CTA,
Open Graph artwork, and newsletter links/forms with GA4 click and submission
events. The article is published in ordinary production builds. Data export and
analytics semantics are documented in
[design/duckdb-release-report.md](design/duckdb-release-report.md).

## Extension PDF quick references

Every public extension documentation page links to its printable PDF below the
page description. PDFs live at `/quick-reference/<slug>.pdf`; the collection and
ZIP are in the same directory. Keep these rendered assets and their Typst sources
in the repository together. Ordinary website builds verify and copy existing PDFs;
they do not require Typst, DuckDB, or network access.

To update a guide, edit its content in `quick-reference/content/<slug>.json`.
Lindel and Stochastic use dedicated `.typ` files and shared `examples.json`.
The shared layout is `quick-reference/template.typ`; update the edition date in
`quick-reference/edition.json` when publishing a revised edition. Then run:

```sh
npm run generate:quick-references -- --check  # execute local SQL and regenerate
npm run check:quick-reference-layout         # check rendered pages
npm run build                               # verify assets and build linked pages
```

PDF regeneration needs Typst and Poppler; SQL checks also need DuckDB and the
installed extensions. Setup-dependent examples are recorded separately from
executed examples. For fixes awaiting community packages, pass
`--extension-dir /path/to/built-extensions` to the generation command; see the
workflow below for the six guides currently tested against repaired v1.5 builds.
The Node-only asset check runs before every site build and
rejects missing PDFs, catalog mismatches, or sources changed since rendering.
Include `quick-reference/` and `public/quick-reference/` together when committing
updates. See [the PDF workflow](quick-reference/README.txt) for prerequisites and
[the findings log](quick-reference/FINDINGS.txt) for versioned API discrepancies.

## Haybarn function guide

The guide is part of this site at `/products/haybarn/functions/`. It uses the
shared Query Farm header and Haybarn navigation. See
[HAYBARN_FUNCTIONS.md](HAYBARN_FUNCTIONS.md) for routes, search scopes, release
updates, WASM hosting, and verification commands.

## Haybarn community extensions

The discovery directory at `/products/haybarn/extensions` lists confirmed
published Haybarn builds. Query Farm extensions reuse their existing pages;
independent reference prototypes use shared documentation components and
inventories captured from loaded extensions. See
[HAYBARN_EXTENSIONS.md](HAYBARN_EXTENSIONS.md) for data sources, refresh commands,
search behavior, and verification.

## Deployment

`.github/workflows/deploy.yml` validates the site before deploying static Astro
assets and the machine-readable Haybarn routes to Cloudflare Pages. Pushes to
`main` publish production; pull requests receive Pages preview deployments.
The workflow requires the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

CI checks Astro types, the function catalogs, the combined build, exported
references, and browser behavior before deployment. Browser tests execute the
real pinned WASM package and serve its artifacts locally for deterministic CI.
CI also runs `npm run test:extension-install` against the built extension
catalog and documentation, including pages without a browser runner. It checks
the complete repository setup, qualified INSTALL/LOAD commands, later-session
instructions, and cookbook/reference examples. Older syntax is allowed only
inside the labeled pre-2.0 section. A native DuckDB 2.0.0 smoke test executes
A5's rendered installation SQL unchanged, then its documented LOAD command in
a second process, using temporary extension and repository directories. Both
processes must execute an A5 function. This exercises the shared installation
flow; it does not test native binary availability for every extension/platform.
Repository or download failures fail this check rather than being skipped.

Run it locally after `npm run build` with
`uv run --with duckdb==2.0.0 npm run test:extension-install`, or install
`tests/extensions/native-requirements.txt` in a virtual environment and set
`DUCKDB_TEST_PYTHON` to that environment's Python executable.
`EXTENSION_DOCS_DIST` can point at an existing build snapshot.

The extension browser checks discover every built page offering a WASM runner
and click every Run control, including cookbook, article, and tabbed examples.
The VGI map's separate Run control also executes its real query and must render
result markers; the live train board shares a query covered by the shell tests.
Each example uses the site's own isolated session, setup SQL, and displayed
query. Community extensions download from their published repository, and the
tests confirm the extension is loaded. Missing builds, failed setup or SQL,
rendering errors, and timeouts fail CI. Failures are collected per example;
they are not skipped or replaced with native results. Examples that need
credentials, external services, or prior setup are held to the same rule if
they offer Run. The suite does not supply private credentials or silently
invent setup. Each page attaches an `examples` JSON report with the exact SQL
and terminal output for failures.
Sample tables are recreated in each example's isolated database. Fixture COPY
statements create shared sample files once per page; a failed COPY still fails
the example. Extension pages expose their setup in “Sample data for the examples.”
Keep these sample files immutable across examples.

Use `-- expect-error: <message substring>` immediately before a statement that
deliberately demonstrates an error. The statement must fail with that message;
success, a different error, or any fixture failure still fails the check.
For a snippet that requires native facilities, add
`-- browser-unavailable: <specific reason>` inside its SQL block. The page shows
that reason instead of Run, and the browser test checks the explanation and
absence of a Run control. Do not use this to hide a missing promised WASM build.

CI retains failed browser reports and traces as the `browser-test-results`
artifact for seven days.

Run this subset with `npm run build` followed by `npm run test:extension-wasm`.
Use `-- --workers=4` to distribute independent pages across four browser
workers. To test an existing build snapshot while another build is running,
set `PLAYWRIGHT_DIST_DIR` to its directory and `PLAYWRIGHT_PORT` to a free port.
New runnable blocks are covered automatically. Also add a documented query
and expected result to `tests/extensions/wasm-examples.ts` when enabling a new
extension: these supplemental smoke checks assert representative result values.
The exhaustive checks verify execution, not equality with every illustrative
output table (some contain random values or live data). Regression tests inject
a missing binary and broken setup/SQL to ensure a later successful SELECT
cannot conceal a failure.

An extension with a published WASM artifact that cannot run in this site's
browser runtime can set `browserRunDisabledReason` in its authored metadata.
This removes Run controls from its reference pages and explains the limitation;
generated artifact snapshots do not override it. Cronjob uses this restriction
because its scheduler requires background threads.
The dynamic JSON, Markdown, and search routes are Pages Functions. The remaining
HTML and assets stay on Pages' static path and do not invoke a Function.
