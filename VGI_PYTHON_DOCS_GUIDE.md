# VGI Python documentation (Starlight) — build guide

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
- `expressiveCode: { themes: [farmTheme] }` — the dark-green farm Shiki theme (defined inline in the
  config) so any Expressive Code output matches the site's `<CodeBlock>`.
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
tutorial/{scalar,table}.mdx
how-to/{index,function-patterns,catalogs,state-storage,http-auth,
        pushdown-and-statistics,metadata,cli,generator-api,
        aggregate-functions,catalog-interface,shared-storage,
        authentication,filter-pushdown,column-statistics}.mdx
concepts/{index,lifecycle,argument-serialization}.mdx
api/vgi-*.mdx                 14 Griffe-generated module pages (DO NOT hand-edit)
```

---

## 2. Generators & converters (`scripts/`)

| Script | Purpose |
|---|---|
| `gen-api-mdx.py` | Griffe → MDX. Renders one API-reference page per Python module. |
| `gen-api.sh` | Wrapper: runs `gen-api-mdx.py` over the 14-module list with the right output dir. |
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

### `mkdocs_to_starlight.py` — what it does

Converts MkDocs Markdown to Starlight-safe MDX: front-matter (title from the H1), `--8<--` snippets
→ `<CodeBlock>` + `?raw` import, `!!!`/`???` admonitions → `<Callout>`, **pipe tables → HTML
`<table>`** (handles escaped `\|`), `.md` links → site-absolute URLs, void tags self-closed, and
MDX-escaping of stray `<`/`{`/`}` (outside inline code). It is **idempotent** — re-run after editing
a source page.

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
6. **`.section-container`'s `mx-auto` is zeroed by Starlight's reset** inside the header; the docs
   subnav restores centering with an explicit override in `starlight-shell.css`.

---

## 5. Component overrides (`src/components/starlight/`)

- `Header.astro` — renders the site-wide `layout/Header.astro` **plus** `DocsSubNav.astro` beneath it.
- `DocsSubNav.astro` — the sticky section subnav (matches Haybarn/Orchard/Cupola): VGI mark +
  "VGI Python" wordmark + **breadcrumbs derived from the Starlight sidebar tree**
  (`Astro.locals.starlightRoute.sidebar`, walked to the `isCurrent` entry) + a GitHub link. Uses the
  shared `.section-container` (centered).
- `ThemeProvider.astro` — forces `data-theme='light'` (the site is light-only).
- `ThemeSelect.astro` — empty (no dark-mode toggle).
- `TableOfContents.astro` — renders Starlight's default TOC, then a script that reads each API
  entry's leading kind word and swaps it for a colour-coded kind icon.

`src/components/GitHubStar.astro` — an inviting "Star on GitHub" button; the star count is fetched
from the GitHub API **at build time** and baked in (falls back to no count offline).

---

## 6. Styles (`src/styles/starlight-*.css`)

- `starlight-theme.css` — maps Starlight `--sl-*` tokens to the farm palette + fonts; light-only.
- `starlight-shell.css` — `--sl-nav-height` (header + subnav), neutralises Starlight's header chrome,
  restores the subnav container centering.
- `starlight-api.css` — the API-reference layout: kind icons/tags, class segmentation
  (`.api-section`), member blocks, parameter/return deflists, signature blocks, module overview
  panel, the landing-page hero (`.vgi-hero*`), and the GitHub star button.
- `starlight-callout.css` — the `<Callout>` component styling (it ships no styles of its own).
- `starlight-kinds.css` — the function-shape gallery + per-section banners (the five VGI shapes).

Palette is light-only farm tones: harvest green accent, soil neutrals; fonts Space Grotesk (display),
Inter (body), JetBrains Mono (code). Per-kind colours: class = green, function = violet,
method = teal, attribute = amber.

---

## 7. Verifying a change

```sh
npm run build      # must succeed; the API generator's completeness audit also gates regeneration
```

Then spot-check in `npm run dev` (localhost:4321/vgi/docs/python/): sidebar shows the four sections,
the subnav breadcrumbs are correct, code blocks are highlighted, tables render, cross-refs link, and
no literal Markdown/entities leak. The existing non-docs pages must be unaffected.
