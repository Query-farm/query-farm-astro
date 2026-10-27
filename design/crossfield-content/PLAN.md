# Crossfield website: content and product strategy

Prepared October 24, 2026. Review branch: `feat/crossfield-content-strategy`.
Status: Passes A and B implemented for local branch review on October 24, 2026.
Pass C remains contingent on qualified release artifacts. Nothing published.

Local review: run `node design/crossfield-content/render.mjs` from the site root,
then open `.cache/crossfield-content-review/index.html`. This renders both documents
without creating a public site route. The existing site preview remains at
<http://localhost:4455/products/crossfield>.

This is the plan for expanding the existing Crossfield site, not a second product
requirements list. [Proposed copy](COPY.md) contains the pitch, homepage narrative,
Ossie example and engine explanation. The [earlier design record](../crossfield.md)
retains the existing website's SQL and browser verification evidence.

## Trading narrative — October 25, 2026

Implemented on the review branch, with no publication or push:

- The homepage follows one cash-equity exposure story, from gross/net definitions
  to querying and EXPLAIN. Composition and revisions are brief continuations with
  links to the detailed walkthrough. Execution price is documented only in the guide. Generic product positioning,
  art, engine/agent/Ossie explanations, and the semantic-layer definition box remain.
- The homepage diagrams explain exposure and the generated query; supporting
  execution-price diagrams and the complete calculations remain in the guide.
  Section ornaments now use the existing seeded contour generator with a distinct
  section key, varying curves, line counts, and accent placement at full content width. The mobile layout preserves readable figures
  and bounded table scrolling. The interactive demo uses precomputed results.
- Overview and How it works now show ATTACH and the optional connection-scoped
  USE/strict-mode controls directly. Copy distinguishes per-query semantic
  validation from a host-sealed restriction to one attachment. All displayed
  statements match the earlier executed finance/retail native fixtures; SQL and
  model bytes are unchanged, so this edit reuses their recorded engine evidence.
- `/docs/trading` introduces the source rows before models and SQL. The new
  `finance.zip` includes independently authored data, model documents, two versioned
  packages, SQL, expected answers, native regression, and an actual EXPLAIN capture.
  Earlier retail and other examples remain available and retain recorded evidence.
- Fresh Linux ARM64 EC2 evidence through `./dev shell`: **46 native assertions in
  each optimizer mode (92 total)**, two complete CLI sessions, and captured native
  EXPLAIN output. Eight numerical queries plus two rejection statements per mode
  verify populations, gross/net totals, weighted price, empty-result NULLs, limits
  composition, and revision impact. No local engine execution or engine edits.
- The trading example qualifies shared engine `6d01968ba1ee4973483e3e67c9a1f58864a1ea9f`.
  Build differences from the earlier bundles are explicit in compatibility docs;
  no claim of public Haybarn release availability or other-bundle requalification.
- Website checks: `npm run check` (0 errors/warnings; 33 existing hints), build
  (7,475 pages and search), and **12/12 WebKit checks** over 16 routes at desktop,
  390px, and 320px widths. Keyboard, copy, no-JavaScript, downloads, fragment links,
  metadata, and overflow checks pass. Exposure/execution/mobile screenshots inspected.
  Detailed evidence: `.cache/crossfield-content-review/finance-*.log` and the
  bundle's `verification.txt`.
- Scope stays explicit: supplied USD position values at one fixed close; no pricing,
  currency conversion, derivatives netting, complete risk calculation, market-wide
  VWAP, or execution of trading limits. Revisions change population, not gross into net.

## Implementation and review evidence — October 24, 2026

- Expanded the homepage and added How it works, For agents, Apache Ossie and
  Inside the engine. Added validation/versioning, measurement, retrieval and
  runnable-example guides; retained the shop, composition and revision examples.
- Integrated corporate homepage, VGI cross-link, shared product copy, navigation
  and agent indexes. The existing footer and search index include Crossfield.
- Four complete deterministic offline bundles retain model bytes, independent
  expected values, source provenance and retail data notices. Public setup links
  use local downloads because the Crossfield repository is not publicly readable.
