QUERY.FARM EXTENSION QUICK REFERENCES
Edition: October 7, 2026

32 public Query.Farm extensions, arranged by extension slug.
The public filter in src/data/extensions.ts is authoritative. It excludes the
example template, TODO scaffolds, and the held-back chsql/quackscale entries.

BUILD
  npm run generate:quick-references
  npm run generate:quick-references -- --check
  npm run check:quick-reference-assets
  npm run check:quick-reference-layout

Equivalent direct commands and a single-guide preview:
  node quick-reference/build.mjs
  node quick-reference/build.mjs --check
  node quick-reference/build.mjs --check --only a5
  node quick-reference/build.mjs --check --extension-dir /path/to/built-extensions
  python3 quick-reference/check-layout.py

Requirements: Node.js, Typst (tested 0.15.1), Poppler (pdfinfo, pdffonts,
pdftotext, pdfunite), and zip. SQL checks also need DuckDB (tested 1.5.6)
with the relevant community extensions installed. Install with:
  INSTALL extension_name FROM community;
The build never installs extensions or accesses external example endpoints.
An optional --extension-dir contains <slug>.duckdb_extension files built for
the installed DuckDB version. Checks load those files with -unsigned; other
extensions use their installed packages. This does not replace the local
extension cache. validation.json records local-build provenance and SHA-256.
The six repaired guides in this edition target the v1.5 fixes in FINDINGS.txt;
their checks intentionally reject the older buggy community builds. Supply
the fixed artifacts until matching community packages are available. A render
without --check uses the saved validation versions and needs no extension files.
Examples execute in a separate temporary directory and database per extension.
External services, credentials, drivers and interactive lifecycle examples
are explicitly classified and not silently counted as executed.

OUTPUTS
  public/quick-reference/<slug>.pdf                 Individual guides
  public/quick-reference/index.pdf                  Directory with page numbers
  public/quick-reference/query-farm-extensions.pdf   Combined 34-page collection
  public/quick-reference/query-farm-quick-references.zip

All guides are one US Letter page except Stochastic, which is two pages.
The combined volume has one directory page followed by all 32 guides.
Its directory links to adjacent standalone files, available in the ZIP.

Open the whole collection on macOS:
  open -a Preview public/quick-reference/query-farm-extensions.pdf

