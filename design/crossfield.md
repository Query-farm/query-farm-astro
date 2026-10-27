# Crossfield product and documentation proposal

The October 24 expansion proposal is maintained in
[the content strategy](crossfield-content/PLAN.md) and
[the proposed product copy](crossfield-content/COPY.md), on
`feat/crossfield-content-strategy`. This document preserves the earlier design
decisions and recorded website/SQL validation below.

Review branch: `feat/crossfield-product-docs`. Local preview only; no publication,
merge, deployment, or release is part of this work.

## Editorial plan

Position Crossfield as **a semantic layer inside DuckDB**. Lead with “A semantic
layer. Inside DuckDB.” Explain the category before the syntax: a semantic model
connects business terms to executable calculations, source relationships and
grouping rules. The native placement lets named model catalogs, approved joins,
CTEs, explanation and revision comparisons share a DuckDB connection.

Introduce Jaffle Shop as a fictional business before showing any example SQL.
Show the shop's store/order/line relationships in the homepage diagram; the
walkthrough introduces all five tables. Then name the calculations and show orders, order lines
and revenue grouped by store without multiplying order totals by line count.
Lead with explicit `FROM SEMANTIC catalog.model` and document the equivalent
ordinary catalog spelling. Put the fixture prerequisites beside the homepage SQL.
Introduce optional strict
enforcement after readers understand what a semantic model provides.

| Route | Job |
| --- | --- |
| `/products/crossfield` | Semantic-layer education, native-engine diagram, introduced shop example, approved composition, revision comparison, discovery and optional enforcement |
| `/products/crossfield/docs` | Documentation map and concepts for first-time semantic model users |
| `/products/crossfield/docs/quickstart` | Prerequisites, offline Jaffle setup, attachment, discovery, aggregate/detail results and explanation |
| `/products/crossfield/docs/models` | Actual Ossie/Crossfield authoring excerpts, source grain, relationships, approval policy, public names and versions |
| `/products/crossfield/docs/querying` | Aggregate/detail/catalog syntax, CTEs, scoped revisions, callable inputs, named reports and modes |
| `/products/crossfield/docs/discovery` | Structured discovery, generated SQL, deliberate errors and meaning-preserving repair |
| `/products/crossfield/docs/compatibility` | Development availability, exact engine requirements, supported scope and known limitations |
| `/products/crossfield/llms.txt` | Human-readable documentation index for agents, with development and execution constraints |

Add Crossfield to the shared product catalog (which feeds both Products and the
header). Add the documentation index to the existing site-wide `llms.txt`.
Preserve existing product pages, generated references, and site layout.

## Specialist reviews

These are role-based subagent reviews of the source and proposed content, not
customer interviews or external endorsements. Marketing and SQL reviews preceded
the branding review.

**Marketing:** lead with the semantic-layer category and native DuckDB placement,
then demonstrate approved definitions through verifiable business examples;
keep VGI optional; make the primary CTA “Explore the SQL walkthrough.” Contact
Query.Farm is the evaluation path. Do not invent an early-access program, public
installer, customer adoption, or production-readiness claim.

**SQL:** lead with explicit `FROM SEMANTIC` and document the equivalent catalog
spelling. Explain that attached entries
still validate definitions in `off` mode; strict mode controls ordinary statements
on the connection and is reversible until a native host seals it. Show source
grain and allowed composition rather than promising arbitrary safe joins.
Correct an inherited teaching mismatch: `SUM(total)` includes tax, so selecting
v2 `revenue` would change the question. Use `SUM(subtotal)` → `revenue` for the
rejection/repair example. Treat `EXPLAIN (SEMANTIC)` separately from
`EXPLAIN (SQL)` and `EXPLAIN ANALYZE`.

**Branding:** keep Crossfield as its own product name, with Query.Farm attribution.
Use the existing Strata Sun palette and typefaces, one hairband, at most one dark
section, and quiet documentation pages. A small SVG of field rows crossed by a
vertical channel connects the name with tabular data. Avoid shields, checkmarks
and a competing sun mark. The SQL/results switcher must say “Precomputed results,”
update both together and offer no misleading Run control.

## Competitor positioning research

Official sources reviewed October 20, 2026, as inspiration rather than a feature
parity or superiority claim:

