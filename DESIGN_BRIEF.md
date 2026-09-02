# Query.Farm — Strata Sun redesign brief

Migration contract for the visual redesign. **Every agent working on this branch reads this
file first and follows it exactly.** Prototypes live in the session scratchpad under
`prototypes/`; this document is the authority, not the prototypes.

Branch: `feat/strata-sun-redesign`

---

## 1. Identity

| Element | Decision |
|---|---|
| Mark | **Strata Sun** — a circle clipped over four hard horizontal bands, palest at top. Reads as a sun and as a core sample seen end-on. `public/mark-strata-sun.svg` |
| Favicon | 2-band variant. Four bands turn to mud below ~24px. `public/favicon.svg` |
| Wordmark | **Petrona**, wght 700, slightly tighter tracking than headings (`.qf-wordmark`) |
| Wordmark dot | The `.` in Query.Farm is **`sun-700`** on light, **`sun-400`** on dark |
| Display / headings | **Petrona** wght 600, `letter-spacing: -0.022em` |
| Body | **Commissioner** 300 |
| Code | **JetBrains Mono** (already in the project) |

Band count reduces with size: **4 bands** at display → **3** at ~22px → **2** at 16px.

### The display face is Petrona, not Fraunces
This brief originally specified Fraunces with an `opsz`/`SOFT`/`WONK` variation table. **That
was superseded during the migration and the table is gone** — see §10. Fraunces was dropped
because its roman `f` carries a descending tail and a heavy curled terminal: the family's
signature glyph, and far too loud at headline size. That was the letterform itself, not the
WONK axis, which was already 0.

Petrona ships **only weight and a real italic** — no `opsz`, no `SOFT`, no `WONK`. So there is
no optical-size ladder to track: **600 is correct at every heading level**, and size is set with
the ordinary Tailwind ladder (`text-xl` / `text-2xl` / `text-3xl md:text-4xl` / `text-4xl
md:text-5xl`). Any `font-variation-settings` naming those axes is dead code — delete it rather
than carrying it forward.

Petrona is also a touch narrower and lower-contrast than Fraunces, which is why long headlines
set tighter than the old spec assumed.

---

## 2. Figures — the rule that is easy to get wrong

> **Figures come from Commissioner, always tabular. Petrona sets words.**

The rule survived the Fraunces → Petrona swap unchanged, because the defect is the same in both:
their figures are drawn for character, not data, and **neither family ships a tabular set**, so
right-aligned numeric columns do not line up. On a page listing every extension by load count
that is a defect, not a preference.

The inverse is equally a violation and is easier to commit by accident: **`.qf-figure` never goes
on prose.** It forces Commissioner 500 with `tabular-nums` and `-0.035em` tracking — a treatment
designed for a right-aligned numeric column. Applied to a sentence containing no digits it just
sets that sentence in the wrong face.

Use `.qf-figure`, or the auto-applied selectors `.stat-value`, `.load-count`, `.fn-count`,
`td[data-numeric]`, `th[data-numeric]`.

**One exception:** a numeral inside a running headline sentence ("Five parts, one farm") stays
in Fraunces, because there it is a word. Anything that is a measurement, count, version, or
table column gets the sans.

---

## 3. The contrast law — non-negotiable

Measured, not eyeballed. The mid band is counter-intuitive and broke in the first pass.

| Ground | Text | Ratio |
|---|---|---|
| Light — `pipe-1/2`, `soil-50/100/200` | **ink** `#211a12` | ~12:1 ✓ |
| **MID — `pipe-3`, `soil-400`** | **ink, NOT cream** | cream is **2.7:1 ✗** · ink is **5.4:1 ✓** |
| Dark — `pipe-4/5/6`, `soil-600/700`, `rock-*` | **cream** `#f4ece0` | 5–8:1 ✓ |

- `sun-400` gold as body text on mid/dark is **3.3:1 — never**. Gold is display and accent only.
- `sun-700` `#7d5714` is the **only** gold that may carry text on a light ground.
  Measured: **5.8:1** on soil-50, 5.4:1 on soil-100, 5.2:1 on a cat-gold chip.
  It was originally `#a5761f`, documented as 4.6:1 and actually 3.2–4.0:1 — it
  failed on every ground it was used on. Do not lighten it back.