DESIGN AND AUTHORING
  template.typ        Shared masthead, fonts, palette, code, tables, notes
  guide.typ           Two-column renderer for curated extension content
  content/*.json      Thirty authored guides, examples and result assertions
  lindel.typ          Bespoke curve/type reference
  stochastic.typ      Bespoke two-page distribution reference
  examples.json       Printed SQL shared by the two bespoke sheets and checks
  prototypes.mjs      Original sheets' checks and compilation
  edition.json        Edition date shared by all PDF footers and timestamps
  edition.mjs         Shared edition and tested-version label formatting
  runtime.mjs         Optional local extension artifacts and their provenance
  catalog.mjs         Public extension discovery; refuses unrecognized filters
  build.mjs           Validation, rendering, directory, combined PDF and ZIP
  index.typ           Collection directory
  validation.json     Execution/deferred-example report and tested build IDs
  artifacts.json      Source and PDF checksums recorded by the complete build
  artifacts.mjs       Checksum generation and consistency checks
  check-assets.mjs    Node-only check run before every website build
  directory.json      Generated file/page map
  FINDINGS.txt        Versioned extension issues with minimal reproductions
  check-layout.py     Page-count, margins, column, font, text and link checks
  assets/             Local vector marks and explanatory diagrams
  fonts/              JetBrains Mono with its SIL OFL 1.1 license

The title, subtitle, intro, three-stage workflow, reference entries, notes and
examples are hand-authored. Generated API inventories inform the content;
this is a curated quick reference, not an exhaustive API dump. Plain strings
in JSON remain literal text, so SQL and template syntax are not interpreted
as Typst markup. Notes are split across columns to balance the printed page.

Example modes:
  local     Executes in a fresh temp database, after optional setup/dependencies.
  external  Needs a service, file, driver or credentials described in the caption.
  manual    Needs interactive/process setup or a different documented API build.
Nonlocal examples must include a reason. Assertions may be one SQL string or
an array. An assertion should raise error(...) when its expected result fails.

All rendering uses local assets and no external Typst packages. PDF creation
time is pinned to the edition date in edition.json. Update that date when
publishing a revised edition. Recheck APIs when changing the release;
validation.json records the tested engine/extension versions and deferred work.
The --check workflow captures those versions from the installed extensions.
The scripts do not call external example APIs, send messages, or start servers.

Store quick-reference/ and public/quick-reference/ in version control together,
including fonts, SVGs, JSON content, manifests and rendered PDFs. The regular
Astro build uses existing PDF assets and does not need Typst or DuckDB. Its
prebuild step checks source/PDF fingerprints and public catalog coverage, so
missing or stale assets fail with a regeneration command. After a --only preview,
run the complete generation command to refresh the directory, bundles and hashes.

BRANDING
The site's Strata Sun mark, Petrona headings, Noto Sans body and JetBrains
Mono code follow public/media-kit/README.txt and DESIGN_BRIEF.md. Extension
marks reuse the existing Phosphor icons with matching paper/gold framing.
Original icons are MIT licensed; see assets/LICENSE.txt. The existing Petrona
and Noto Sans assets are in scripts/og-images/fonts/ with provenance there.

The Lindel diagram plots an 8 x 8 grid ordered by the actual encoding functions.
The probability diagram illustrates a standard normal density, split at x=0.8.
Other guides use compact workflow diagrams tied to the extension's purpose.

LAYOUT REFERENCES REVIEWED
GitHub Git Cheat Sheet — topic grouping, concise commands, typographic hierarchy:
https://training.github.com/downloads/github-git-cheat-sheet.pdf
Posit Data Transformation — compact functions and explanatory diagrams:
https://github.com/rstudio/cheatsheets/blob/main/data-transformation.pdf
No third-party prose or illustrations were copied into these PDFs.

CONTENT SOURCES AND VERIFIED LIMITS
Each guide links to its extension's actual GitHub source and Query.Farm docs.
Local sources: src/data/extensions/<slug>/{generated,augment}, cookbook.mdx,
technical-details.mdx; runtime catalogs and locally available extension source.
Five guides require source/manual review rather than runnable local examples:
ADBC Scanner's newer ATTACH API, Events, HTTP Server, Tributary and VGI.
Events, Tributary and VGI have no community package on the tested DuckDB 1.5.6
macOS arm64 host. Remote portions of other connector examples are also deferred.

The guides document the fixed v1.5 behavior and identify older build caveats:
- Lindel's exact input width limits, signed/float bit-pattern behavior, geographic
  offsets and quantization, and one-dimensional signed decoding limitation.
- Corrected Pareto labels and discrete uniform_int analytics in Stochastic.
- GeoSilo's merged spatial-extension overloads in either load order.
- JSON Schema validation errors and safe TRY handling.
- Fuzzycomplete's replacement of preloaded autocomplete on fixed builds.
- MiniJinja's row-dependent context API and Shellfs' explicit gzip compression.
- Canonical xxh3_128_hex output with legacy numeric hash values preserved.

The corresponding authored website documentation was corrected and validated.
FINDINGS.txt records the original reproductions, fixes, commits and validation.
Generated API data is never edited.

ADDING AN EXTENSION
1. Add content/<slug>.json matching the guide schema and the public catalog.
2. Reuse the website's extension icon in assets/<slug>.svg.
3. Add self-contained examples and meaningful result assertions.
4. Run --check --only <slug>, inspect the PDF, then build the full collection.
5. Run check-layout.py and visually inspect all modified pages.
The full build rejects missing public guides and unexpected page overflow.

Every extension documentation header links to its corresponding PDF, with a
page count and print label. Sources remain in quick-reference/ for maintainers;
rendered PDFs are served from public/quick-reference/ as static site assets.
