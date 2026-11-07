# Orchard open-worker directory (prototype)

Branch `proto/orchard-vgi-workers`. A directory of the 101 public VGI workers under
`/products/orchard/workers/`. All data comes from each worker's released build, attached
through haybarn 2.0's community `vgi` extension.

## What's here

| Piece | Path |
|---|---|
| Harvest (GitHub, then attach each release on the EC2 box, then merge) | `scripts/vgi-workers/harvest.py` |
| Harvested data (101 workers, 4.8 MB) | `src/data/vgi-workers/catalog.generated.json` |
| Zod schema, including the `offering` field (open/paid, self-run/managed) | `src/data/vgi-workers/schema.ts` |
| Curated taxonomy: 12 categories and search aliases | `src/data/vgi-workers/taxonomy.mjs` |
| Facets, install recipes, ATTACH SQL, search documents | `src/data/vgi-workers/index.ts` |
| Directory: search, facets, category rail | `workers/index.astro`, `components/orchard/WorkerDirectory.astro` |
| Category pages | `workers/category/[category].astro` |
| Worker page: quick start, examples, agent questions, catalog explorer, author checklist | `workers/[slug].astro`, `components/orchard/CatalogExplorer.astro` |
| Client full-text search (MiniSearch, index lazy-loaded) | `src/scripts/orchard-worker-search.ts`, `workers/search.json.ts` |
| Machine-readable index | `workers/catalog.json` |
| ⌘K site search records for every table and function | `scripts/build-search-index.mjs` |

Shared edits:
- `OrchardSubNav.astro` gains an "Open workers" tab.
- The Orchard landing page gains an "Open workers" section.
- `CodeTabs` now accepts a per-step `lang`, for a bash download step followed by a SQL attach step.

## Problems the harvest found (fix these before launch)

1. **13 Go/Rust Linux release binaries need glibc ≥ 2.35.** They won't start on RHEL 9 or
   Amazon Linux 2023, which have 2.34.
   - Affected: barcode, bgp, cbor, cve, elasticsearch, feed, fhir, fixedformat, media, odata,
     secretscan, threatintel, x509.
   - Fix in `vgi-actions`: build Linux targets against an older glibc (zig cc / cargo-zigbuild
     `-gnu.2.28`, or a manylinux container), or ship static musl builds.
   - The harvest only got them running inside an `ubuntu:24.04` container.
2. **vgi-nlp** declares `requires-python >=3.13` with no upper bound or `.python-version`.
   - uv picks 3.14, and `fasttext-wheel` has no 3.14 wheel.
   - Fix: pin `.python-version` to 3.13, or cap requires-python.
3. **vgi-libpostal** can't run without the system libpostal C library and its ~2 GB of data.
   - The Docker image should be the documented way to run it.
   - It's the only worker whose catalog isn't indexed.
4. **READMEs disagree with the releases.**
   - 14 READMEs give no `LOCATION`: the 9 azure-* workers, iso20022, x12, netflow, reghive and
     ortools.
   - Many show build paths (`./target/release/color-worker`, `/path/to/vgi-tika-all.jar`).
   - The site now generates the quick start from the release assets. READMEs should do the same
     (see the generator suggestion below).
5. **63 scalar functions report `return_type` ANY.** These are all STRUCT returns, so the
   explorer can't show their fields. The SDKs or the extension's introspection should expose the
   struct type.
6. **No worker declares ATTACH options.** The "needs credentials" facet is therefore a text
   heuristic. The Azure, Google, search and news workers should declare their secret and
   attach-option requirements in the catalog.
7. **Lint scores come from the July `fleet.json`**, so the badge is stale. Re-run
   `vgi-lint fleet run` during the harvest.

## Suggestions

### SQL analysts — make the first query take one minute
- **One-line install with no download step.** Add an extension-side registry so that
  `ATTACH 'orchard:color'` (or `INSTALL color FROM orchard`) fetches the signed release for the
  host platform, verifies it, caches it and spawns it.
  - This is `INSTALL … FROM community`, applied to workers.
  - It removes the biggest friction point on every worker page (download, checksum, path).
- **Publish the Python workers to PyPI.** Then `LOCATION 'uvx vgi-conform'` works with no clone.
  Releases already build the wheel; only the publish step is missing.
- **Try in the browser.** Some Rust workers ship a `wasm` release asset (color has one). The site
  already boots haybarn-wasm for extension examples, so a "Try" button on the example queries
  would let analysts run them with zero install.
- **Bake example results.** Execute each `vgi.executable_examples` query during the harvest and
  store the result table, as the extension pages do with `bake-examples.py`. Analysts would see
  what a query returns before installing anything.
- **Detect the visitor's OS** and preselect the matching install tab; at the moment macOS is
  always first.

### Data users — find data, trust data
- **Group duplicate names in object search.** "holdings" currently returns nine ETF workers, one
  by one. Collapse these into one row ("holdings — 9 workers").
- **Provenance and freshness on live-data workers.** Show:
  - the upstream source (Yahoo, GDELT, SSGA…)
  - the data licence (Wikipedia is CC-BY-SA, for example)
  - rate limits
  - whether results are live or snapshot

  This should come from new catalog tags (`vgi.data_source`, `vgi.data_license`,
  `vgi.freshness`), not hand-written copy.
- **"Questions it can answer"** — the agent test tasks — is the most persuasive section for
  non-SQL users. Consider surfacing it in search results too.
- **An MCP / LLM entry point.** `catalog.json` plus `llms.txt` lets an agent pick a worker for a
  question ("which worker parses EDI 837?") and emit the ATTACH and query.

### Worker authors — your catalog is your listing
- **Add a `vgi-lint-check dump` command.** It would serialise `build_catalog()` to the JSON
  shape above. The harvest currently imports the library directly; a supported command makes
  the harvest reproducible for third-party authors.
- **Make the listing a release step.** Add a `vgi-actions` job that, on a release tag, runs
  `dump` and posts the record to the Orchard: a PR to this repo now, a registry API later. That
  replaces a central harvest box, which is what took the EC2 box down here.
- **Let authors self-classify.** Add a controlled-vocabulary catalog tag
  (`vgi.orchard_category`), validated by a lint rule. Today's `vgi.categories` are function
  groups inside a worker, not domains, so the taxonomy is curated by hand in `taxonomy.mjs`.
- **Listing quality gate.** Require lint ≥ 90 and every object documented. The "For worker
  authors" panel already shows each author which tags fed which section.
- **Local preview.** Add `vgi-lint preview` to render the worker page from a local build before
  release.
- **Generate README quick starts from release assets**, using the same recipe as
  `installMethods()` in `index.ts`, so the README and the site can't drift.

### Paid and managed workers
- **One record shape.** Every record carries `offering: {pricing, distribution}`.
  - Managed listings set `distribution: 'managed'` and give an HTTPS `LOCATION` plus a token
    flow.
  - Paid self-run workers set `pricing: 'paid'` and need licence-key handling in the worker.
- **Merge into one directory.** The existing hand-written connectors in `src/data/connectors.ts`
  should become records in the same directory, with an Open / Managed / Paid facet replacing
  the separate grid.
- **Show ownership.** Paid listings need publisher identity and verification badges once
  third-party authors publish.

## Running it
- Dev: `npx astro dev --port 4331` in this worktree, then open `/products/orchard/workers`.
- Re-harvest:
  1. On the Mac: `python3 scripts/vgi-workers/harvest.py github`.
  2. On the EC2 box: `catalog --jobs 10 --wrap … --container …`.
  3. On the Mac: `merge`.

  The `all` subcommand doesn't yet forward `--wrap` or `--container`.
