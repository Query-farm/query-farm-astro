# Search tutorial drafts

Branch: `content/search-tutorials-review`. The twenty-three MDX tutorials in `src/content/tutorials/` have `draft: true`.
The landing page is `/tutorials/`; each tutorial lives at `/tutorials/<slug>/`.
The development-only review route `/review/search-tutorials/` links to these new
URLs. Normal builds exclude draft tutorials and the review route. An empty
tutorial index is noindex. No publication or external GA setup
is performed by these scripts.

The tutorials use the shared article layout, shell, structured data, next-step
cards, and production-only GA loader. `src/data/tutorials/*.json` is the source
for displayed SQL, browser setup, visible sample tables, expected results, and downloads. CSV and Parquet downloads are exported from those exact fixtures; native checks verify every row. Every runnable example includes its result below the SQL, using the same expected rows checked by native and browser execution. The results capture script derives column names from DuckDB and plan excerpts from actual execution; excerpts omit timings and are labeled with their origin. Empty results and NULL values are explicit. Each example
gets its own database session. The comparison and metadata lessons use unique
Parquet file names. The changing-schema lesson initializes its four named sample
files when an example starts.

## Reproduce the checks

```sh
npm ci
node scripts/articles/sync-downloads.mjs
uv run --with duckdb==2.0.0 python scripts/articles/sync-data.py
uv run --with duckdb==2.0.0 python scripts/articles/sync-results.py
uv run --with duckdb==2.0.0 python scripts/articles/check-sql.py
npm run check
INCLUDE_DRAFTS=true npm run build
npm run dev -- --host 127.0.0.1 --port 4438
node scripts/articles/generate-figures.mjs
node --import tsx --test tests/tutorial-catalog.test.ts tests/tutorial-challenge.test.ts
node scripts/articles/check-catalog.mjs
node scripts/articles/check-routes.mjs
node scripts/articles/check-presentation.mjs
node scripts/articles/check-browser.mjs
node scripts/articles/check-challenges.mjs
node scripts/articles/check-analytics.mjs
```

Use the repository's current Node version with native TypeScript stripping
(the browser check imports the existing typed terminal test helpers). Do not
run it through tsx: esbuild's helper injection changes the Playwright init
function being serialized into the browser. `ARTICLE_PREVIEW_URL` can point to
another local server. Browser checks use real published WASM assets and execute
the displayed SQL; they do not mock the database. Artifacts go to
`/tmp/query-farm-articles-review/` to avoid triggering Astro's file watcher.
Do not run a build/typecheck or edit content during the browser checks: generated
file changes can reload the page while an example is running.

The PostgreSQL article has a standalone reproduction in
`public/media/posts/duckdb-postgresql-query-pushdown/reproduce.py`. It creates and
stops its own local PostgreSQL cluster and writes `evidence.json`. Its captured
fixture uses DuckDB 2.0.0, PostgreSQL 14.24, ADBC PostgreSQL 1.13.0, and scanner
build `02ccfac995`. Rows are measured at the remote scan, not as network bytes;
there is no new performance-speedup claim.

The pushdown tutorial is a four-minute diagnostic guide: the same aggregate,
two measured plans, and a short workflow for investigating a slow query. One
optional browser challenge checks an aggregate result; it does not simulate remote pushdown.
Connection setup is outside the reading path. For measurement reproduction,
download `reproduce.py` into an empty directory and run
`uv run --python 3.12 reproduce.py`. Inline script metadata pins DuckDB and ADBC;
uv supplies Python. PostgreSQL server tools are discovered through `pg_config`
or PATH. No existing server or connection string is needed. Use
`--sql query.sql` to run a reader's query while both attachments are live.
Evidence is saved before plan assertions so changed extension behavior can be
inspected. The temporary cluster is shut down on both success and failure.

## Analytics

Existing `try_extension`, `try_extension_ready`, `try_extension_failed`, and
`try_query_run` events gain authored `post` and `example_id` values for these
examples. The existing product card emits `post_next_step_click`. Tutorial events carry
`content_type: tutorial`; shell events also carry `page_type: tutorial`. The
existing `post` and `example_id` values remain stable across the URL change.

The tutorials also emit:

