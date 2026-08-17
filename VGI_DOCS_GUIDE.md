# VGI SDK documentation (Starlight) — build guide

> **Scope.** This file began as the vgi-python guide and now covers the whole
> `/vgi/docs/` section: the shared, language-neutral Concepts pages plus one
> subsection per SDK — `python/`, `go/`, `typescript/`, `rust/` and `java/`.
> Python is the reference implementation and its conventions are the house
> style; §8 records what is different for Go, §9 for TypeScript, §10 for Rust
> and §11 for Java.

The official documentation for the **vgi-python** package lives inside this site as a
[Starlight](https://starlight.astro.build/) docs section mounted at **`/vgi/docs/python/`**.
It coexists with the rest of the query.farm Astro site (the 70+ marketing/extension pages are
untouched). This document explains how it's wired, how the pages are produced, and the hard-won
MDX/Starlight conventions you must follow when changing it.

> Source of truth: the prose is converted from `vgi-python/docs/` (MkDocs) and the API reference is
> generated from the `vgi-python` source via Griffe. We don't hand-edit generated pages — we
> regenerate them.

---

## 1. Starlight integration (`astro.config.mjs`)

- `starlight({...})` is registered **before** `mdx()` in the `integrations` array (Starlight bundles
  Expressive Code, which must load before MDX).
- `pagefind: false` — the site builds its own unified Pagefind index in `postbuild` over all of
  `dist/`, so Starlight's own search is disabled.
- `disable404Route: true` — keep the site's own `src/pages/404.astro` (avoid a route collision).
- `expressiveCode: { themes: [farmTheme] }` — the farm Shiki theme (defined inline in the config, on
  a rock-900 ground) so any Expressive Code output matches the site's `<CodeBlock>`. **One** theme,
  not a light/dark pair: code sits on rock-900 in both docs themes.
- **Component overrides** (`components: {...}`): `Header`, `ThemeProvider`, `ThemeSelect`,
  `TableOfContents` — see §5.
- **`customCss`** loads, in order: `global.css`, then `starlight-theme.css`, `starlight-shell.css`,
  `starlight-api.css`, `starlight-callout.css`, `starlight-kinds.css` — see §6.
- **`sidebar`** is curated by hand: Overview, Tutorial, How-to guides, Concepts, API Reference. The
  API Reference items use **real module names, alphabetised** (e.g. `scalar_function`, `worker`).

Content lives in the Starlight content collection under
`src/content/docs/vgi/docs/python/`:

```
index.mdx                     landing page (hero: VGI emblem, badges, GitHub star, DuckDB, shape gallery, cards)
release-notes.mdx             "What's new" — hand-authored changelog, grouped by theme
tutorial/{scalar,table}.mdx
how-to/{index,function-patterns,catalogs,global-functions,copy-formats,
        state-storage,serve-http,python-app,authentication,
        pushdown-and-statistics,result-caching,metadata,cli,cli-reference,
        generator-api,aggregate-functions,catalog-interface,shared-storage,
        filter-pushdown,column-statistics}.mdx
concepts/{index,lifecycle,argument-serialization}.mdx
api/vgi-*.mdx                 25 Griffe-generated module pages (DO NOT hand-edit)
```

---

## 2. Generators & converters (`scripts/`)

| Script | Purpose |
|---|---|
| `gen-api-mdx.py` | Griffe → MDX. Renders one API-reference page per Python module. |
| `gen-api.sh` | Wrapper: runs `gen-api-mdx.py` over the 25-module list with the right output dir. **That list is the source of truth** for which API pages exist — keep the `astro.config.mjs` sidebar in sync with it. |
| `test_api_completeness.py` | pytest: asserts every documented member renders (the acceptance gate). |
| `mkdocs_to_starlight.py` | Converts a MkDocs `.md` page → Starlight `.mdx`. |
| `convert-vgi-docs.sh` | Wrapper: converts every how-to/concept/reference page from `vgi-python/docs/`. |

Both generators import the live `vgi` package + `griffe`, so run them from a checkout where those
import — i.e. from the **vgi-python** project, e.g.:

```sh
# API reference (also runs the completeness audit; exits non-zero on a gap)
bash scripts/gen-api.sh

# prose pages
bash scripts/convert-vgi-docs.sh

# the audit as a test
cd ~/Development/vgi-python && uv run --with griffe --with pytest pytest \
  ~/Development/query-farm-astro-docs-wt/scripts/test_api_completeness.py -v
```

### `gen-api-mdx.py` — what it does

- **One page per module**, members **alphabetised**. Pure re-export packages (e.g. `vgi.catalog`,
  `vgi.client` — all `Alias` members) resolve their aliases to the target classes; modules with real
  members skip aliases (so re-exported helpers aren't duplicated across pages).
- **Module docstring** renders at the top in a labelled **"Module overview"** panel.
- Each class is **segmented** into `Description` / `Attributes` / `Methods` sections.
- **Signatures** show `*` (keyword-only) and `/` (positional-only) separators and link every type.
- **Descriptions** come from (in order) the member's own docstring → the class `Attributes:` section
  → the `__init__` `Args:` section → a **leading `#` comment** read from source. The completeness
  audit fails the build if anything documented renders blank.
- **Cross-references**: mkdocstrings `[`X`][]` syntax resolves to links (in prose, `<dd>`s, and
  raises terms); balanced outer backticks (`` `[`X`][]` ``) are dropped; RST double-backtick code
  spans (``` ``x`` ```) are handled; a plain code span naming a documented **class** auto-links.
- **Kind icons + tags**: each symbol heading carries a CSS-masked Phosphor glyph and a kind word
  (`class`/`function`/`method`/`attribute`); the kind word flows into the sidebar TOC, where the
  `TableOfContents` override swaps it for a colour-coded icon.
- Code examples in docstrings render via the Starlight `<Code>` component (not bare fences — see §4).

**Regenerate all 25 modules in ONE `gen-api.sh` run.** The generator builds its cross-link index from
the module list it is handed, so a module omitted from the call isn't merely a missing page — it's a
page whose `` [`Symbol`][] `` references silently degrade to plain text on every *other* page. Never
regenerate a subset.

### `mkdocs_to_starlight.py` — what it does

Converts MkDocs Markdown to Starlight-safe MDX: front-matter (title from the H1), `--8<--` snippets
→ `<CodeBlock>` + `?raw` import, `!!!`/`???` admonitions → `<Callout>`, **pipe tables → HTML
`<table>`** (handles escaped `\|`), `.md` links → site-absolute URLs, void tags self-closed, and
MDX-escaping of stray `<`/`{`/`}` (outside inline code). It is **idempotent** — re-run after editing
a source page.

**Only convert pages that have no site-specific edits.** `convert-vgi-docs.sh` currently converts
exactly one page (`global-functions.md`); everything else in the section is hand-authored here and
listed in that script's NOTE block. `how-to/catalogs.mdx`, `how-to/pushdown-and-statistics.mdx` and
`how-to/index.mdx` *used* to be auto-converted — re-running the converter on them in Aug 2026
silently reverted their InfoTips and site lead-ins and reintroduced a link to `/how-to/http-auth/`,
which is a 404 here. Check `git diff` after any conversion run: if it only *removes* content, the
page has drifted from its source and should be dropped from the script.

---

### Diagrams (D2 → committed SVG)

Diagrams (e.g. the lifecycle sequence charts) are authored in **D2** under `src/diagrams/` and
rendered to **committed SVGs** under `public/vgi/docs/diagrams/` by `scripts/render-diagrams.sh`
(needs the `d2` binary locally). We commit the SVGs rather than building D2 at deploy time, so CI
needs no extra binary. Pages embed them as `<img class="lifecycle-diagram" …>`. **`concepts/lifecycle.mdx`
is hand-authored** (it embeds these diagrams + function-shape banners) and is therefore deliberately
**excluded** from `convert-vgi-docs.sh` — don't re-add it or the conversion will clobber it.

## 3. Examples are canonical upstream

Runnable workers live in **`vgi-python/examples/`** and are exercised by
`vgi-python/tests/test_examples_workers.py` (CI). They are **copied** into
`src/examples/vgi-python/` (with MkDocs `--8<--` markers stripped) and embedded via `?raw` imports.
When an example changes upstream, re-copy it; don't fork the logic here.

**Write the example upstream first, even when it is only needed by a page here.** Two of the current
ones (`cache_worker.py`, `copy_format_worker.py`) were written for this site, and drafting them
against a live engine caught four errors in prose that had looked fine: `cache_control=` needs a
`cast(VgiOutputCollector, out)` because vgi-rpc's base `emit()` doesn't take it; `COPY` format names
are qualified by the attach alias (`'tsv.tsvlite'`, not `tsvlite`); `CopyFromFunction.read()` takes
`path=`, not `file_path=`; and `CopyToFunction.close()` returns `int`. An untested snippet in an MDX
file would have shipped all four.

---

## 4. MDX / Starlight gotchas (READ before editing pages)

These are the non-obvious constraints of this content pipeline — most were learned the hard way:

1. **Expressive Code does NOT process Markdown fences** on these content-collection pages. A bare
   ```` ```python ```` block renders as an unstyled `<pre>`. Use the site **`<CodeBlock>`** component
   (prose pages) or Starlight **`<Code>`** (the API generator) instead.
2. **GFM pipe tables are NOT parsed** (remark-gfm isn't wired into this MDX pipeline). Use a raw
   HTML `<table>`. (The converter does this automatically.)
3. **Raw HTML must be MDX-safe**: self-close void elements (`<br />`, `<hr />`); a multi-line raw
   HTML block must contain **no blank lines** (a blank line drops you back into Markdown and breaks
   balance); escape stray `<`, `{`, `}` in prose **outside** inline code; entity-escape `<`/`>`/`{`/`}`
   inside HTML you emit (e.g. table cells, `list<int>`).
4. **Only Markdown headings are collected by the TOC** — raw-HTML headings are not. The API
   generator uses Markdown headings carrying an (empty) icon span + kind word so the symbol shows in
   the TOC.
5. **`--sl-nav-height`** (in `starlight-shell.css`) must equal the site header **plus** the docs
   subnav height, or content/sidebar/TOC overlap the sticky bars.
6. **`.section-container`'s `mx-auto` is zeroed by Starlight's reset** inside the header. Both docs
   bars ride that container — it is what puts the docs chrome on the same centred column as the rest
   of the site — so `starlight-shell.css` restores centering for everything under
   `.page > header.header`. Without that override both bars stick silently to the left edge.
7. **How a page is built is not page content.** The TypeScript, Rust and Java `api/index.mdx` pages
   each used to end in a "How these pages are generated" section — which script runs, which audits
   gate it, why javadoc's doclet wasn't used. A reader looking up a function signature is not
   maintaining this repo's build, and Go's index carried no such section, so it wasn't even a
   convention. That material belongs here, in §§8–11, where it already lived in more detail. Keep it
   here: no generator names, script paths, audit rules, or upstream-toolchain caveats in published
   pages.

---

## 5. Component overrides (`src/components/starlight/`)

- `Header.astro` — a **self-contained** Query.Farm bar (`StrataSun` mark + Petrona wordmark, site
  links, `SearchWidget`, theme picker, "Talk with Us" CTA) **plus** `DocsSubNav.astro` beneath it. It
  deliberately does *not* render the site-wide `layout/Header.astro`: the docs are the only section
  with a dark theme and that header is authored in light-only Tailwind utilities, and keeping the
  bar local means the `--sl-nav-height` contract can't be broken from outside. Everything *visible*
  about it is nonetheless a faithful copy of `layout/Header.astro` — same `.section-container`
  column, 30px mark, Petrona 700 / 21px wordmark, 14px links on a 17px rhythm marked in the link
  green (`--color-link` / `--color-link-dark`), same CTA — so the chrome doesn't change shape when a
  visitor crosses from `/vgi` into the docs. The CTA and link colours are hand-rolled on palette
  tokens rather than `Button`/Tailwind utilities, which are light-only. Its height is `--qf-nav-h`
  (from `global.css`), so it still tracks the main site's nav height.
- `DocsSubNav.astro` — the sticky section subnav (matches Haybarn/Orchard/Cupola): VGI mark +
  "VGI Python" wordmark + **breadcrumbs derived from the Starlight sidebar tree**
  (`Astro.locals.starlightRoute.sidebar`, walked to the `isCurrent` entry) + a GitHub link. Shares
  the bar above's `.section-container` column so the VGI mark sits under the Query.Farm lockup —
  the same relationship `VGISubNav.astro` has with `layout/Header.astro`. Fixed `--qf-subnav-h` tall.
- `ThemeProvider.astro` / `ThemeSelect.astro` — thin wrappers around Starlight's own light/dark
  machinery. **The docs support both themes** (see §6); the two must stay paired, because
  `ThemeSelect`'s inline script calls the `StarlightThemeProvider` global that `ThemeProvider`
  defines.
- `TableOfContents.astro` — renders Starlight's default TOC, then a script that reads each API
  entry's leading kind word and swaps it for a colour-coded kind icon.

`src/components/GitHubStar.astro` — an inviting "Star on GitHub" button; the star count is fetched
from the GitHub API **at build time** and baked in (falls back to no count offline).

---

## 6. Styles (`src/styles/starlight-*.css`)

- `starlight-theme.css` — the **token bridge**: maps Starlight's `--sl-*` tokens to the Strata Sun
  palette + fonts for **both themes**, and publishes the `--qf-*` bridge variables the other four
  files consume (so none of them hard-codes a hex). Load it first.
- `starlight-shell.css` — `--sl-nav-height` (header + subnav), neutralises Starlight's header chrome,
  sidebar / TOC / mobile chrome, and the subnav container guard.
- `starlight-api.css` — the API-reference layout: kind icons/tags, class segmentation
  (`.api-section`), member blocks, parameter/return deflists, signature blocks, module overview
  panel, the landing-page hero (`.vgi-hero*`), and the GitHub star button.
- `starlight-callout.css` — the `<Callout>` component styling (it ships no styles of its own).
- `starlight-kinds.css` — the function-shape gallery + per-section banners (the five VGI shapes).

Palette: **Strata Sun** (see `DESIGN_BRIEF.md`). Light = soil-50 paper / soil-900 ink / **sun-700**
accent (the only gold that carries text on a light ground); dark = rock-950 ground / cream text /
**sun-400** accent. Fonts: Fraunces (display, with `opsz` tracking each heading level),
Commissioner (body, 300), JetBrains Mono (code + all eyebrow labels). **Code always sits on
rock-900 `#1a1512` in both themes** — Expressive Code is configured with a single theme for exactly
that reason. Figures are Commissioner, tabular (brief §2). Per-kind API colours: class = field
green, function = violet, method = blue, attribute = gold, each cut twice for light/dark.

Two things that deliberately do **not** follow the theme, because their artwork is committed with
its colours baked in: the five function-shape SVGs (`starlight-kinds.css` tracks *their* hues, not
the palette's) and the D2 lifecycle diagrams / VGI emblem / DuckDB wordmark, which are mounted on a
paper plate under the dark theme.

---

## 7. Verifying a change

```sh
npm run build      # must succeed; the API generator's completeness audit also gates regeneration
```

Then spot-check in `npm run dev` (localhost:4321/vgi/docs/python/): sidebar shows the four sections,
the subnav breadcrumbs are correct, code blocks are highlighted, tables render, cross-refs link, and
no literal Markdown/entities leak. The existing non-docs pages must be unaffected.

---

## 8. The Go section (`/vgi/docs/go/`)

Same shell, same stylesheets, same house style as Python. Four things differ, all
forced by the language rather than chosen.

**Pages are topic groups, not modules.** `vgi-go` is a single package with ~600
exported symbols, so `scripts/gen-api-go/main.go` carries a curated `groups`
table mapping source files onto pages. That table is the source of truth for
which API pages exist — keep the `astro.config.mjs` sidebar in sync with it.
Grouping by source file was the obvious derivation and is too fine: 70 files
would be 70 pages.

**Two audits gate `scripts/gen-api-go.sh`,** and both exit non-zero:

- every documented exported symbol lands on a page (the Python audit's twin);
- every non-test `vgi/*.go` belongs to exactly one group, so a new file upstream
  cannot silently vanish from the reference.

`*Wire` structs (89 of them) are skipped deliberately — they are the generated
request/response envelopes, exported for the codec, not API a worker author
writes against.

**MDX mechanics the Go generator had to learn** (all of them cost a build):

1. Frontmatter values are quoted. A blurb like `"Per-group accumulation: update,
   combine"` is a YAML mapping otherwise.
2. `{` and `}` are escaped inside raw-HTML blocks. MDX reads `{` as an
   expression, and every Go struct signature contains one.
3. Multi-line signatures go through Starlight's `<Code>`, not `<pre>`. Raw HTML
   in MDX may not contain a blank line and struct bodies routinely do.
4. `mdEscape` skips inline code spans. Escaping inside them is not merely
   unnecessary, it is wrong — the entity survives into the rendered `<code>` and
   the reader sees `struct&#123;&#125;`.
5. Only *resolvable* `[Name]` references become links. Go uses the same brackets
   for generic type parameters, so rewriting `TypedScalarFunc[A]` corrupts the
   signature the sentence is describing.

**`vgi/doc.go` is the package overview page,** not a discarded file. It holds the
best orientation prose in the SDK and most of its `[Symbol]` cross-references, so
the generator renders it at `api/index.mdx` and links the reference pages from it.

### Go examples

`vgi-go/examples/docs/` — standalone runnable workers, one per shape, with tests.
Distinct from `vgi-go/examples/`, which holds fixture *functions* for the
integration suite: those are not runnable on their own and are not what a
tutorial wants.

Every one was driven end to end against a real DuckDB engine before being
embedded, which is the only reason the docs are correct about three things that
look fine on paper:

- `vgi:"...,type=bigint"` was silently becoming VARCHAR. Fixed upstream to reject
  unknown names; the tutorial now documents the Arrow-vs-SQL naming rather than
  the old failure.
- Aggregate state must be `gob.Register`ed by hand. The typed adapters do it for
  table and table-in-out state; `RegisterAggregate` takes the interface directly
  and has no adapter, so an unregistered state fails on the first `GROUP BY`.
- A TABLE argument needs an explicit `ArgSpec`; struct tags bind scalar values
  and a relation is not a value.

### Go pages

Landing, "What's new", both tutorial steps, function patterns, and twelve how-to
guides — argument-tags, errors, catalogs, state-storage, serve-http,
authentication, calling-a-worker, settings-and-secrets,
pushdown-and-statistics, result-caching, copy-formats, plus the index — against
17 API pages. Structure and house style match Python's.

The last three how-to pages came out of a developer-experience review of the Go
prose, and each documents something a reader could not have inferred:

- **argument-tags** — the full `vgi:"..."` grammar. `const` defaults to **true**,
  so a column argument that omits `const=false` binds as a literal.
- **errors** — the six typed errors, `RecoverPanic`, and the trap that
  `AsRpcError` maps with a non-unwrapping type switch, so `fmt.Errorf("...: %w",
  argErr)` silently degrades to `RuntimeError`.
- **authentication** — `SetAuthenticate` and the `vgirpc` bearer/mTLS/OAuth
  helpers, HTTP-transport only.

`function-patterns.mdx` also gained **Parallelism and `OnInit`**. `AsTableFunction`
defaults `OnInit` to `MaxWorkers: 1`; raising it without partitioning multiplies
the output, verified as `series(10)` returning 40 rows under `MaxWorkers: 4`. The
documented fix — `OnInit` pushes shards with `Storage.QueuePush`, `Process` pops
until empty — was verified back to 10.

**vgi-go is worker-side only.** It ships no client, so `calling-a-worker.mdx`
documents the two real paths instead: through DuckDB with the haybarn engine
(what production does, and what every example here was verified with), or with the
Python SDK's `Client` and `vgi-client` CLI.

### Known gaps

- Nothing outstanding for Go prose. The remaining differences from Python are
  deliberate: no client page (vgi-go ships no client — `calling-a-worker.mdx`
  documents DuckDB and the Python client instead).
- Uncovered capabilities, equally uncovered on the Python side: writable
  catalogs and DML, macros, window and streaming aggregates, the shared-memory
  transport, and time travel. `CatalogTable.SupportsTimeTravel` is named on
  `how-to/catalogs.mdx` but nothing walks a reader through it.

### Four traps the Go examples exist to document

Each cost a real debugging round trip, and each is invisible until runtime:

1. **`type=bigint`** silently became VARCHAR. **Fixed upstream** — unknown names
   are rejected at registration with a suggestion.
2. **Aggregate state was not gob-registered.** **Fixed upstream** —
   `RegisterAggregate` now registers the concrete type by asking `NewState`,
   matching what the typed adapters already did for the other shapes.
3. **A reader and writer sharing a COPY format name silently lost one.**
   **Fixed upstream** — one handler serving both directions merges to
   `direction="both"`; two handlers claiming one name is rejected at registration.
4. **A TABLE argument needs an explicit `ArgSpec`.** Struct tags bind scalar
   values, and a relation is not a value. Not fixable — it is a property of the
   tag mechanism — so it is documented instead.

All four came out of running the examples against a real engine. None was visible
by reading the source.

---

## 9. The TypeScript section (`/vgi/docs/typescript/`)

Same shell, same stylesheets, same house style as Python and Go. What differs is
forced by the SDK rather than chosen.

**Pages are topic groups, like Go's.** `@query-farm/vgi` is one barrel
(`src/index.ts`) re-exporting ~390 symbols from ~65 files, so
`scripts/gen-api-ts/main.ts` carries a curated `GROUPS` table mapping source
files onto pages. That table is the source of truth for which API pages exist —
keep the `astro.config.mjs` sidebar in sync with it. `api/index.mdx` is
hand-written and is **not** emitted by the generator, so a regeneration leaves
it alone.

**Two audits gate `scripts/gen-api-ts.sh`,** and both exit non-zero:

- every exported symbol lands on a page (or is a vgi-rpc re-export, which gets
  its own page rather than being scattered);
- every `src/` file that declares an exported symbol belongs to a group, so a
  new module upstream cannot silently vanish. This one earned its keep on the
  first run, catching `codec/repr.ts` and `filter-pushdown/collector.ts`.

**The generator parses with THIS repo's `typescript` devDependency, not
vgi-typescript's.** That checkout is on TypeScript 7 — the Go-native port — which
ships `tsc` but no JS compiler API (`ts.sys` is undefined). TypeScript 5.9 parses
the same source fine.

**MDX mechanics the TS generator had to learn:**

1. Braces need escaping inside raw-HTML blocks, exactly as in Go. A signature
   like `VgiBackendInfo = { name: "arrow-js" }` inside `<pre><code>` parses as a
   JSX expression and fails with *"Expected `,` or `)` but found `:`"*.
2. JSDoc fenced code blocks are pulled out and re-emitted as `<Code>`. Prose and
   code need *opposite* escaping — a fence keeps braces literal, the paragraph
   around it does not — so they must be separated before either is escaped.
3. Interfaces render header-only plus a **field list** — one row per property,
   carrying its name, its type and its own JSDoc as prose. They used to print
   whole, on the reasoning that the declaration already carried every property
   with its JSDoc; it does, but as *comments inside a code block*. vgi-typescript
   documents its surface on properties rather than on declarations (unlike Go and
   Java, whose declaration-level doc comments the generators lift into a
   Description), so printing whole made `AggregateFunctionConfig` seventy lines of
   source with no prose anywhere on the page. Undocumented fields get a `<dt>` and
   no `<dd>`, which keeps the many that vgi-typescript leaves bare as a tight
   name/type list. Classes render header-only plus individual members, since the
   body is implementation.
4. A JSX attribute is not a JS string: `title="`repr: \"raw\"` …"` fails to
   parse. Use single quotes inside the attribute value.

### TypeScript examples

`vgi-typescript/examples/docs/` — standalone runnable workers, one per shape,
plus catalog and caching. Distinct from `examples/`, which holds fixture
functions for the C++ integration suite. `verify.sh` runs all nine checks against
a real engine (`HAYBARN=/path/to/haybarn ./verify.sh`); there is no `bun test`
equivalent because stock DuckDB cannot `INSTALL vgi`.

Every example was also **type-checked under `strict` against the published
0.28.0 from npm**, not the working tree — the same discipline the Go section
adopted after documenting unreleased behaviour once.

### Five traps the TypeScript examples exist to document

Each cost a real debugging round trip, and none is visible by reading the source:

1. **An `int64` argument is a `bigint` in a scalar function's columns and a
   `number` in a table function's `args`.** Mixing them throws *"Invalid mix of
   BigInt and other type"* at runtime, from inside `process`. Normalize with
   `BigInt()` once in `initialState`.
2. **`getChildAt` does not run the codec.** `iterRows` and the typed compute
   paths return *rich* values; `getChildAt` returns the backend's own storage —
   `DecimalBigNum [12345,0,0,0]` rather than `12345n`, a millisecond `number`
   rather than a microsecond `bigint`. For `int64` the two agree, which is
   exactly why nobody notices until a date or a decimal is involved.
3. **`repr: "raw"` governs the codec, not `getChildAt`.** The README's own
   `add_hour` example casts a column to a branded type and adds a `bigint`; it
   type-checks and throws at runtime. `iterRows(batch, "raw")` is the correct
   read.
4. **`int` means different things per entry point.** On the package root it is an
   `Int64` *instance*; on `/worker-cf` it is the *factory* `int(bitWidth?)`. The
   same collision hits `int32`, `float32` and `bool`. `int64()` is the portable
   spelling — a function on both. Silent on 0.28.0; rejected at definition time
   from 0.29.0.
5. **Columns are erased.** `VgiColumn` is `Iterable<unknown>` and `get()` returns
   `unknown`, because the two Arrow backends parameterize differently. Under
   `strict` a cast at the use site is required, and the README's examples omit
   it.

### Known gaps

- No state-storage how-to yet; the buffering section of `function-patterns.mdx`
  covers the essentials and `api/storage.mdx` has the types. The Cloudflare
  Durable Object backend (`FunctionStorageCfDo`) is mentioned on the runtimes
  page but not walked through.
- No filter-pushdown / statistics how-to, which Python and Go both have.
- No authentication page. Unlike Go there is no `SetAuthenticate` equivalent
  surfaced from this package — auth lives in `vgi-rpc`'s HTTP layer — so the
  shape of that page is still an open question.
- Nothing on COPY formats, though `defineCopyFromFunction` /
  `defineCopyToFunction` exist and are in the reference.

### Five upstream fixes this documentation produced

All five came out of running the examples, not reading the source. Landed in
vgi-typescript `60d9199`, **unreleased** — the site pages describe 0.28.0
behaviour, so anything below marked 0.29.0 needs that release before the docs
claiming it are true.

1. **Uncalled type factories are rejected at definition time.** `params: { n:
   int64 }` type-checked and built a spec whose `arrowType` was a `Function`.
   All six `define*` factories now throw a message naming the field, the call to
   add, and the per-entry-point asymmetry that makes the mistake easy.
2. **The four arg-extraction sites share one narrowing helper.** They did not
   before — table, copy-from and copy-to went through `safeNumber`, table-in-out
   through a bare `Number()`. Behaviour is unchanged; policy now lives in one
   place.
3. **`safeNumber` throws** rather than rounding, as its name always implied. The
   arg paths deliberately do not use it — see below.
4. **`VgiColumn` documents that it skips the codec**, with the per-type table of
   what differs from `iterRows`.
5. **`Worker.run()` startup tracing moved behind `VGI_DEBUG`.** Errors still
   print unconditionally.

The README's factory-name note was also wrong twice — it claimed `int`,
`int32`, `float32` and `bool` are *not* re-exported from the package root (they
are) and directed readers to `@query-farm/vgi/arrow`, which does not exist.

**One dead end worth recording, in two stages.** Fix 2 was first written to
*throw* on a value too large for a double. That broke
`constant_columns(2, 9223372036854775807)`, a passing HTTP-transport test:
`extractArgs` eagerly resolves every declared spec including a varargs spec
whose values the function reads raw off `bindCall.arguments`, so the throw fired
on a value nobody consumes.

The second attempt kept the bigint instead — and that was also wrong, for a
better reason. An inventory of every int64 argument in the fixtures and in every
shipped worker turned up nothing but small control values (`count`, `page_size`,
`batch_size`, `increment`, `lag_minutes`, `restatement_lookback_days`); the
large int64s in the suite are column data, filter-pushdown constants (which
`deserialize.ts` already keeps as bigint, with its own regression test), varargs
values read raw, and time-travel versions carried as strings. So preserving the
bigint bought nothing real and cost an argument whose JS type depended on its
magnitude — the kind of thing that passes every test and fails on one caller's
input. Reverted to a plain narrowing; the inventory is in the `narrowArgValue`
doc comment, because the next person will have both ideas in this order.

**A second dead end.** Making `VgiColumn`/`VgiBatch` generic — so
`getChildAt<bigint | null>(0)` needs no cast — required ~25 `as unknown as`
casts across 13 internal files, because both backends' native batches are
assigned to `VgiBatch` structurally and a concrete `get(): unknown` does not
satisfy a generic `get(): T`. Adding casts internally to remove one cast in user
code is a bad trade; the generic was backed out and the reason recorded in
`src/arrow/types.ts`.

---

## 10. The Rust section (`/vgi/docs/rust/`)

Same shell, same stylesheets, same house style. Pages are topic groups, as for
Go and TypeScript.

**The surface spans three crates.** `vgi` is the worker framework, `vgi-protocol`
owns the wire types it re-exports (`CacheControl` lives there, not in `vgi`), and
`vgi-client` is the client. rustdoc emits one JSON per crate with only stubs for
the others, so `scripts/gen-api-rust/main.py` reads and merges all three. Miss
that and the cache-control page renders empty — which is exactly how it was
found.

**rustdoc JSON is nightly-only.** `-Zunstable-options --output-format json` is
the one build requirement the other two generators do not have; the stable
toolchain still builds and runs workers, only the docs need nightly.

**Signatures are sliced from source, not reconstructed.** rustdoc gives a `span`
(file + line range) per item, so the generator reads the real lines and strips
attributes, doc comments and function bodies. Rebuilding a Rust signature from
the JSON type trees is a large amount of work that produces something subtly
unlike what the author wrote; the source already says it exactly.

**Inherent `impl` methods need walking explicitly.** A struct's source slice is
just its fields — its constructors and builders live in separate `impl` blocks
the slice never reaches, and those are most of what a caller uses
(`CacheControl::ttl`, `ArgSpec::column`). The generator follows
`inner.struct.impls`, keeps the blocks whose `trait` is `None`, and renders their
children as members. Traits are the opposite: their methods are inside the
declaration the slice already shows, so rendering them again would duplicate.

**Two audits gate `scripts/gen-api-rust.sh`,** and both exit non-zero: every
module that exports a public documented item belongs to a group, and every
collected item is rendered. The first caught eleven `vgi-client` modules on the
run that added the other crates.

### Rust examples

`vgi-rust/examples/docs/` — a workspace member with one binary per shape, so a
reader can copy a single file. Distinct from `vgi-example-worker`, which holds
fixtures for the C++ integration suite. `verify.sh` runs all nine checks against
a real engine.

### Three traps the Rust examples exist to document

1. **A TABLE argument is declared like any other**, with the Arrow type string
   `"table"`. Leave it out and the call fails with *"Binder Error: Table function
   cannot contain subqueries"* — which names neither the worker nor the missing
   spec.
2. **Aggregate state is an opaque `Vec<u8>`.** Encoding is the function's job,
   unlike Go (gob) or TypeScript (a plain object).
3. **A conditional cache request arrives through the producer's
   `on_conditional_request`**, not on `ProcessParams`.

### Two upstream fixes this documentation produced

Both in vgi-rust, **unreleased** — the tutorial documents the 0.29.0 workaround
and says so.

- **`vgi` now re-exports `vgi-rpc`.** Every trait method returns
  `vgi_rpc::Result`, so implementing one needed a direct dependency — and
  published `vgi` 0.29.0 wants vgi-rpc `^0.21` while a bare `cargo add vgi-rpc`
  installs 0.22. 0.x minors are semver-incompatible, so Cargo never unifies them
  and the user gets two `RpcError` types and a trait that cannot be implemented.
  This was the first thing hit when scouting the crate.
- **`CatTable`, `CatView` and `CatMacro` gained a `Default`**, which
  `CatalogModel` and `CatSchema` already had. `CatTable`'s is hand-written
  because `columns: SchemaRef` has no `Default`; an empty schema stands in.
  Without it a catalog example spells out twenty fields, nineteen of them zero.

### Known gaps

- No guide for `vgi-client`, though it has a generated reference page. It is the
  newest part of the crate (three commits old at the time of writing).
- Nothing on pushdown/statistics, secrets/settings, COPY formats or state
  storage beyond their reference pages.
- The wasm32 target gets a section on the transports page but no worked example;
  it needs a page with a real DuckDB-WASM host to be worth much.

---

## 11. The Java section (`/vgi/docs/java/`)

Same shell, same stylesheets, same house style. Java differs from the other four
in where its material came from and in how much of the work is *operational*
rather than API.

**The source material was an existing site.** `vgi-java-introduction-docs` is a
VitePress guide (22 pages), a Slidev deck, a runnable Gradle examples project
and an agent pack, published at `vgi-java-introduction.query.farm`. The section
here was written from that corpus rather than from scratch — but written, not
converted. The Python converter's history (§2) is the argument against
auto-conversion: a re-run silently reverts hand edits.

**Examples live in `vgi-java/examples/docs/`**, like every other section — a
Gradle subproject (`:examples:docs`) building against `project(":vgi")` so they
track the SDK at HEAD. They started life in the docs repo against the published
artifact, which is precisely how they drifted twenty-five releases behind without
anything noticing; `verify.sh` runs ten checks against a real engine, two of them
for the traps below.

**The API generator parses Java source.** `scripts/gen-api-java/main.py` — no
JDK, no Gradle, just the checkout. javadoc's standard doclet emits a linked HTML
site rather than data, so producing MDX from it means either a custom doclet (a
Java build step inside a JS repo) or scraping HTML; reading declarations is what
the Go, TypeScript and Rust generators already do. The parser is deliberately
shallow — public type declarations and their public members, no attempt to
understand Java.

Javadoc prose is **HTML**, which the other three are not. `<p>`, `<ul>/<li>`,
`<h2>`, `<pre>`, `<code>` are converted to Markdown before the MDX escaping runs;
without that step the reader sees `\<h2\>compute() signature rules\</h2\>`.

Two audits gate `scripts/gen-api-java.sh`: every package declaring a public type
belongs to a group (or to `SKIP_PACKAGES`, which holds `internal`), and every
collected type is rendered. 149 types across 14 pages.

### Two verified traps, both operational

Neither is about the API, and both cost real time:

1. **`-parameters` fails silently.** The annotation API derives the SQL signature
   from parameter *names*, which `javac` erases by default. Without the flag the
   worker starts, registers and answers positional calls — but
   `vgi_function_arguments()` reports `arg0` instead of `value`, and
   `upper_case(value := 'hello')` stops resolving. Verified both directions
   against a real engine, and confirmed at the class-file level (`javap -v` shows
   no `MethodParameters` attribute).
2. **A pooled `launch:` worker outlives your rebuild.** The `launch:` scheme
   reuses one JVM over a flock-coordinated socket, which is essential because a
   cold JVM costs seconds — and means that after `./gradlew installDist` the old
   build keeps answering. This invalidated the first `-parameters` probe: it
   reported the *previous* build's behaviour, and only a forced kill produced the
   real answer.

### Two upstream fixes

Both in `vgi-java-introduction-docs`, committed and pushed:

- **The examples pinned `farm.query:vgi:0.1.0`** — twenty-five releases behind
  the 0.26.1 on Maven Central — so the published guide showed a 0.1.0 API to
  readers installing current. Fixed, then made structural by moving them into
  the SDK repo where a version can no longer silently rot.
- **`BufferingFinalizeProducer.storage` is now a method, not a field.** Bumping
  to 0.26.1 produced exactly one compile error across seven examples, which says
  the API has aged well. The accessor re-binds the storage view from
  `(executionId, attachId)` when a producer is resumed after an HTTP
  continuation; a field read cannot.

### Known gaps

- No client guide, though `vgi-client` has a reference page. It arrived over
  0.25.0–0.26.1 and is the newest part of the artifact.
- Nothing beyond reference pages for pushdown/statistics, cache control, state
  storage or secrets and settings.
- The source corpus has pages this section has not absorbed: `advanced/benchmarks`,
  `guides/testing`, `reference/cli-and-env`, and the agent pack. `guides/testing`
  is the most valuable of those — no other SDK section has a testing page. The
  standalone site's `examples/` directory is gone (moved); its remaining prose is
  still the only home for those four.
