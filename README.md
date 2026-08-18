# Query.Farm website

The static Astro site for [query.farm](https://query.farm): product pages,
DuckDB extension marketplace and reference material, the VGI SDK docs, blog,
and company pages.

## Requirements

- Node.js 22
- npm
- Optional: `uv` for refreshing generated extension snapshots

Install dependencies with `npm ci`.

## Development

```sh
npm run dev       # local server at http://localhost:4321
npm run check     # Astro and TypeScript diagnostics (existing debt remains)
npm run build     # deterministic production build plus Pagefind index
npm run validate  # current CI gate: deterministic production build
npm run preview   # serve dist/ locally
```

`npm run build` consumes only files committed to the repository. It does not
fetch or rewrite release, usage, or binary-size data.

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
- `scripts/` — snapshot, documentation-generation, and search-index tooling
- `extension-diff-tools/` — extension introspection and example validation

The extension loader validates merged data with Zod and intentionally fails the
build on schema mismatches. VGI SDK reference pages are generated from their
language repositories; see `VGI_DOCS_GUIDE.md` before editing those pages.
Visual changes should follow `DESIGN_BRIEF.md`.

## Deployment

`.github/workflows/deploy.yml` validates the site before deploying it to
Cloudflare Pages. Pushes to `main` publish production; pull requests receive a
preview deployment. The workflow requires the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

`astro check` is installed and available, but is not yet a required CI gate:
the repository has a pre-existing diagnostics backlog in generated SDK examples
and legacy extension component types. New work should avoid increasing it.