| Event | Parameters | Meaning |
| --- | --- | --- |
| `tutorial_copy` | `post`, `content_type`, `example_id` | Copy button clicked; not proof the clipboard write succeeded |
| `tutorial_download` | `post`, `content_type`, `resource` | Sample data/SQL or reproduction/evidence link clicked |
| `tutorial_visual_interaction` | `post`, `content_type`, `visual`, `choice` | Fixed matching case, snapshot reveal, or aggregation location selected |
| `tutorial_challenge_start` | `post`, `content_type`, `challenge_id` | First nonempty attempt |
| `tutorial_challenge_hint`, `tutorial_challenge_solution` | `post`, `content_type`, `challenge_id` | Help disclosure opened |
| `tutorial_challenge_attempt` | Common challenge fields, `attempt`, `outcome`, `assisted` | Actual query result passed, mismatched, or failed to execute/load |
| `tutorial_challenge_complete` | Common challenge fields, `attempts`, `assisted` | First passing result per page load |
| `tutorial_read_progress` | `post`, `content_type`, `percent` | 25/50/90% reached after 10/20/45 seconds of visible-tab time |

Milestones fire once per page load. They are qualified reading signals, not
proof a visitor read or understood the article. SQL, results, and freeform
errors are never event parameters. Local dev/preview loads no Google tag and
sends no production GA requests; tests replace `gtag` with an in-memory recorder.

For GA4 Explorations after publication, register event-scoped custom dimensions
for `post`, `content_type`, `example_id`, `resource`, `visual`, `choice`, `challenge_id`, `outcome`, `assisted`, and `percent` if the property does not
already have them. No GA account configuration was changed here. Keep tutorial
engagement separate from accepted-enquiry/key-event reporting.

## Human review

- Confirm the tone and technical explanation on desktop and mobile.
- Inspect the visible input tables, try each interactive diagram, then run and edit the examples. Full setup SQL is also available in a disclosure.
- Review the numerical claims against the included fixtures/evidence.
- When approving publication, set the actual publication date and clear
  `draft: true`. The review page remains a preview-only route.

Rendered prose plus displayed SQL (including collapsed setup) was checked at
under 1,800 words per article, a conservative upper limit of nine minutes at
200 words/minute. Time spent experimenting is additional. The site's existing
byline estimator counts the raw MDX body and can show a shorter prose estimate.


## Classifying a growing catalog

Use one required primary `category` for the task the reader completes. The six
controlled categories live in `src/data/tutorial-taxonomy.ts`: SQL fundamentals,
clean & match data, files & formats, connect data sources, analyze data, and
performance & operations. Choose the task, not the product: PostgreSQL pushdown
belongs to performance; PostgreSQL is a technology facet.

`technologies` accepts multiple controlled tool/format IDs. `level` is Beginner,
Intermediate, or Advanced; `runtime` is browser, browser-and-native, or native.
Existing `tags` remain search keywords, not additional categories. Keep
`estimatedMinutes`, `outcome`, and `prerequisites` accurate. `order` is optional
editorial priority for a few recommended entries; new lessons do not need a
global rank. Tutorials keep their stable `/tutorials/<slug>/` URLs when reclassified.

The catalog has one search field and two visible checkbox facets: task category
and tools/formats. Choices within a facet use OR; the two facets combine with
AND. Counts respect the search and the other facet. Zero-count choices are
disabled unless selected, so selected filters can always be removed. Ubiquitous
tools are omitted because they do not narrow the catalog. Difficulty and runtime
remain card metadata, not filters; ordering uses editorial priority then title.
The catalog shows 12 results per page. Filter state is shareable in the URL and supports
back/forward navigation. All article links are present in the server-rendered
HTML, and without JavaScript every tutorial remains visible. Empty categories
are not offered in normal filter menus. Future category landing pages should
add a useful introduction and learning sequence once sufficient published
content exists; do not generate empty topic pages or index filter combinations.

Old level/runtime/sort URL parameters are discarded to avoid invisible filters.
Catalog analytics send controlled filter IDs, result counts, and whether a
query exists. Raw search text is never included in custom event parameters.
The 125-entry scalability fixture is test-only and never enters content/builds.

The catalog uses original SVG illustrations instead of small diagram screenshots.
Its compact hero invites the reader to reveal four changed records in the
Parquet example. The button controls every change; there is no automatic loop.
The final illustration is visible without JavaScript. Reduced motion disables
transitions, while preserving the reveal control. Hero controls emit
`tutorial_hero_interaction` (fixed action/visual), the catalog jump emits
`tutorial_catalog_explore`, and the featured lesson uses `tutorial_select` with
`source: hero`. None of these emit query-run or completion events.


## Checked challenges