- **Code blocks always sit on `rock-900` `#1a1512`.** Never directly on a coloured band —
  syntax hues lose separation on brown.

---

## 4. Colour scale rename

The old scales are **kept as deprecated aliases** in `global.css` during migration so
unmigrated components don't break. They are deleted in the final cleanup pass. Do not add new
usages of the old names.

| Old | New | Note |
|---|---|---|
| `harvest-*` (green CTA) | `field-600` / `field-700` | `field-700` is the CTA fill, 5.1:1 on paper |
| `grain-*` (lime) | `sun-*` or `field-*` | judge per use; lime is gone |
| `earth-*` | `soil-*` | |
| `soil-*` (old) | `soil-*` (new values) | values changed, names kept |
| `duck-*` (yellow) | `sun-*` | |

New scales: **`sun`** (the mark's bands, display + accent), **`soil`** (grounds),
**`rock`** (code + dark end), **`field`** (the one cool note, CTAs), **`pipe-1..6`**
(homepage stage bands only).

---

## 5. The band rule

The six-stage colour run is a **homepage-only device**. It works there because the bands
*are* the pipeline stages — they carry meaning. Elsewhere that meaning is absent, so full
bands would be decoration, and a docs page that changes background five times while you read
a function signature is hostile.

Every other page family gets the palette in exactly one of three reduced forms:

- **hairband** — the 5px six-colour strip under the page header (`.hairband`)
- **one dark slab** — a single `pipe-6` section, used once per page maximum
- **nothing** — paper only

---

## 6. Page families

Thirty-one routes + the extension detail pages + dynamic connector/version pages → **six templates**.

| | Family | Bands | Routes |
|---|---|---|---|
| A | **Home** | Full six stages | `/` |
| B | **Catalog** | Hairband | `/products/extensions`, `/products/orchard`, `/haybarn/status/*`, `/haybarn/extensions` |
| C | **Docs / reference** | **None** | `/products/extensions/[slug]` (32 public, 35 built), `/haybarn/{install,security,compatibility,community-extensions}`, `/vgi/{architecture,getting-started,building-a-worker,distributing-a-worker,languages}`, `/products/orchard/connectors/[slug]`, Starlight `/vgi/docs/python/*` |
| D | **Section landing** | Hairband + one slab | `/haybarn`, `/vgi`, `/products`, `/products/cupola`, `/products/orchard`, `/products/rowfence`, `/consulting` |
| E | **Editorial** | Card strips only | `/blog`, `/blog/[slug]`, `/company/about` |
| F | **Company / utility** | Hairband + one panel | `/company/{contact,schedule,newsletter}`, `/404`, `/licenses/source-available` |

### Family C is the highest-volume and gets the most care
Three columns: section nav / prose / page TOC. Signature blocks, parameter tables, examples
with a Try button into the existing REPL island. `content-visibility: auto` (`.cv-auto`) must
be **preserved** on function-doc cards — it is a real Safari perf fix on pages like
`datasketches` with hundreds of signatures.

---

## 7. Shell

- `nav.site` — sticky, 58px, paper w/ blur, real product names (never horizon letters or
  stage numbers)
- `.subnav` — sticky beneath the nav at `top: var(--nav-h)`, per-section, with the section
  mark + name on the left. The five existing `*SubNav.astro` components map onto this 1:1.
- `footer.site` — five columns + a base row

---

## 8. Motion

- The mark's bands settle in top-down on load, 60ms stagger, once. Never loops.
- Everything respects `prefers-reduced-motion: reduce`.
- No scroll-jacking anywhere — it would fight the REPL islands, in-page anchors, and
  browser find.

---

## 9. Hard constraints — do not break these

1. **`npm run build` must pass.** `loadExtensionData` validates against Zod and a schema
   mismatch is a hard build failure *by design*. Do not touch anything under
   `src/data/**/generated/`.
2. **Do not edit generated content.** `src/data/extensions/*/generated/*.json` and the
   VGI Python docs under `src/content/docs/` are machine-produced.
3. **`npm run check:examples` must still pass** — SQL examples are executed for real.
4. Preserve all `getStaticPaths`, route shapes, and frontmatter contracts.
5. Preserve JSON-LD, meta tags, sitemap behaviour, and `og-image` wiring.
6. Accessibility: keep focus states visible, keep landmarks, keep heading order.

---

## 10. Resolved during the migration

Decisions taken after the brief was first written. Recorded here so the brief
stays the authority rather than drifting from the code.

**Fraunces → Petrona (§1, §2).** The display face changed during the migration
and §1 was not updated for two passes, so the brief spent that time instructing
agents to set headings in a font the project does not load. Fraunces was dropped
for its roman `f` — a descending tail and a heavy curled terminal, the family's
signature glyph and far too loud at headline size. That is the letterform, not
the WONK axis, which was already 0.

The consequence worth writing down: **Petrona has no `opsz`/`SOFT`/`WONK` axes
at all**, only weight and a real italic. The optical-size ladder that used to
live in §1 is therefore deleted rather than retuned — there is nothing to tune.
Headings are 600 at every level and take their size from the ordinary Tailwind
ladder. `--font-display` in `global.css` is the single source of truth; page-
local `font-family: 'Petrona', …` rules pin the face and should use
`font-display` instead, so the next swap doesn't strand them the way this one
stranded `.qf-faq-summary`.

§2 is unaffected in substance: neither family ships a tabular set, so figures
still come from Commissioner. The rule now also states its inverse explicitly,
because applying `.qf-figure` to prose turned out to be the more common error.

**`/consulting` moved from Family E to Family D (§6).** It was filed as editorial
alongside `/blog` and `/company/about`, and that classification caused a real
defect rather than describing one. Family E sanctions no slab and no hairband,
so "card strips only" was the only device available — and the page became six
consecutive card grids at 3 / 2 / 3 / 4 / 1 / 1 columns, every card the same
`rounded-xl border border-soil-300`, with nothing bigger, darker, or differently
shaped to anchor the eye.

The page is not editorial: no reading measure, no running prose, no author, no
date. Structurally it is what every other section landing is — `PageHead` with a
hairband, alternating `soil-50` / `soil-100` sections, one `pipe-6` slab, a
closing CTA. It had in fact already broken Family E by shipping that slab, which
is the clearest evidence the label was wrong rather than the page.

`/products/rowfence` is added to the same row: it was built to Family D from the
start and was simply missing from the table.

**Category tints.** Six hues re-cut warm (`cat-gold`, `cat-field`, `cat-clay`,
`cat-slate`, `cat-plum`, `cat-moss`, each with a `-ink`) live in `global.css`.
They exist because collapsing every per-category colour to neutral cost real
scanability in two places: the Orchard connector catalog, and object-kind
badges on extensions with hundreds of entries. Every `-ink` measures 6.1–7.3:1
on its own chip. Chips sit only ~1.15:1 against paper, so they **always** carry
a hairline border. This is the one sanctioned exception to "one gold accent" —
it applies where colour is carrying information, never for decoration.

**The extensions catalog bands (§5 exception).** `/products/extensions` groups
32 extensions into eight intent buckets. Those sections carry a **stepped
progression** — the homepage model — walking `soil-50` to `pipe-3` in eight
even steps. This is a deliberate departure from Family B's "hairband only":
the eight groups are the page's real structure, so the bands do carry meaning
here in the way §5 requires, rather than decorating.

Both ends are real brand tokens — paper at the top, the MID stage band at the
bottom. Two earlier attempts were rejected. A `cat-*` tint per bucket broke the
rule directly above this one: those are chip colours for where hue carries
information, and clay/slate/plum read as off-palette across a full band in a
warm earth system. A two-tone `soil-50`/`soil-200` alternation is in-palette
but stripes rather than progresses.

The run stops at `pipe-3` because that is the last band the white catalog cards
can sit on. `pipe-4` and darker would need the homepage's whole `.on-dark` card
treatment, and rendering the same 32 peer objects two different ways depending
on scroll position is worse than a shorter run. Steps land ~1.15:1 apart, so
each boundary reads without any single band looking tinted on its own, and the
cards *gain* separation on the way down — 1.11:1 on paper to 3.04:1 on `pipe-3`.

Text follows the §3 MID-band law rather than a special case. `soil-700` blurbs
fail from band 6 (3.99:1) and `soil-600` counts from band 4 (4.18:1), so both
go to ink from band 4 — worst case 5.66:1 on `pipe-3`. Headings were already
ink. The run ends at the last band: the closing commission panel sits on plain
paper, with no transition back. A gradient there was tried and removed — it
read as a ninth band and implied the progression continued past the catalog.

**The hairband is dropped on this page.** It sat under the page header, and
that header — which existed only to carry a breadcrumb — was removed once the
subnav made the breadcrumb redundant. With nothing above it to punctuate, a
5px six-colour strip directly beneath the subnav reads as a stray green bar.
Family B pages that keep a page header keep the hairband.

**Figures in Fraunces headings.** Fraunces ships no tabular set and CSS cannot
route digits to another family without a `unicode-range` `@font-face`, which
needs a font URL we don't control (fonts arrive via the Google Fonts CSS
import). Body, tables, definition lists and all `.stat-value`/`.load-count`
selectors are pinned to Commissioner. A prose *heading* containing a version
number is the one place a Fraunces numeral still renders.