- Fresh native EC2 checks through `./dev shell`: eight extracted CLI sessions;
  eight standard SQLLogicTest cases, **152 assertions** across both optimizer modes;
  all four EXPLAIN files; pipeline signatures; metadata and captured raw-source
  rejection. Each process had an explicit timeout. No local engine execution.
- `npm run check`: zero errors/warnings, 33 existing hints. `npm run build`:
  7,474 pages plus the search index. WebKit: **6/6** tests across desktop/mobile,
  covering 15 routes, internal references, downloads, metadata, overflow, keyboard,
  copied SQL and no-JavaScript reading. Desktop/mobile screenshots inspected.
- Fixed a broken Ossie section fragment. Disabled Astro's development toolbar for
  clean previews; its background image audits emitted errors during navigation.
- Scope/evidence boundaries remain explicit: current Open-Meteo worker pairing is
  blocked by VGI protocol versions; GitHub pilot and detailed Jaffle explanation
  use recorded integration evidence. No public binary/validator release claimed.

Review at <http://localhost:4455/products/crossfield> on
`feat/crossfield-content-strategy`. Checks and screenshots are retained under
`.cache/crossfield-content-review/`; native website regressions are under
`tests/crossfield/native/`. A public-facing evidence record accompanies the
example downloads at `/crossfield/examples/verification.txt`.

The sections below retain the agreed strategy and original planning record.

## Visual revision — October 24, 2026

Following review, marketing pages now explain the model’s decisions visually.
The homepage uses original abstract field artwork; five new diagrams cover tax
meaning, repeated order values, independent aggregation, agent repair and logical
field mapping. The existing engine/composition/revision diagrams remain.

SQL is available through native expandable disclosures with a stated purpose.
The interactive shop example leads with its results. Authoring and reference
pages retain runnable code, and the full native EXPLAIN capture remains downloadable.
No SQL definitions, expected results or engine implementation changed in this pass.
The new $30/three-line illustration is explicitly separate from the retail fixture.
Artwork prompt/provenance: [ART.md](ART.md).

Visual verification: Astro check/build and desktop/mobile WebKit checks, including
no initially visible code on the four narrative pages, keyboard disclosure/copy
controls, no-JavaScript reading and responsive diagrams. Screenshots and logs use
`visual-*` under `.cache/crossfield-content-review/`.

## Business audience and expanded artwork — October 24, 2026

The overview and explanatory articles now describe reporting responsibilities and
consequences directly: shared definitions, independent aggregation, departmental
comparisons, and the effect of a proposed definition change. Business owners and
model authors establish the meaning; Crossfield validates its supported use. The
copy avoids anecdotal analyst characters and unsupported enterprise guarantees.

Three companion illustrations extend the original screenprint field style through
composition, revision, and AI reporting sections. The how-it-works and agents
articles reuse the relevant art. Generated images remain decorative; captions,
HTML diagrams, verified results, and expandable SQL carry the technical content.
Sources and generation prompts are recorded in [ART.md](ART.md). Existing SQL and
native numerical evidence are unchanged.

Fresh verification: Astro check reported zero errors and warnings (33 existing
hints); the complete site build passed. All six desktop/mobile WebKit checks
passed, including image and link responses, keyboard controls, responsive layouts,
and reading without JavaScript. The three illustrated sections were inspected at
desktop and mobile widths. Logs and screenshots use `business-*` under
`.cache/crossfield-content-review/`. No engine tests were rerun for this copy and
artwork update.

## 1. Positioning decision

Mobile follow-up — October 25, 2026: widened the chapter ornaments; added an
opt-in compact product menu for phones/tablets; increased touch targets; stacked
the grain comparison at narrow widths; improved small-screen typography; removed
unused demo height; and added table scrolling hints only where columns overflow.
The menu uses native details and remains usable without JavaScript. Other product
navigation retains its existing layout. Fresh Astro check: zero errors/warnings,
33 existing hints. Full build passed. WebKit: **12/12** across desktop, 390px and
320px, including menu navigation, dismissal, no-JavaScript reading and bounded
table scrolling. Additional tablet and landscape viewport checks passed. Evidence
is under `.cache/crossfield-content-review/mobile-*`; SQL/model content is unchanged.