Each tutorial has one challenge with a starter query, expected result, hint, and
solution. The first check lazily loads the real browser DuckDB engine. A private
session restores the canonical sample data before each attempt. Grading compares
column names and bags of result rows, preserving duplicates and NULLs while
allowing different valid SQL and row ordering. Queries are single SELECTs or
CTEs, wrapped to cap the returned rows. The reader sees their actual result.
Editing or resetting clears stale feedback. Opening the solution marks later
attempts as assisted; only the first passing attempt emits completion.
No SQL, result values, or raw errors are included in analytics.


## Ten additional tutorials

The `next-ten` fixture batch adds nested JSON, join multiplication, latest rows,
CSV cleaning, JSON Schema validation, mergeable distinct counts, ASOF joins,
Parquet metadata, EXPLAIN, and EXPLAIN ANALYZE. Review only this batch at
`/review/next-tutorials/`, or all twenty-three at `/tutorials/`.

`src/data/tutorial-fixtures.ts` discovers fixtures automatically for the shell
and challenge registry. New challenges live beside their setup and examples in
the fixture JSON. Classification continues to use one task category plus tool
facets; JSON Schema and DataSketches are now available tool choices.

Run these checks in addition to the original three-tutorial checks:

```sh
uv run --with duckdb==2.0.0 python scripts/articles/capture-next.py --check
node scripts/articles/check-next-browser.mjs
```

Omit `--check` only when deliberately refreshing captured results, input
downloads, walkthroughs, and native plan evidence after an authored SQL change.
The check mode verifies inputs/downloads, every result, challenge solutions,
nonpassing starters, and captured plan facts. Timing values are retained as
evidence of one recorded run, not asserted as repeatable performance claims.
The capture handles DuckDB 2.0's JSON profile format, including `operator`,
`intermediate_rows`, and `query.total_time`.

The browser check executes all 30 new examples and ten challenges in real WASM,
compares query results, exercises every visual choice from the keyboard, checks
320/390/1440-pixel layouts, verifies downloads and local links, and records
analytics without sending production traffic. `--layout-only` skips execution;
pass slugs to focus a rerun after a specific fix. Keep source files/builds quiet
during browser checks. Restart this worktree's dev daemon after source changes
if Vite has retained an old module.

The Parquet lesson writes and reads two actual 8,192-row files with four row
groups. Its diagram shows metadata-based candidate groups; it does not claim to
measure I/O. The two plan lessons distinguish estimated output from measured
operator output. The profiling lesson's EXISTS rewrite repairs a wrong answer,
so it is explicitly not presented as an equivalent-query speed benchmark.

After a normal production build, `node scripts/articles/check-draft-build.mjs`
checks that all twenty-three draft routes, all three review routes, and draft sitemap
links are excluded, and that the empty production catalog is noindex.


## Practical analytics and reshaping batch

The `practical-ten` batch adds sessions, ordered conversion funnels, seven-day
averages, evolving file schemas, PIVOT/UNPIVOT, retention cohorts, overall p95,
JSONata transformations, repeatable experiment groups, and anti joins with NULL.
Review just these ten at `/review/practical-tutorials/`.

Sessions, funnels, and retention use the same fictional five-person/19-event
website fixture. Each lesson still has a complete independent setup. The file
schema lesson creates and reads actual CSV and Parquet files and provides both
formats for download. JSONata, Hashfuncs, and DataSketches lessons link to their
extension references and are registered for related-article discovery once
published. JSONata and Hashfuncs also join the existing tools facet.

```sh
uv run --with duckdb==2.0.0 python scripts/articles/capture-next.py --batch=practical-ten --check
node scripts/articles/check-next-browser.mjs --batch=practical-ten
```

The same scripts support `next-ten` by default. The browser suite checks every
example result against its captured rows, rejects the starter challenge, accepts
the solution, checks keyboard-operated visuals and 320/390/1440-pixel layouts,
and verifies privacy-safe analytics without production network calls. The ten
new diagrams live in `PracticalTutorialArt.astro`; their explanatory states live
in `practical-tutorial-experiments.ts`. They use brief entrance animations and reader-controlled case changes, with
no automatic loops, and honor reduced-motion preferences.

The reading check includes rendered SQL, results, and expandable setup text.
All ten practical lessons are below 1,800 words; exercise time is reader-paced.
No performance claims are inferred from the 100-row quantile fixture. KLL output
is approximate at scale even though this small example agrees with exact SQL.