**Committed artwork.** The D2 diagram sources in `src/diagrams/` were re-cut to
the palette and re-rendered via `scripts/render-diagrams.sh` (d2 CLI required);
their background is now `soil-50` rather than d2's theme white. The five VGI
function-shape SVGs under `public/vgi/docs/assets/kinds/` were re-hued to match
`starlight-kinds.css` — **those two must move together**; see the note at the
top of that stylesheet.

**Starlight theme default.** Starlight follows the OS preference by default,
which meant a dark-OS visitor watched the site change colour walking from a
light marketing page into the docs. `ThemeProvider.astro` now seeds `light` for
first-time visitors only; light/dark/auto all remain selectable and an explicit
choice is never overwritten.

**Buttons.** `Button.astro` is the single source of truth. The global `.btn-*`
utilities are gone — they were leaking `hover:bg-soil-900` onto the homepage
CTAs and double-applying padding against `size="sm"`.

**`check-examples.py` isolation.** A full sweep now runs each extension in a
child process. `bitfilters` and `radio` segfault DuckDB's native layer — in a
single process that killed the entire run with exit 139 and **no output**, so
one broken extension hid the state of all the others. Crashes are now reported
per-extension and the sweep completes. Use `--no-isolate` for the old
behaviour. These are pre-existing C++ crashes, unrelated to the redesign.

