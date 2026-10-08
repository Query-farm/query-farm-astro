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
The dynamic JSON, Markdown, and search routes are Pages Functions. The remaining
HTML and assets stay on Pages' static path and do not invoke a Function.