**Crossfield is Query Farm's semantic layer inside DuckDB: business definitions
that people and agents can query, inspect and compose in SQL.**

Lead with the practical problem: valid SQL can return a number that means the
wrong thing. Revenue can include tax in one query, exclude it in another, or be
multiplied by joining orders to receipt lines. More SQL generation does not settle
those business decisions. Crossfield lets the model author settle them once and
make approved calculations available to query writers.

The distinctive combination to demonstrate is:

1. **Definitions execute inside DuckDB.** Models become attached catalogs;
   semantic compilation participates in the native query lifecycle.
2. **SQL remains useful.** Select metrics and dimensions, use supported CTEs and
   views, join approved model results, compare revisions and inspect expansion.
3. **Approval can be enforced.** Crossfield checks query intent and resolved
   implementations; strict sessions restrict supported queries to approved use.
4. **Definitions can describe API-backed work.** Model-owned inputs and retrieval
   dependencies let callers ask analytical questions without assembling API routes.

The headline promise is consistent, inspectable calculations. Do not lead with
patch counts, a huge feature grid, saved reports, or a claim that agents cannot err.
The model author still decides what a metric means and validates it against the
business. A wrong approved definition remains a wrong definition.

## 2. Audiences and their first useful outcome

| Reader | Question they arrive with | First proof | Next action |
| --- | --- | --- | --- |
| DuckDB user / analytics engineer | Can I reuse metrics without losing SQL? | One named metric, two groupings, inspectable expansion | Run the offline walkthrough |
| Agent/application builder | How does my agent discover and obey the model? | Discover → construct → explain → execute → repair, with a real rejection | Integrate discovery; read host-session boundaries |
| Business/data owner | Can reports share definitions, and can I review a change? | Tax-inclusive versus tax-exclusive revenue on identical source data | Discuss one reporting workload with Query Farm |
| Model author / platform engineer | What do I maintain and deploy? | Ossie model, Crossfield approvals, source bindings, validation and version identities | Author and validate a model |
| Ossie implementer / engine developer | What is portable, and what changed in DuckDB? | Compatibility profile, exact source links, eight-patch rationale | Inspect the contracts and regressions |

Primary acquisition audience: DuckDB users and builders of SQL-facing tools.
Business stakeholders need plain explanations and proof, not an invented dashboard
product. Keep purchase/evaluation contact visible without placing a sales form in
front of the example.

## 3. Research and market position

Official sources reviewed October 24, 2026; these are positioning observations,
not a feature audit or comparative performance study.

