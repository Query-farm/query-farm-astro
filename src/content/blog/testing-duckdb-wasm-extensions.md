---
title: "Compiling Isn't Running: Functionally Testing DuckDB-WASM Extensions"
description: "A DuckDB extension that compiles for WebAssembly has only proven that it compiles. Whether it loads, and whether it actually runs, are separate questions. I built a Node harness to ask them across 124 community extensions. Here's what it found and the fixes that came out of it."
pubDate: 2026-06-14
author: 'Query.Farm Team'
tags: ["WebAssembly", "Testing", "Extensions"]
heroImage: '/media/posts/testing-duckdb-wasm-extensions/social.jpg'
---

When the [WebAssembly](https://webassembly.org/) build of a [DuckDB](https://duckdb.org/) extension passes CI, it's tempting to read that as "the extension works." It doesn't mean that. It means the code compiled: [`emcc`](https://emscripten.org/) accepted the source, produced a `.duckdb_extension.wasm`, and the file got uploaded to the catalog. Whether that file loads into a running engine, and whether it does anything useful once loaded, are questions the build never asks.

For the WASM extensions in [Haybarn](https://github.com/Query-farm-haybarn), [Query.Farm](https://query.farm)'s DuckDB distribution, nobody was asking them either. So I went looking, and the first extension I checked had been broken for weeks while its badge stayed green.

So I built a harness to run all of them. Here's the short version of this whole post — every WASM-enabled community extension, run against the published engine and graded on its own test suite:

<figure role="img" aria-label="Stacked bar of 124 WASM community extensions: 58 pass, 43 fail, 1 crash, 9 skip, 5 no tests, 8 not deployed." style="margin:2rem 0">
  <div style="display:flex;width:100%;height:2.75rem;border-radius:6px;overflow:hidden;font-size:0.8rem;font-weight:700;color:#fff">
    <div style="flex:58;background:#16a34a;display:flex;align-items:center;justify-content:center" title="pass: 58">58</div>
    <div style="flex:43;background:#dc2626;display:flex;align-items:center;justify-content:center" title="fail: 43">43</div>
    <div style="flex:1;background:#7f1d1d" title="crash: 1"></div>
    <div style="flex:9;background:#9ca3af" title="skip: 9"></div>
    <div style="flex:5;background:#6b7280" title="no tests: 5"></div>
    <div style="flex:8;background:#4b5563" title="not deployed: 8"></div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:0.3rem 1.1rem;margin-top:0.8rem;font-size:0.8rem">
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#16a34a;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>pass&nbsp;·&nbsp;58</span>
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#dc2626;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>fail&nbsp;·&nbsp;43</span>
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#7f1d1d;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>crash&nbsp;·&nbsp;1</span>
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#9ca3af;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>skip&nbsp;·&nbsp;9</span>
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#6b7280;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>no&nbsp;tests&nbsp;·&nbsp;5</span>
    <span><span style="display:inline-block;width:0.7rem;height:0.7rem;background:#4b5563;border-radius:2px;margin-right:0.4rem;vertical-align:middle"></span>not&nbsp;deployed&nbsp;·&nbsp;8</span>
  </div>
  <figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">124 WASM-enabled community extensions, run on 13 June 2026. Green passed their own sqllogictest suites; red failed them (darkest red crashed the engine); gray never produced a verdict — no tests, unsupported test directives, or no artifact on the catalog. Of the 102 that actually ran tests, 58 passed.</figcaption>
</figure>

That gap matters for two kinds of people. If you publish a DuckDB extension, the WASM build is the one target you probably can't test by hand, and a green badge can hide a binary that throws the instant a browser user calls a function. If you build *on* DuckDB-WASM, an extension you rely on may be quietly missing in the browser while working everywhere else. Either way, the failure surfaces at your users instead of your CI, which is the worst place to find it.

<aside style="margin:2.5rem 0;padding:1rem 1.25rem;border-left:4px solid #16a34a;background:rgba(22,163,74,0.07);border-radius:0 6px 6px 0">
<p style="margin:0 0 0.5rem"><strong>Why Query Farm cares about WASM</strong></p>
<p style="margin:0">Running a full DuckDB engine in a browser tab — no server, no install — is one of the most useful things the project can do, and we've put real work into making it solid. Alongside the <a href="https://github.com/Query-farm-haybarn/haybarn-wasm">Haybarn WASM distribution</a>, we've worked on engine fixes like an interrupt API for long-running queries, a <code>LOAD</code> deadlock on cross-origin-isolated (threaded) builds, a rewritten HTTP layer, correct <code>TIMESTAMPTZ</code> handling over Arrow IPC, and the jump from emscripten 3.1 to 5.0. This extension testing is part of the same bet: if we're going to ship DuckDB to the browser, the extensions have to actually run there.</p>
</aside>

## The canary

The `jsonata` extension lets you run [JSONata](https://jsonata.org/) expressions over JSON inside SQL. Its WASM build compiled fine, shipped to the catalog, and installed without complaint:

```sql
INSTALL jsonata FROM community;  -- ok
LOAD jsonata;                    -- ok
SELECT jsonata('Account', '{"Account": 5}');
-- TypeError: n is not a function
```

`INSTALL` and `LOAD` both succeed. The first real function call throws an opaque `TypeError` from inside the worker. A test that stops at "does it load" passes this and ships it. But nobody installs an extension just to load it; they call its functions, which is where this one fell over.

Native builds catch exactly this. `make test` links the extension into DuckDB's `unittest` binary and runs the extension's own `test/sql/*.test` [sqllogictest](https://duckdb.org/docs/stable/dev/sqllogictest/intro.html) files against it. The WASM build runs none of that, because there's no WASM `unittest` binary; the test runner is native C++. So WASM has no functional test layer at all.

## Why "it compiled" tells you so little in WASM

On native, a loadable DuckDB extension is a shared library the engine `dlopen`s. In WASM it's an emscripten [**side module**](https://emscripten.org/docs/compiling/Dynamic-Linking.html), linked with `-sSIDE_MODULE=2`, that the engine's dynamic linker loads at runtime and resolves against the main module. Anything it can't resolve doesn't fail the load; it becomes a stub that only blows up when something calls it.

That gap, between compiling and resolving, is where a clean compile can still hide a broken extension. It breaks four ways, and the census hit all of them: a dependency that never got linked into the `.wasm`, a file read that assumes a real filesystem, an HTTP call that assumes real sockets, or a hard dependency on another extension that has no WASM build. None of this shows up at compile time; you only see it when you run the extension.

## The plan: run their own tests, against the real engine, in Node

I didn't want to write new tests. Every extension already ships a `test/sql/*.test` suite, the same sqllogictest files the native build runs. Those assertions are a much better oracle than any smoke query I'd invent, so the harness runs them against the published WASM engine, the way a user would actually get the extension.

The harness, [`haybarn-extension-wasm-tester`](https://github.com/Query-farm-haybarn/haybarn-extension-wasm-tester) (now open source), does this per extension:

1. **Census.** Parse the [community catalog](https://duckdb.org/community_extensions/) descriptors, select the ones with WASM enabled.
2. **Fetch.** Shallow-clone each extension's repo at the exact ref the catalog shipped, and find its `test/sql/*.test` files.
3. **Run.** Spin up a fresh `@haybarn/haybarn-wasm` engine in **Node**, install and load the extension from the catalog the way a user would, and run the test file's records against it.
4. **Compare.** Match results and errors the way sqllogictest does.

Why Node instead of a browser? Node has a real filesystem, so the engine installs and caches extensions exactly the way the published packaging does, and it runs the same `wasm_eh` engine binary and the same extension binary a browser would pull.

## What it found

The failures fell into five groups. Each has a specific cause, and most of the fixes are a few lines. One thing to be clear about first: these are bugs in the extensions themselves — in their source, or their build configuration — not in the WASM engine. They reproduce on the [official duckdb-wasm build](https://duckdb.org/docs/stable/clients/wasm/overview.html) just the same. The harness is only the thing that finally ran them.

### 1. The missing library (`LINKED_LIBS`)

This is the `n is not a function` class, and it was the most common. The extension depends on a [vcpkg](https://vcpkg.io/) C++ library — `yaml-cpp`, `LibXml2`, `libxxhash`, a QuickJS runtime — and links it the normal way, with [`target_link_libraries`](https://cmake.org/cmake/help/latest/command/target_link_libraries.html):

```cmake
target_link_libraries(${LOADABLE_EXTENSION_NAME} yaml-cpp::yaml-cpp)
```

Correct for native. **Ignored** by the `-sSIDE_MODULE=2` link, which only honors libraries named in the extension descriptor's `LINKED_LIBS`. The dependency's symbols are left undefined in the `.wasm`. The module still loads, and then the first call into the missing code throws. The fix is to name the library where the WASM link will actually see it:

```cmake
duckdb_extension_load(yaml
    LINKED_LIBS "$<TARGET_FILE:yaml-cpp::yaml-cpp>"
)
```

That one move fixed `hashfuncs`, `marisa`, `textplot`, `json_schema`, `quickjs`, and `jsonata` itself.

### 2. Raw file I/O instead of DuckDB's filesystem

An extension that reads its input with `fopen` or `std::fstream` works everywhere except the one place that has no host filesystem. A Stata-file reader, a FIT-file reader, a couple of others all tripped on this. The fix is to read through [DuckDB's own filesystem abstraction](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/file_system.hpp):

```cpp
auto &fs = FileSystem::GetFileSystem(context);
auto handle = fs.OpenFile(path, FileFlags::FILE_FLAGS_READ);
// read via the handle instead of a FILE*
```

The bonus: for any path it opens through that abstraction, the extension also gets `s3://`, `https://`, and registered-buffer support on native builds. Raw `fopen` was leaving that on the table.

### 3. Raw HTTP instead of `HTTPUtil`

An extension that opens its own `httplib` client needs OS sockets, which WASM doesn't have. DuckDB ships an [HTTP abstraction (`HTTPUtil`)](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/http_util.hpp) that's already wired to the browser's HTTP stack under WASM and to the normal stack natively. Routing requests through it makes the extension work in WASM and inherit DuckDB's proxy and TLS settings on native. (Occasionally you find the opposite: one "HTTP stats" extension *already* subclassed `HTTPUtil` correctly, and its only failure was a test that hit a live network endpoint.)

### 4. A dependency that doesn't exist in WASM

The `delta_classic` extension delegates all its work to the core `delta` extension, and `delta` is a Rust extension ([`delta-kernel-rs`](https://github.com/delta-io/delta-kernel-rs)) that *no* DuckDB distribution builds for WASM, upstream included. The native builds are on the catalog, but `extensions.duckdb.org/<version>/wasm_eh/delta.duckdb_extension.wasm` 404s for every version I checked. No amount of fixing `delta_classic` helps; its dependency can't be there. The honest fix is to mark it WASM-excluded so users get a clear message instead of a baffling signature error.

### 5. Tests that were never WASM's fault

A few "failures" were the test files, not the engine — a suite asserting `True`/`False` where the engine renders `true`/`false`, a numeric test rounding to one more decimal place than the platform reproduces. Real signal, just pointed at the test rather than the binary. Fixing those (and teaching the comparator that `true` and `1` are the same boolean) cleared them.

## The scoreboard

Here's one full census run: Haybarn engine `v1.5.3`, `wasm_eh`, every WASM-enabled community extension, tested on June 13, 2026.

| Status | Count | Meaning |
| ------ | ----: | ------- |
| `pass` | **58** | every runnable record passed |
| `fail` | 43 | a record produced a wrong result or unexpected error |
| `skip` | 9 | every test file used directives the runner doesn't support |
| `no-tests` | 5 | the repo ships no `test/sql/*.test` files |
| `not-deployed` | 8 | declared WASM-enabled, but no artifact on the catalog |
| `crash` | 1 | the engine died loading it |
| **Total surveyed** | **124** | |

That run executed **11,219 sqllogictest records** across **1,088 test files**, with 873 record failures. If you drop the categories that aren't really a verdict on a shipped binary (`not-deployed`, `no-tests`, `skip`), **102 extensions actually ran records (pass, fail, or crash), and 58 of them pass — a 57% pass rate**. A failure here usually doesn't mean a broken extension so much as one that hasn't been adapted to WASM's constraints yet: no filesystem, no sockets, stricter linking.

The fixes aren't hypothetical. The 18 WASM extensions Query.Farm maintains all pass now — several of them used to load and then throw on the first call — and the harness will catch it if any regress. The same fixes apply to everyone else's extensions, which is why I sent them upstream.

I didn't root-cause all 43 failures, but for the third-party ones I could diagnose, I opened fifteen issues (all linked in the appendix below). Each names the file and symbol, explains the `LINKED_LIBS`, filesystem, or HTTP fix, and includes code to copy. They're written against DuckDB-WASM in general rather than Haybarn specifically, since the patterns apply to any distribution.

## What I'd tell anyone shipping WASM extensions

A passing compile only tells you the linker was happy. For WASM the gap between that and a working extension is wide, because most of the failures live in runtime symbol resolution and the absence of a filesystem or sockets. The only way to know is to load the artifact and call into it.

When you do, the fixes are usually small: a `LINKED_LIBS` entry, a `FileSystem::OpenFile` instead of `fopen`, an `HTTPUtil` call instead of raw sockets. The hard part was never the fix. It's seeing the failure at all, which a green compile badge will happily hide.

There's nothing Haybarn-specific about the check itself — it runs any extension's own test suite against any duckdb-wasm engine, so it would fit just as well in the community-extensions release pipeline upstream. Once it's had proper review, I'd like to see DuckDB run something like it before publishing WASM artifacts. A compile that never executed isn't much of a guarantee, and this is a cheap way to turn it into one.

The harness is [on GitHub](https://github.com/Query-farm-haybarn/haybarn-extension-wasm-tester), MIT-licensed. It's standalone on purpose, not wired into any build pipeline, so I can point it at the catalog by hand whenever I want a real answer instead of a compile:

```bash
# one extension, or drop --only to run the whole catalog
node bin/test.mjs --community-dir ../haybarn-community-extensions --only jsonata
```

## Appendix: full results

Engine `v1.5.3`, `wasm_eh`, tested **June 13, 2026**. This is a snapshot; some of the failing extensions below have fixes filed or already deployed since.

Each extension links to its source repository.

### Pass (58)

- [`a5`](https://github.com/query-farm/a5)
- [`astro`](https://github.com/synapticore-io/astro-duck)
- [`bitfilters`](https://github.com/query-farm/bitfilters)
- [`boilstream`](https://github.com/dforsber/boilstream-extension)
- [`bvh2sql`](https://github.com/nkwork9999/bvh2sql)
- [`capi_quack`](https://github.com/duckdb/extension-template-c)
- [`celestial`](https://github.com/lisa-sgs/duckdb-celestial)
- [`chaos`](https://github.com/taniabogatsch/duckdb-chaos)
- [`cloudfront`](https://github.com/midwork-finds-jobs/duckdb-cloudfront)
- [`datasketches`](https://github.com/query-farm/datasketches)
- [`decimal_arithmetic`](https://github.com/duckdb/duckdb-decimal-arithmetic)
- [`dqtest`](https://github.com/vhe74/duckdb-dataquality-extension)
- [`duck_block_utils`](https://github.com/teaguesterling/duckdb_duck_block_utils)
- [`duck_delta_share`](https://github.com/cwiq-os/duck_delta_share)
- [`duck_geoarrow`](https://github.com/am2222/duck_geoarrow)
- [`duckdb_delta_sharing`](https://github.com/prequel-co/DuckDB-Delta-Sharing)
- [`duckhts`](https://github.com/RGenomicsETL/duckhts)
- [`ducksync`](https://github.com/danjsiegel/ducksync)
- [`eenddb`](https://github.com/Dtenwolde/dutchdb)
- [`evalexpr_rhai`](https://github.com/query-farm/evalexpr_rhai)
- [`fivetran`](https://github.com/fivetran/duckdb_sparse_variant)
- [`func_apply`](https://github.com/teaguesterling/duckdb_func_apply)
- [`geosilo`](https://github.com/Query-farm/geosilo)
- [`gh`](https://github.com/carlopi/duckdb-gh)
- [`h3`](https://github.com/isaacbrodsky/h3-duckdb)
- [`hashfuncs`](https://github.com/query-farm/hashfuncs)
- [`inflector`](https://github.com/query-farm/inflector)
- [`json_schema`](https://github.com/query-farm/json_schema)
- [`jsonata`](https://github.com/query-farm/jsonata)
- [`lastra`](https://github.com/QTSurfer/duckdb-lastra)
- [`lindel`](https://github.com/query-farm/lindel)
- [`marisa`](https://github.com/query-farm/marisa)
- [`minijinja`](https://github.com/query-farm/minijinja)
- [`miniplot`](https://github.com/nkwork9999/miniplot)
- [`nanoarrow`](https://github.com/paleolimbot/duckdb-nanoarrow)
- [`oast`](https://github.com/hrbrmstr/duckdb-oast)
- [`open_prompt`](https://github.com/quackscience/duckdb-extension-openprompt)
- [`overture`](https://github.com/cubilica/duckdb-overture)
- [`parser_tools`](https://github.com/hotdata-dev/duckdb_extension_parser_tools)
- [`pbix`](https://github.com/Hugoberry/duckdb-pbix-extension)
- [`pfc`](https://github.com/ImpossibleForge/pfc-duckdb)
- [`poached`](https://github.com/sidequery/poached)
- [`polyglot`](https://github.com/tobilg/duckdb-polyglot)
- [`psyduck`](https://github.com/Ian-Fogelman/psyduck)
- [`quickjs`](https://github.com/query-farm/quickjs)
- [`rapidfuzz`](https://github.com/query-farm/rapidfuzz)
- [`read_dbf`](https://github.com/tocharan/duckdb-dbf)
- [`read_lines`](https://github.com/teaguesterling/duckdb_read_lines)
- [`se3`](https://github.com/jokasimr/se3)
- [`snowflake`](https://github.com/iqea-ai/duckdb-snowflake)
- [`stochastic`](https://github.com/query-farm/stochastic)
- [`tera`](https://github.com/query-farm/tera)
- [`textplot`](https://github.com/query-farm/textplot)
- [`tsid`](https://github.com/quackscience/duckdb-extension-tsid)
- [`vgi`](https://github.com/query-farm/vgi)
- [`waddle`](https://github.com/duckdb/extension-template)
- [`wireduck`](https://github.com/hyehudai/wireduck)
- [`zeek`](https://github.com/ynadji/zeek-duckdb)

### Fail (43)

These didn't pass on the test date. In most cases that's a small, WASM-specific gap rather than a broken extension; where I diagnosed one, the specific fix is in the issues filed below.

- [`anndata`](https://github.com/honicky/anndata-duckdb-extension)
- [`anofox_forecast`](https://github.com/DataZooDE/anofox-forecast)
- [`anofox_statistics`](https://github.com/DataZooDE/anofox-statistics)
- [`clamp`](https://github.com/oglego/duckdb_clamp)
- [`cronjob`](https://github.com/quackscience/duckdb-extension-cronjob)
- [`dash`](https://github.com/gropaul/dash)
- [`delta_classic`](https://github.com/djouallah/delta_classic)
- [`dplyr`](https://github.com/mrchypark/libdplyr)
- [`dta`](https://github.com/codedthinking/duckdb-dta)
- [`duck_dggs`](https://github.com/am2222/duckdb-dggs)
- [`duck_hunt`](https://github.com/teaguesterling/duck_hunt)
- [`duckdb_mcp`](https://github.com/teaguesterling/duckdb_mcp)
- [`duckdb_zarr`](https://github.com/wayscience/duckdb_zarr)
- [`ducksmiles`](https://github.com/nkwork9999/duckSMILES)
- [`eeagrid`](https://github.com/ahuarte47/duckdb-eeagrid)
- [`eurostat`](https://github.com/ahuarte47/duckdb-eurostat)
- [`fire_duck_ext`](https://github.com/BorisBesky/fire_duck_ext)
- [`fit`](https://github.com/antoriche/duckdb-fit-extension)
- [`hnsw_acorn`](https://github.com/cigrainger/duckdb-hnsw-acorn)
- [`hostfs`](https://github.com/gropaul/hostFS)
- [`http_stats`](https://github.com/tlinhart/duckdb-http-stats)
- [`ion`](https://github.com/kestra-io/duckdb-ion)
- [`lpts`](https://github.com/cwida/lpts)
- [`lua`](https://github.com/isaacbrodsky/duckdb-lua)
- [`magic`](https://github.com/carlopi/duckdb-magic)
- [`markdown`](https://github.com/teaguesterling/duckdb_markdown)
- [`osmium`](https://github.com/jake-low/duckdb-osmium)
- [`otlp`](https://github.com/smithclay/duckdb-otlp)
- [`pac`](https://github.com/cwida/pac)
- [`prql`](https://github.com/ywelsch/duckdb-prql)
- [`psql`](https://github.com/ywelsch/duckdb-psql)
- [`pst`](https://github.com/intellekthq/duckdb-pst)
- [`quack_oauth`](https://github.com/DataZooDE/quack-oauth)
- [`rdf`](https://github.com/nonodename/duck_rdf)
- [`read_stat`](https://github.com/dylanmeysmans/duckdb-read-stat)
- [`scalarfs`](https://github.com/teaguesterling/duckdb_scalarfs)
- [`scrooge`](https://github.com/pdet/Scrooge-McDuck)
- [`sistat`](https://github.com/fklezin/duckdb-sistat)
- [`spxlsx`](https://github.com/paulmupeters/spxlsx)
- [`web_archive`](https://github.com/midwork-finds-jobs/duckdb-web-archive)
- [`webbed`](https://github.com/teaguesterling/duckdb_webbed)
- [`yaml`](https://github.com/teaguesterling/duckdb_yaml)
- [`zipfs`](https://github.com/isaacbrodsky/duckdb-zipfs)

**Crash (1):** `netquack`

**Skip — unsupported test directives, no functional verdict (9):** `arrow`, `cozip`, `delta_export`, `harbor`, `mpduck`, `nsv`, `pivot_table`, `sitemap`, `web_search`

**No tests in repo (5):** `duckdbi`, `duckgl`, `ducklake_cdc`, `duckorch`, `sheetreader`

**Declared WASM-enabled but not deployed to the catalog (8):** `elasticsearch`, `flock`, `gdx`, `miint`, `nats_js`, `sitting_duck`, `valhalla_routing`, `webmacro`

### Issues filed (15)

The issues I opened on third-party extensions, grouped by the fix each one recommends.

Read files through DuckDB's `FileSystem` instead of raw `fopen`/`fstream`:

- [`dta` — codedthinking/duckdb-dta#2](https://github.com/codedthinking/duckdb-dta/issues/2)
- [`fit` — antoriche/duckdb-fit-extension#1](https://github.com/antoriche/duckdb-fit-extension/issues/1)
- [`read_stat` — dylanmeysmans/duckdb-read-stat#11](https://github.com/dylanmeysmans/duckdb-read-stat/issues/11)
- [`osmium` — jake-low/duckdb-osmium#4](https://github.com/jake-low/duckdb-osmium/issues/4)

Name the dependency in `LINKED_LIBS` so the WASM link includes it:

- [`yaml` — teaguesterling/duckdb_yaml#40](https://github.com/teaguesterling/duckdb_yaml/issues/40)
- [`webbed` — teaguesterling/duckdb_webbed#96](https://github.com/teaguesterling/duckdb_webbed/issues/96)
- [`rdf` — nonodename/duck_rdf#39](https://github.com/nonodename/duck_rdf/issues/39)
- [`lua` — isaacbrodsky/duckdb-lua#25](https://github.com/isaacbrodsky/duckdb-lua/issues/25)

Make HTTP requests through DuckDB's `HTTPUtil` (or exclude WASM) instead of raw sockets:

- [`sistat` — fklezin/duckdb-sistat#7](https://github.com/fklezin/duckdb-sistat/issues/7)
- [`spxlsx` — paulmupeters/spxlsx#2](https://github.com/paulmupeters/spxlsx/issues/2)
- [`eurostat` — ahuarte47/duckdb-eurostat#4](https://github.com/ahuarte47/duckdb-eurostat/issues/4)

Exclude the WASM platforms, because the extension can't work there as built:

- [`fire_duck_ext` — BorisBesky/fire_duck_ext#5](https://github.com/BorisBesky/fire_duck_ext/issues/5) — Firestore over raw HTTP
- [`quack_oauth` — DataZooDE/quack-oauth#3](https://github.com/DataZooDE/quack-oauth/issues/3) — OAuth redirect flows
- [`anndata` — honicky/anndata-duckdb-extension#24](https://github.com/honicky/anndata-duckdb-extension/issues/24) — [HDF5](https://www.hdfgroup.org/solutions/hdf5/) file access
- [`delta_classic` — djouallah/delta_classic#1](https://github.com/djouallah/delta_classic/issues/1) — depends on `delta`, which has no WASM build