- [dbt Semantic Layer](https://www.getdbt.com/product/semantic-layer) connects
  reusable metric definitions to downstream analysis. Borrow the educational
  sequence from business meaning to use, with original copy and examples.
- [Cube's AI context layer](https://cube.dev/product/ai-context-layer) makes the
  connection between defined metrics and agent queries explicit. For Crossfield,
  show actual SQL discovery and validation without claiming infallible agents
  or Cube's integrations.
- [Snowflake semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
  explains semantic objects inside the database. Show Crossfield's actual
  boundary: extension compilation and native DuckDB execution. Database-native
  semantics are not claimed as unique to Crossfield.

Four original responsive diagrams explain engine placement, source-to-definition
mapping, independently aggregated model joins, and two revisions over shared
source rows. Composition and revision sections state their mode and equivalence
limits. All competitor wording and graphics remain their own; no assets or
example code were copied.

## Evidence and content boundaries

Source checkout: `../duckdb-metrics/crossfield`, reviewed at `16e367d` (includes
the readable-SQL change `ea69980`). Reference contracts:

- `README.md`, `docs/BUSINESS_ADOPTION_PROGRESS.md`, `docs/NATIVE_BUILD.md`.
- `docs/SUPPORTED_SQL.md`, `docs/CATALOG_INTEGRATION.md`, `docs/HOST_SESSIONS.md`.
- `examples/jaffle-shop/{README.md,setup.sql,attach.sql,walkthrough.sql}` and models.
- `test/sql/examples/jaffle_shop.test` and callable input fixtures.

Jaffle's independently specified expectations are Brooklyn: 19 orders, 36 lines,
USD 255 excluding tax; Philadelphia: 506 orders, 798 lines, USD 6100 excluding tax.
Totals are 525 orders, 834 lines, USD 6355. The older including-tax definition is
USD 6730.75. This is a frozen synthetic customer panel, not customer evidence or
a performance benchmark.

The current software is `0.1.0-dev` and requires its matching patched DuckDB 2.0
build. No stock `INSTALL crossfield` recipe, public release, browser execution,
universal VGI compatibility, authentication, row security, or guaranteed correct
business answers is claimed. Model examples are excerpts where indicated.

The project owner identified `d54cbbe3df17e8e5ce68312f483b4155836112aa` as
the DuckDB 2.0 release base. It is now qualified with the unchanged eight-patch
series. The October 21 refresh below records its own executions and captures;
earlier checkpoints retain their original `94abd4ed366` evidence.

## Review and verification

Use the project's existing local dependencies and its running Astro development
server on port 4455. Preserve other servers. Run the site build and applicable Astro diagnostics.
Check the new routes, internal navigation, copy controls, example switching,
keyboard access and mobile layout. The default demo must remain readable without
JavaScript. Keep unrelated untracked files intact.

The first website review reused source-backed SQL expectations without executing
the published SQL. The follow-up below closes that validation gap. Crossfield
execution took place on EC2; no engine or provider was run locally.

### Completed checks

- `npm run check`: 342 files; zero errors, zero warnings, 33 hints.
- `npm run build`: all 7,465 site pages built successfully, including the search index.
- Chromium: all seven new pages returned HTTP 200; desktop/mobile layout,
  keyboard and pointer controls, paired SQL/results, clipboard copy, and the
  no-JavaScript fallback passed. No browser page errors.
- WebKit: example controls, mobile documentation navigation, and the updated
  quickstart attachment example passed.
- All 47 unique local links/assets referenced by the new pages resolved,
  including checked fragment targets.
- All seven Crossfield pages appear in the search index and the site search UI.
- The original documentation introduction passed 16 Chromium/WebKit
  desktop/mobile checks. The homepage now introduces the three relevant shop
  tables with a diagram; the guides retain the complete five-table introduction.
- `git diff --check` passed. Review screenshots and machine-readable results
  are under the ignored `.cache/crossfield-review/` directory.

Preview: <http://localhost:4455/products/crossfield>. Changes remain uncommitted
on the review branch; nothing has been pushed or published.

### Exact SQL verification, October 20, 2026

- Extracted the final website SQL directly from its Markdown blocks and Astro/TS
  constants: 20 successful blocks plus the two presentations of the intentional
  raw-source rejection. Prerequisites are the walkthrough's fresh CLI, physical
  setup, and attachment statements.
- Executed all successful blocks through the matching native DuckDB CLI on
  EC2, with `-bail`, a 120-second deadline and five-second termination grace.
  This includes discovery, detail, named reports, typed calls, revision CTEs,
  `EXPLAIN (SEMANTIC)` and `EXPLAIN (SQL)`.
- Ran the extracted statements through DuckDB's standard SQLLogicTest runner:
  **92 assertions pass with the optimizer enabled, and 92 with it disabled**.
  Fourteen query occurrences compare independent expected rows; other statements
  check successful execution. The deliberate raw aggregation checks
  `CROSSFIELD_RAW_SOURCE`. There were no skips.
- Confirmed the original ordinary-catalog homepage query and the explicit
  `FROM SEMANTIC jaffle_current.jaffle` form return identical expected values:
  Brooklyn 19/36/255.00, Philadelphia 506/798/6100.00; totals 525/834/6355.00.
  The published examples now lead with `FROM SEMANTIC`, with the required setup
  linked beside the homepage query.
- The initial ad hoc SQLLogicTest invocation selected no cases and was not
  counted as passing. The corrected standard `--stdin` invocation first caught
  an incorrect test expectation for a loose model's default revision; the
  implementation explicitly assigns revision 1. Corrected that expectation,
  preserved its failure log, and reran both optimizer modes.

Exact SQL, extraction inventory, native CLI/EXPLAIN transcripts and SQLLogicTest
evidence are retained in `.cache/crossfield-review/sql/` locally and
`extension/logs/site-examples/` in the configured EC2 workspace. The native
artifacts match Crossfield `16e367d` and the patched DuckDB `94abd4ed366` baseline.
No Crossfield engine change or live API call was needed for these examples.

### Native semantic-layer homepage revision

- Replaced the tutorial-led hero with native-engine positioning, a definition of
  the category, four original responsive diagrams, and central composition and
  versioning sections. Marketing and SQL reviews preceded final branding review.
- Added a runnable sales/planning setup download and documented its fresh-session,
  source-checkout, ICU and UTC prerequisites. The two sources and models are
  separate from Jaffle. Region totals are across the fixture history, not matched
  months.
- Executed the exact new setup, displayed join, and displayed revision comparison
  on EC2's matching native CLI. Standard SQLLogicTest passes **36 assertions per
  optimizer mode**, including independent expectations North 230/550, South
  80/100, West 25/NULL and revision difference −375.75. An initial generated SLT
  formatting error was preserved and corrected before both passing runs.
- Earlier website SQL is unchanged; its numerical and rejection evidence above
  is retained. No new engine build or live external provider run was needed.
- Rebuilt the site and refreshed Astro's stale development stylesheet.
  Chromium/WebKit checks cover actual computed layout, all four diagrams, loaded
  images, introduced data before SQL, anchors, keyboard/pointer controls, and
  the downloadable setup. Final branding review passes at 1440px and 390px.

Evidence: `.cache/crossfield-review/narrative/` locally and
`extension/logs/site-narrative/` on EC2. The preview remains at port 4455 on
`feat/crossfield-product-docs`, uncommitted and unpublished.

### Technical copy edit and inspectable expansion

The copy editor reviewed the whole homepage twice for spoken flow and an
experienced DuckDB audience. Replaced the shop-performance question and
introductory glossary with the actual modeling problem: order revenue and line
counts have different grains. The page now shows a deliberately incorrect raw
join, the governed query, and the separate aggregates in its captured expansion.
The versioning section completes the tax-definition example. The homepage
explains why preparation, binding and execution need generic core hooks;
the compatibility page maps all eight current patches to their purpose.

Executed the displayed raw join, semantic query and `EXPLAIN (SEMANTIC)` on EC2.
Independent CSV arithmetic gives joined revenue of 1155.00 for Brooklyn and
13896.00 for Philadelphia, versus order subtotals of 255.00 and 6100.00.
Standard SQLLogicTest passes **37 assertions in each optimizer mode**, including
execution of the exact captured SQL with the same independent result rows.
No engine changes, live APIs, or local engine tests were needed.

`public/crossfield/jaffle-explain-semantic.json` retains the complete explanation
row; `jaffle-expanded.sql` retains its SQL. The visible SELECT excerpts are
extracted from that capture with indentation reduced; expressions and generated
names are unchanged. The full SQL is expandable and both artifacts downloadable.
They describe a captured compilation, not stable generated identifiers or
historical data selection.

Evidence is in `.cache/crossfield-review/editorial/` and remote
`extension/logs/site-editorial/`. Browser checks cover Chromium and WebKit at
1440px and 390px, real computed layout, absence of horizontal page overflow,
grouping controls and keyboard expansion of the complete SQL.


### DuckDB release-base refresh — October 21 UTC

Rebuilt DuckDB `d54cbbe3df17e8e5ce68312f483b4155836112aa`, Crossfield and
matching VGI on EC2 Linux ARM64. All eight engine patches apply unchanged.
The full Crossfield suite passes 363/363 cases; focused upstream checks pass
164 cases / 619,702 assertions. Website SQLLogicTests pass 92 published-example,
36 composition and 37 editorial assertions in each optimizer mode. These are
new executions; the earlier checkpoints above remain historical evidence.

Replaced both public explanation downloads with a fresh `EXPLAIN (SEMANTIC)`
capture from this build and updated the current compatibility/LLM references.
Native evidence and the raw capture are in Crossfield's `logs/release-base/`;
remote website case logs are in `extension/logs/site-release-base/`.

The refreshed site build passes (7,465 pages). WebKit checks at 1440px and
390px confirm the complete explanation opens, both downloads match, the current
source pin is visible, and there are no page errors or horizontal page overflow.
Local evidence: `.cache/crossfield-review/release-base-build.log` and
`.cache/crossfield-review/release-base-browser.json`. Existing layout/interaction
checks above remain applicable; this refresh changes build references and captures.