| Source | What its current presentation emphasizes | Implication for Crossfield |
| --- | --- | --- |
| [Cube](https://cube.dev/) | Agentic analytics, shared semantic context, BI and embedded use | Explain the agent's actual discovery and execution workflow; “for AI” alone does not distinguish us |
| [dbt Semantic Layer](https://www.getdbt.com/product/semantic-layer) | Reusable metrics, governed analysis and downstream consumption | “Define once” is useful category education, then demonstrate our DuckDB placement and SQL composition |
| [Snowflake semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview) | Semantic concepts stored and queried in the database | Database-native semantics are not unique; describe our DuckDB implementation precisely |
| [Apache Ossie (incubating)](https://ossie.apache.org/) | Exchange of semantic metadata across tools | Explain model interchange separately from Crossfield's query language and execution approvals |

Do not publish a competitor checkmark chart without a separate, maintained
comparison. No “first,” “only,” “supersedes MetricFlow,” cost/performance advantage,
customer endorsement, or universal portability claims are supported by this work.

Recommended category: **semantic layer inside DuckDB**. Use “governed SQL” only
after explaining what is governed. “Agent context” is an outcome, not the product
category. Keep Crossfield as the product name with **by Query.Farm** attribution.

## 4. Homepage narrative and demonstrations

| Order | Reader question | Content and proof | Destination |
| --- | --- | --- | --- |
| 1 | Why should I care? | Approved business metrics, directly in DuckDB; one-sentence definition; short SQL with prerequisites beside it | SQL walkthrough |
| 2 | What goes wrong today? | Introduce fictional retail data: orders, receipt lines, stores. Explain tax and row grain before showing a model | Model authoring |
| 3 | What changes with Crossfield? | Existing store/totals switcher: one model, different questions, checked results. Include the bad raw join's inflated total | SQL walkthrough |
| 4 | Can I inspect it? | Existing real `EXPLAIN (SEMANTIC)` capture: separate order and line aggregates; full SQL/JSON download | How it works |
| 5 | Can definitions change and coexist? | Two attached revenue revisions over the same rows; separate shared-dimension sales/budget example | Query and compose |
| 6 | What does an agent get? | Names, signatures, units, compatible dimensions, structured diagnostics; short failure-and-repair session | Agent guide |
| 7 | Where does Ossie fit? | Model format versus execution; tiny portable recipe plus a separately labelled Crossfield approval | Ossie compatibility |
| 8 | Why Query Farm? | Optional VGI data access + Crossfield meaning + native DuckDB execution, with product links | API examples and VGI |
| 9 | Why a custom DuckDB build? | Lifecycle explanation and direct link to the engine article | Engine integration |
| 10 | How do I evaluate it? | Current availability, matched artifacts, offline demo, workload conversation | Walkthrough / contact |

Keep the first visible screen legible without knowing “grain,” Ossie, VGI or
Jaffle. Introduce **Jaffle Shop as a fictional retailer**, not as a recognized brand.
“A valid join can inflate revenue” is a stronger proof than “How is each store doing?”
Use business questions as headings and put syntax beneath the question.

Reuse existing SQL/results and diagrams where they teach the right point. The
existing store demo, source diagram, composition diagram, revision comparison and
captured explanation are assets, not disposable prototypes.

## 5. Site map and content ownership

All paths below are under `/products/crossfield` unless stated otherwise.
**Existing** means present in the local website draft, not necessarily published.

| Route | Status | Purpose and required contents |
| --- | --- | --- |
| `/` | Existing; revise | Product narrative above, proof-led navigation and availability |
| `/how-it-works` | New | Source → model → attachment → semantic query → validation → native execution; grain, live data and inspection |
| `/agents` | New | Complete discovery/repair session, callable scope selection, host controls and tool integration boundary |
| `/ossie` | New | Linked standard, pinned supported profile, root/scoped metrics, portable example versus extensions, compatibility limits |
| `/engine` | New | Why a grammar extension alone is insufficient, actual hooks, eight patches, reusable mechanisms, distribution tradeoffs |
| `/docs` | Existing; revise | Role-based starting points and concise glossary: dataset, field, dimension, metric, grain, population, approval |
| `/docs/quickstart` | Existing; retain evidence | Matching artifacts, source data introduction, attach/query/explain, exact results and deliberate rejection |
| `/docs/models` | Existing; revise | Portable recipes, separate approvals, bindings, simple names, nested data and typed call entry points |
| `/docs/querying` | Existing; expand | Modes, aliases/CTEs/views/prepared statements, detail versus aggregates, direct joins versus reconciliation, revisions |
| `/docs/discovery` | Existing; expand | Stable metadata interfaces, signatures, errors, semantic explanation; agent page links here for the reference |
| `/docs/validation` | New | Schema vs authoring vs binding vs numerical checks; native CLI, CI adapter, baseline review and version identities |
| `/docs/time-and-measurements` | New | Calendar grouping, history, snapshots, measurement support and DST; distinguish these operations with examples |
| `/docs/providers` | New | Typed inputs, model-owned dependency pipelines, source pruning, provider setup, empty/error behavior |
| `/docs/examples` | New | Offline retail first; scoped GitHub and weather examples with prerequisites and coverage labels |
| `/docs/compatibility` | Existing; revise | Supported artifact combinations and modes, capability profile, limits and release status; link engine rationale |
| `/llms.txt` | Existing; expand | Version-aware documentation index; link setup, modes, discovery, examples and unsupported cases |

Primary navigation: Overview, How it works, For agents, Documentation, with Ossie
and Engine linked from the relevant sections and docs. Avoid a dozen top-level tabs.
Retain existing routes and anchors or redirect renamed ones. Documentation owns
commands and restrictions; product pages explain why a capability matters and link
to the canonical reference rather than copying every contract.

No standalone pricing, downloads or customer-case-study pages until there is real
content for them. Prepare release/compatibility navigation to accept a versioned
download entry when artifacts are published; do not invent that availability now.

## 6. Query Farm integration

The corporate story should distinguish **access**, **meaning**, **execution** and
**access control**, rather than imply that every product is a required dependency.

| Product | Place in the story | Website action and boundary |
| --- | --- | --- |
| Crossfield | Approved business definitions, semantic query compilation and validation | Own product identity and docs; works with local tables without VGI |
| [VGI](/vgi) | Expose APIs, services and provider functions to SQL | Explain how model-owned inputs/dependencies hide API mechanics; qualify the specific worker/native build |
| [Orchard](/products/orchard) | Discover connectors | Link connector discovery; a connector listing is not Crossfield semantic-model qualification |
| [Haybarn](/products/haybarn) | Query Farm's independent DuckDB distribution offering | Link the distribution context, but do not claim today's Haybarn or WASM artifacts include Crossfield; publish the exact supported package when established |
| [Rowfence](/products/rowfence) | Controls access to VGI rows, columns and functions | Explain the distinct purpose; end-to-end Crossfield/Rowfence integration needs its own qualification |
| [Cupola](/products/cupola) / [Grainlift](/products/grainlift) | Adjacent interfaces and service tooling | Not required to run Crossfield; no new UI/server integration promise |

Add Crossfield to the corporate homepage's “business definitions” story and retain
its shared product-catalog entry. Add a reciprocal VGI paragraph linking from API
access to approved analytical definitions. Keep the product tile, footer, global
search and global `llms.txt` consistent. The Crossfield guide must be discoverable
from the corporate site without first knowing its name.

Recommended evaluation offer: **bring one report, its metric definitions and
representative data**. Show the supported result, invalid alternatives, explanation
and definition revision. Link to existing `/company/contact` or `/consulting`.
Do not imply a new managed service, SLA, licensing tier or support contract.

## 7. Explain the engine decision confidently

Crossfield's semantic implementation is an extension. The complete product also
requires a matched, patched DuckDB engine. A grammar extension can recognize and
transform SQL, but governed execution needs the original intent, selected native
definitions and prepared-statement lifecycle as well.

Explain the user outcome before each mechanism. Avoid implying stock DuckDB is
broken or unsuitable for its own design goals. These are specialized requirements;
our distribution strategy does not depend on upstream acceptance. Possible uses
by other extensions are design opportunities, not existing adopters or commitments.

| Patch in Crossfield's maintained series | User consequence | Potential wider use |
| --- | --- | --- |
| 0001 — statement lifecycle | Check requests at entry/planning/execution; retain original intent and revalidate prepared work | Other extensions whose decisions depend on connection state or changing policy |
| 0002 — parser refresh between statements | A grammar-setting change applies to the next statement in a batch | Stateful SQL dialect extensions |
| 0003 — scalar binding authorization | Inspect the selected overload before binding callbacks can run; retain provenance | Definition-based function approval by other governed extensions |
| 0004 — parser options | Compose extension syntax with a connection's active grammar | Catalog- or connection-aware syntax integration |
| 0005 — correlated table-function named options | Model-owned retrieval can pass row inputs and constant named options through native binding | Other correlated table functions using native options/defaults |
| 0006 — cast provenance | Identify an effective registered cast's owning extension without executing it | Auditing and explicit approval of extension-provided conversions |
| 0007 — parser error guidance | Retain the native error/location while adding structured repair information | Domain-specific diagnostic tooling |
| 0008 — SQL formatter parameters | Formatting preserves `$name` and `$1` | SQL export and documentation tooling; a presentation fix, not a lifecycle hook |

Show a diagram with two ownership lanes: **Crossfield** owns models, approval,
compilation and semantic diagnostics; **DuckDB** owns binding, optimization,
operators, transactions and storage. Put generic hooks on the boundary. Also show
runtime data checks; compile success is not the end of validation.

The engineering page must plainly explain matched engine/extension/native-module
builds, maintenance across upstream updates, capability checks and supported
platforms. The current reviewed Crossfield build contract pins `d54cbbe3df` plus
eight patches; do not infer the supported base from a neighboring experimental
DuckDB checkout. Direct readers to a versioned build manifest, not just “DuckDB 2.0.”

## 8. Evidence-led example plan

| Example | Lesson | Evidence available now | Work before new publication |
| --- | --- | --- | --- |
| Retail store/totals | Definitions and independent fact grains | Existing checked website SQL and capture; Brooklyn 19 orders / 36 lines / 255.00 revenue | Preserve literal SQL; recheck changed snippets only |
| Raw retail join | Syntactically valid SQL can overstate revenue | Existing captured Brooklyn 1155.00 versus 255.00 | Mark wrong calculation explicitly; never present as a repaired query |
| Revenue revisions | Changed definition versus changed underlying data | Existing 6730.75 including tax versus 6355.00 excluding tax; difference −375.75 | State same fixture rows; semantic-mode outer reconciliation |
| Sales versus budget | Separate models compose at approved shared dimensions | Existing native fixture and website setup | State join permission, complete keys, modes and missing-side NULLs |
| Dataset-scoped Ossie metrics | Standard local field resolution | New native scoped fixture; sales 84, refunds 7 | Import exact fixture/setup and capture website transcript on EC2 |
| Agent repair | Discovery narrows choices and errors explain rejection | Existing native discovery/repair fixtures and website blocks | Capture one coherent session, including an unrepaired question when no approved answer exists |
| GitHub typed scopes | A repository or organization selects a model-owned retrieval path; metrics remain selectable | Actual-worker/native-VGI deterministic tests; typed pilot and broader legacy generated profile are distinct | Choose one qualified model, publish prerequisites and a fresh capture; do not claim the production generator migrated |
| Weather at midnight | Report what an interval represents, not its timestamp label | Native measurement tests and actual Open-Meteo/native-VGI deterministic integration | Extract the exact fixture; include source metadata/approval distinction and a rejection |
| Model PR validation | Catch malformed definitions and review revisions | Native CLI and Action tests; local validator bundle support | Show current bundle-based workflow; published release example remains conditional |

SQL shown as executable must include setup, attachment alias, model, mode,
parameters, expected columns/rows, and evidence identity. Illustrative model
fragments must say “excerpt.” A passing authoring validator is not a numerical test.
No simulated terminal response may masquerade as an execution capture.

## 9. Ossie presentation and claim boundaries

Link the [Apache Ossie project](https://ossie.apache.org/), its
[pinned core specification](https://github.com/apache/ossie/blob/01a5488d840deda309aac68cc0b312c195369b8d/core-spec/spec.md),
[expression language](https://github.com/apache/ossie/blob/01a5488d840deda309aac68cc0b312c195369b8d/core-spec/expression_language.md)
and the Crossfield compatibility contract. Use “Apache Ossie (incubating)” at first
mention. Crossfield is an independent Query Farm implementation, not an Apache
product or certified implementation. No endorsement or whole-format portability.

Teach three layers with one example: portable dataset/field/metric definitions;
Crossfield approval/binding/temporal extensions; DuckDB execution. `FROM SEMANTIC`
is Crossfield's SQL interface, not an Ossie-standard query syntax. The Ossie site
currently illustrates an older document wrapper; copy examples from the pinned
specification and native fixtures instead.

Immediate correction: `docs/models.mdx` presents root metric composition without
labelling it a Crossfield extension. Label it and add a simpler portable recipe.
The current site's **one-attachment strict business-query restriction is accurate**;
retain it. Multi-model semantic queries do not imply strict authorization of their
entire reconciliation. MetricFlow checks and our native suite are not Ossie
certification. The Decimal AVG portability difference and unimplemented relational
AGG draft belong in the supported-profile details.

## 10. Visual and interaction briefs

Follow `DESIGN_BRIEF.md`: Query Farm typography/colors, restrained product mark,
quiet docs, one hairband and at most one dark slab. No copied competitor diagrams
or invented endorsement logos. Prefer accessible HTML/SVG diagrams, not bitmap text.

1. **The row-grain problem:** one order connects to several lines; label where
   summing repeats its amount. Pair with the existing numerical proof.
2. **Inside the engine:** model and SQL inputs, extension/core ownership lanes,
   lifecycle checks, runtime checks, ordinary DuckDB execution.
3. **Two definitions, same rows:** two attached revision catalogs and result delta;
   explicit note that definition versioning is not data time travel.
4. **Discover and repair:** structured metadata → query → useful diagnostic →
   approved query; branch to “cannot answer under this model” when appropriate.
5. **Query Farm roles:** sources/local tables and optional VGI feed the engine;
   Ossie/approvals feed Crossfield. Do not draw every product as a mandatory stack.
6. **Measurement timeline:** precipitation interval crosses midnight and ends on
   the day boundary; temperature is a separate instantaneous point in the same row.

Use interactive controls only where they teach a real distinction: store versus
total, old versus current definition, label day versus represented day. Label
fixture results as precomputed. A browser “Run” button requires an actually
qualified Crossfield browser runtime, which this proposal does not establish.

## 11. Implementation order and acceptance

**Pass A — compelling, accurate entry.** Revise homepage and shared product copy;
add the four explanatory pages; fix extension labels; retain working walkthrough,
navigation, captured explanation and mode boundaries. Review copy and diagrams on
this branch with the existing local Astro server before any publication.

**Pass B — usable documentation.** Add validation, provider, time/measurement and
example guides. Publish complete file sets/transcripts rather than API snippets
that force users to reconstruct setup. Expand metadata/error reference and agent
index. Keep the offline path independent of network credentials.

**Pass C — release connection.** Once exact supported artifacts exist, connect
downloads, checksums/build manifests, platform matrix and versioned documentation.
Publish an engineering article and an agent-workflow article linking back to the
product. This is website work, not permission to release or deploy software.

Acceptance for each pass:

- A DuckDB reader can explain what a semantic model contributes after the first
  example, and can locate setup without leaving the story to hunt for filenames.
- New runnable examples are executed through Crossfield's `./dev` EC2 workflow
  with native SQLLogicTests and independent values/rejections; no engine test locally.
- Preserve recorded evidence for unchanged examples; never relabel it a fresh run.
- Website checks use `npm run check`, `npm run build`, route/link/fragment checks,
  relevant browser controls, desktop/mobile layouts, keyboard and no-JS reading.
- Existing source markdown/MDX and source repository contracts own behavior;
  displays/downloads use shared snippets/captures to prevent drift.
- Include cross-links, readable code, metadata/OG descriptions, search index,
  canonical URLs and the agent index. No synthetic reviews or benchmark claims.
- Confirm only intended files are committed. The starting website tree contains
  unrelated edits and untracked material; this branch preserves them. No push,
  merge, publication or deployment is authorized by this planning task.

Measure whether visitors reach and use the walkthrough, inspect the model/SQL,
visit agent or engine details, and contact Query Farm with a concrete workload.
Use existing analytics if available; no new tracking system is part of this plan.
Do not turn desired adoption outcomes into claimed customer results.

## 12. Source and review record

Reviewed source: Crossfield `1dbccf8b27120f01fdf886596b4f4139688d9d5e`, including
README, TASKS, PLAN, capability summary, model/SQL/measurement contracts, native
fixture examples, validator Action and `patches/duckdb/README.md`. This review
reuses recorded execution evidence; no new SQL or engine qualification was run.

Useful maintained references:

- [Capabilities and evidence](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/docs/BUSINESS_ADOPTION_PROGRESS.md)
- [Supported SQL and modes](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/docs/SUPPORTED_SQL.md)
- [Model compatibility](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/docs/MODEL_FORMAT.md)
- [Engine patch contract](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/patches/duckdb/README.md)
- [Runnable examples](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/docs/SQL_EXAMPLES.md)
- [Model-validation Action](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/actions/validate-model/README.md)

Website source inspected: existing product pages/components, product catalog,
design brief, site build workflow and prior review evidence. This is an editorial
and technical source review, not a new external marketing/customer endorsement.

This planning pass changes only design documents and their local review renderer.
The renderer passed WebKit checks at 1440×1000 and 390×844: both documents present,
all in-document navigation targets resolve, no page errors or viewport overflow.
`git diff --check` passes. No production Astro page changed, so a fresh whole-site
build and Crossfield SQL execution were not required or claimed.