**Topic contours on /blog (a Family E amendment).** Family E's "card strips
only" now covers a second device: a bundle of generated contour lines, drawn
per topic. `src/lib/blog-curves.ts` sums two sines at incommensurate
frequencies, samples them, and converts through Catmull-Rom to cubic béziers,
so paths are real `C` segments and C1-continuous. The seed is the post's
primary tag via FNV-1a, so a topic draws the identical figure on every surface
— the same "same topic, same colour" contract `blog-topics.ts` already sets,
extended from hue to form. Colours still come from `topicBands`.

This exists to answer the thumbnail question. Every peer blog (MotherDuck,
ClickHouse, DuckDB, Fly.io, Tinybird) leads each entry with an image, and
nearly all of those images are brand-templated plates that carry no
information at thumbnail size while taxing every future post. A generated mark
gives the index the same scanability at zero authoring cost, and it stays
honest: it encodes a category rather than depicting the post.

**`amplitude` is a required knob, not a constant.** Lines may converge but must
never cross — crossing contours read as a mistake — so swing is capped as a
fraction of the gap between neighbours. The usable value depends entirely on
the surface's aspect ratio: the first version put 7 lines in a 76px band, and
the non-crossing cap held amplitude so low the bundle rendered as a stack of
straight wires. A long shallow band needs ~3 lines at `amplitude={1}` before it
reads as curved at all. Tune it per surface and look at it.

**The /blog lead is a card, and the archive is a list.** The old lead was
unbounded prose on the page ground with a 12.5px CTA — less clickable than the
three bordered cards ranked beneath it. Both surfaces now use one stretched
link (`after:absolute after:inset-0`) rather than a nested control, so each
entry is one target with one tab stop.

---

## 11. Reference implementation

The prototype stylesheet `qf.css` is the source of truth for component shapes: `.btn`,
`.card`, `.panel-head`, `.code`, `.copyline`, `table.qf`, `.badge`, `.pagehead`,
`.docs-grid`, `.callout`, `.sig`, `.field`, `.hairband`. Port these into Tailwind utilities
and Astro components rather than shipping a second parallel stylesheet.
