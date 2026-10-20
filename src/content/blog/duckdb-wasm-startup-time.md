---
title: "DuckDB-Wasm startup: from 6.8 to 2.3 seconds with Haybarn-Wasm"
description: "Haybarn-Wasm, a drop-in fork of DuckDB-Wasm, loads five extensions in 1.9 seconds, against 5.4 for upstream. Here's where the startup time went and how we cut it."
pubDate: 2026-10-19
author: "Rusty Conover"
tags: ["DuckDB", "DuckDB-Wasm", "WebAssembly", "Haybarn", "Performance", "Extensions"]
draft: false
heroImage: "/media/posts/duckdb-wasm-startup-time/social.png"
heroImageAlt: "DuckDB-Wasm startup: from 6.8 to 2.3 seconds with Haybarn-Wasm."
---

[Cupola](/products/cupola/), our browser-based environment for querying and exploring data, runs on [Haybarn-Wasm](https://github.com/Query-farm-haybarn/haybarn-wasm), and its users were waiting several seconds before they could do anything. I was waiting too. I use Safari with the multithreaded build enabled, and every page load meant watching the engine download and compile, then load each extension, one at a time.

The multithreaded build should be the better choice, since queries can use every core. On our test machine it was the slower one to start. Haybarn-Wasm 1.5.6-rc2 took 6.8 seconds to get a page to six loaded extensions ([icu](https://duckdb.org/docs/stable/core_extensions/icu), [autocomplete](https://duckdb.org/docs/stable/core_extensions/autocomplete), [spatial](https://duckdb.org/docs/stable/core_extensions/spatial/overview), [iceberg](https://duckdb.org/docs/stable/core_extensions/iceberg/overview), [grainlift](/products/grainlift/) and [ducklake](https://duckdb.org/docs/stable/core_extensions/ducklake)), and the single-threaded build took 5.4.

With 1.5.6-rc6, it's 2.3 seconds threaded and 2.0 single-threaded. This post covers where the time went, what we changed, and the one call you need to add to your code to get all of the benefits.

## Switching from DuckDB-Wasm

Haybarn-Wasm is Query.Farm's fork of [DuckDB-Wasm](https://github.com/duckdb/duckdb-wasm), built on [Haybarn](/products/haybarn/), our [DuckDB](https://duckdb.org/) distribution. The JavaScript API is the same, so if your app uses `@duckdb/duckdb-wasm`, switching is a package swap:

```sh
npm install @haybarn/haybarn-wasm
```

```ts
// before
import * as duckdb from '@duckdb/duckdb-wasm';
// after
import * as duckdb from '@haybarn/haybarn-wasm';
```

`AsyncDuckDB`, `selectBundle`, `ConsoleLogger` and the rest keep their names. The only addition is a call to `prefetchExtensions()` during setup, covered below.

I compared the two on one machine, loading the five extensions both projects publish for WebAssembly (icu, autocomplete, spatial, iceberg and ducklake), each from its own project's extension repository:

<!-- bars: row -->

| From page start | DuckDB-Wasm 1.33.1-dev57.0 | Haybarn-Wasm 1.5.6-rc6 | Haybarn-Wasm with prefetch |
|---|---:|---:|---:|
| Single-threaded build, first query result | 1.3 s | 0.7 s | 0.7 s |
| Single-threaded build, five extensions loaded | 5.4 s | 3.3 s | **1.9 s** |
| Multithreaded build, five extensions loaded | extensions don't load[\*](#extensions-on-duckdb-wasms-multithreaded-build) | 3.7 s | **2.2 s** |

A few practical details about switching, like where to load the files from, are in [notes on switching](#notes-on-switching) at the end.

## Where the time went

If you already use Haybarn-Wasm, upgrading gets you the middle column, and adding the prefetch call gets you the last:

<!-- bars: row -->

| From page start | Baseline (1.5.6-rc2) | 1.5.6-rc6 | 1.5.6-rc6 with prefetch |
|---|---:|---:|---:|
| **Threaded build**, first query result | 1.8 s | 1.0 s | 1.0 s |
| **Threaded build**, six extensions loaded | 6.8 s | 3.4 s | **2.3 s** |
| Single-threaded build, first query result | 1.1 s | 0.7 s | 0.7 s |
| Single-threaded build, six extensions loaded | 5.4 s | 3.0 s | **2.0 s** |

These are medians of five fresh browsers on an [AWS Graviton2](https://aws.amazon.com/ec2/graviton/) machine, with extensions from our real CDN. Graviton2 runs this workload about three times slower than an Apple M3, so a laptop is faster across the board. Details are at the end.

I expected the time to be in DuckDB, or in our own worker code. A large share of it was in [emscripten](https://emscripten.org/), the toolchain that compiles DuckDB's C++ to WebAssembly and supplies the runtime code that [links extensions in](https://emscripten.org/docs/compiling/Dynamic-Linking.html). That was the biggest surprise of this work.

### emscripten's linking setup ran in every thread

An extension is compiled separately from the engine. When it calls into DuckDB, to register a function or read a column, it refers to that code by its symbol: the name a compiled function or variable is known by. The linker matches those names to addresses when the extension loads.

The engine exports about 48,000 C++ symbols for extensions to use. emscripten's startup code walked all of them before the first query could run, in the main worker and again in every [pthread worker](https://emscripten.org/docs/porting/pthreads.html), so each extra thread made startup longer. It now looks up a symbol the first time something asks for it. On the threaded build, that cut the time to the first query result by 43%.

emscripten had two smaller costs that applied to every extension. To find out whether each symbol an extension exports could be written to, it threw and caught an exception; spatial exports 1,286 symbols. It now reads the answer from the module. It also kept each extension's file in memory after linking it, 26 MB for spatial, and it now lets that go.

### Restarting threads between extensions cost 460 ms

A `LOAD` on the threaded build runs with one thread, because a blocking download while other threads run can deadlock. After each `LOAD` the thread count went back up, and every new thread had to load all the extensions loaded so far before the next `LOAD` could start. Across six extensions that added about 460 ms. Consecutive `LOAD`s now stay on one thread, and the threads come back before your next query.

The extension loader also copied every file into [shared memory](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) one byte at a time before linking it. It now passes the downloaded bytes to the linker directly.

These changes make up the middle column: about three seconds on both builds. What remained was the extensions waiting in line.

### Six `LOAD`s in a row took 2.2 seconds

`LOAD` runs inside a SQL statement, and SQL in DuckDB-Wasm runs synchronously in the worker. Each `LOAD` downloads its extension with a blocking request, hashes the file, checks the signature, compiles the module, and only then lets the next one start. While the engine hashes and compiles, the network sits idle.

I hadn't expected the hashing to matter. The signature check needs a SHA-256 of the whole file, and the engine computes it with its own SHA-256 code, compiled to WebAssembly. The files are larger than their downloads, because they arrive compressed: spatial is 4.8 MB over the network and 26 MB to hash. The browser's [WebCrypto SHA-256](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) is native code and more than six times faster on the same bytes. For the eight files in our list, the engine spends 400 ms hashing, one file at a time:

<figure>
  <img src="/blog/duckdb-wasm-startup-time/hash-cost.svg" alt="Median SHA-256 time per extension file on the single-threaded build. icu (6.8 MB): 46 ms in the engine, 7 ms with WebCrypto; autocomplete (3.7 MB): 26 ms in the engine, 4 ms with WebCrypto; spatial (25.8 MB): 176 ms in the engine, 28 ms with WebCrypto; iceberg (8.5 MB): 58 ms in the engine, 9 ms with WebCrypto; avro (0.6 MB): 4 ms in the engine, under 1 ms with WebCrypto; parquet (4.4 MB): 30 ms in the engine, 5 ms with WebCrypto; grainlift (5.3 MB): 36 ms in the engine, 6 ms with WebCrypto; ducklake (3.7 MB): 25 ms in the engine, 4 ms with WebCrypto. All eight files: 400 ms in the engine against 62 ms with WebCrypto." width="760" height="534" loading="lazy" />
  <figcaption>Single-threaded build, median of five runs, on the files as the engine receives them, after decompression. The threaded build is the same story: 426 ms in the engine against 62 ms with WebCrypto.</figcaption>
</figure>

A synchronous SQL statement can't wait on WebCrypto, or on several downloads at once, so that work has to happen before the `LOAD`s. That's what `prefetchExtensions()` in rc6 does:

```js
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
await db.open({});

// While setting up the session, before running any queries:
// iceberg loads avro and parquet itself, so prefetch those too.
await db.prefetchExtensions(['icu', 'autocomplete', 'spatial', 'iceberg', 'avro', 'parquet', 'grainlift', 'ducklake']);

const conn = await db.connect();
await conn.query('LOAD spatial'); // much quicker now
```

The worker downloads every extension in parallel, hashes each one with WebCrypto, and [compiles it while it downloads](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/compileStreaming_static). When `LOAD spatial` runs, the file is already there. The engine checks the signature against that hash and links the module compiled from the same bytes. Here's the six-extension load on rc6, with and without prefetch, drawn to scale:

<figure>
  <img src="/blog/duckdb-wasm-startup-time/timeline-eh-cdn.svg" alt="Drawn to scale from median timings. Without prefetch, the six LOAD statements take 2,188 ms one after another. With prefetch, downloading, hashing and compiling all six, plus the avro and parquet extensions iceberg loads, in parallel takes 540 ms and the six LOADs then take 758 ms, 1,298 ms in total." width="760" height="262" loading="lazy" />
  <figcaption>Single-threaded build, extensions from the real CDN, median of five runs. The segments are the extensions in load order: icu, autocomplete, spatial, iceberg, grainlift, ducklake.</figcaption>
</figure>

The signature check itself hasn't moved. The public key and the RSA verification stay in the engine, and a module reaches the linker only after its bytes pass. I tested it with an extension that had one byte flipped, and it was rejected with and without prefetch, on both builds.

### iceberg loads avro and parquet

My first prefetch measurements had one outlier. Most `LOAD`s dropped to a quarter or a third of their time, but iceberg only went from 550 ms to 379. `LOAD iceberg` also loads [avro](https://duckdb.org/docs/stable/core_extensions/avro) and [parquet](https://duckdb.org/docs/stable/data/parquet/overview), and since those weren't in the prefetch list, iceberg downloaded both itself, one after the other. With them in the list, `LOAD iceberg` takes 197 ms:

<!-- bars: table -->

| Extension | Download | Single-threaded | with prefetch | Multithreaded | with prefetch |
|---|---:|---:|---:|---:|---:|
| icu | 1.4 MB | 306 ms | 91 ms | 315 ms | 73 ms |
| autocomplete | 0.3 MB | 148 ms | 40 ms | 152 ms | 38 ms |
| spatial | 4.8 MB | 820 ms | 336 ms | 863 ms | 335 ms |
| iceberg, with avro and parquet | 1.8 MB | 555 ms | 197 ms | 585 ms | 191 ms |
| grainlift | 0.9 MB | 172 ms | 46 ms | 192 ms | 43 ms |
| ducklake | 0.5 MB | 186 ms | 47 ms | 209 ms | 46 ms |
| `prefetchExtensions()`, all eight files at once | | | 540 ms | | 545 ms |
| **Total** | | **2,188 ms** | **1,298 ms** | **2,316 ms** | **1,271 ms** |

Each figure is the median of five runs over the real CDN, and the totals add up the medians. The download sizes are the compressed single-threaded files. What's left in each `LOAD` is linking the module and running the extension's own setup code, which can't happen ahead of time. That's why spatial still takes a few hundred milliseconds.

Things to know when you add it:

- Call it once, while you set up the session. Requests sent during a prefetch wait for it to finish, so it isn't meant for mid-session use.
- Run any `INSTALL … FROM community`, and set `custom_extension_repository`, before you prefetch. Those decide where an extension comes from, and a file prefetched from the wrong place is never used.
- Include the extensions your extensions load. If you leave out avro and parquet, `LOAD iceberg` downloads them the slow way.
- If a download fails or takes longer than 30 seconds, `LOAD` downloads the extension itself, as it always has.
- Extensions that are already loaded are skipped, and each prefetched file serves one `LOAD`.
- In Node.js it does nothing, since `LOAD` already reads from a disk cache there.

[Cupola](https://cupola.query-farm.services/) uses it now, so you can open it and watch the startup yourself. When Cupola loaded nine extensions, moving from rc5 to rc6 with prefetch took it from 4.7 to 3.7 seconds until it was ready to use. It has since added avro and parquet to its startup list, and they're prefetched with the rest.

## Memory went down

I expected prefetch to cost memory, since it holds each downloaded file until its `LOAD` takes it. That matters in a browser: a tab that runs out of memory gets killed, and phones hit that limit early. Memory went down instead:

| Threaded build, measured in Chrome | Baseline (1.5.6-rc2) | 1.5.6-rc6 |
|---|---:|---:|
| After startup | 306 MB | 251 MB |
| After loading the six extensions | 604 MB | **499 MB** |

WebAssembly memory can grow but never shrink, so anything copied into it stays for the life of the page. The old loader copied each extension file into that memory before linking it. Without those copies, the threaded build uses 105 MB less with six extensions loaded. About half of that saving exists before any extension loads, because the engine now starts 55 MB smaller.

Prefetch doesn't change where you end up. Right after prefetching all eight files, the threaded build was at 312 MB, and with everything loaded it reached the same 499 MB with or without prefetch.

Chrome's memory measurement can't see the single-threaded build's WebAssembly memory, so I measured that engine in Node.js. Loading five extensions grew the process by 206 MB, down from 343 MB.

One more emscripten fix, [still in review](https://github.com/emscripten-core/emscripten/pull/28007), frees the copy of each extension that every thread keeps. In earlier tests it saved another 90 MB with these six extensions loaded.

## Repeat visits

Chrome can keep compiled WebAssembly between visits, so a returning user shouldn't have to compile the engine again. It wasn't doing that for DuckDB-Wasm, because the code that reported download progress wrapped the response in a way that hid it from Chrome's cache. With that fixed, opening the database on a repeat visit takes 87 ms instead of about 230. Extensions compiled during a prefetch are cached too: on a repeat visit, the prefetch and six `LOAD`s take 1,009 ms instead of 1,362, and the page has all six loaded at 1.8 seconds instead of 2.2.

Two caveats. Current Chrome waits minutes before writing that cache, because of a V8 bug whose [fix](https://chromium.googlesource.com/v8/v8/+/cd68728aee4b) has landed and will ship in a coming release. And Safari doesn't keep compiled WebAssembly between visits at all, so in Safari, where I first noticed the wait, every visit is a first visit. That's why the first-visit work above mattered most to me.

## If you use DuckDB-Wasm from upstream

Most of these fixes aren't specific to Haybarn, and I've sent them upstream:

- emscripten: [lazy linking setup](https://github.com/emscripten-core/emscripten/pull/27993), [fewer export copies](https://github.com/emscripten-core/emscripten/pull/27996), [freeing an extension's bytes after load](https://github.com/emscripten-core/emscripten/pull/28002) and [on every thread](https://github.com/emscripten-core/emscripten/pull/28007), and [reading global mutability instead of probing it](https://github.com/emscripten-core/emscripten/pull/28006).
- duckdb-wasm: [letting Chrome cache the compiled engine](https://github.com/duckdb/duckdb-wasm/pull/2278), [keeping the threaded build's memory views current](https://github.com/duckdb/duckdb-wasm/pull/2276), and [not caching a failed extension download in Node.js](https://github.com/duckdb/duckdb-wasm/pull/2279).

They're open for review. Until they land, Haybarn-Wasm carries them as patches. `prefetchExtensions()` depends on how Haybarn checks extension signatures, so for now it's only in Haybarn-Wasm.

## How we measured

- **Machine:** AWS `c6g.12xlarge` (Graviton2), the browser pinned to 16 cores, headless Chromium 156 driven by [Playwright](https://playwright.dev/). Every run used a fresh browser and profile, and the builds were interleaved so drift affected them all alike.
- **DuckDB-Wasm comparison:** the published `@duckdb/duckdb-wasm` 1.33.1-dev57.0 package (npm `latest`), with extensions from `extensions.duckdb.org`, against Haybarn-Wasm 1.5.6-rc6 with extensions from `haybarn-extensions.query.farm`. Five interleaved runs each, same page and machine. grainlift was left out because DuckDB's repository doesn't publish it for WebAssembly.
- **Builds:** the published `@haybarn/haybarn-wasm` 1.5.6-rc2 package, and a local build of the rc6 code, made with the same toolchain before its package was published.
- **Workload:** instantiate, open, `SELECT 1`, then `LOAD` icu, autocomplete, spatial, iceberg, grainlift and ducklake from `haybarn-extensions.query.farm`, then a multithreaded query. With prefetch, the list was those six plus avro and parquet. Five runs of each build; the tables show medians. "Six extensions loaded" is measured from the page starting, and includes the prefetch where there is one.
- **Hashing:** each rc6 extension file from the CDN, hashed in the same worker by the engine's `sha256()` SQL function (the same SHA-256 code the signature check uses, minus the time to read the value) and by `crypto.subtle.digest` in 1 MB chunks, the way the prefetch does it. Five runs of each build in fresh browsers; the chart shows medians.
- **Memory:** [`performance.measureUserAgentSpecificMemory()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory) in the same Chromium, threaded build, extensions served from a local mirror. One reading per page, after startup, after the prefetch, or after the six `LOAD`s, with five runs for each, except three after startup. The readings were identical across runs, since WebAssembly memory grows in fixed steps. The single-threaded figures come from Node.js, measuring how much the process grew across the `LOAD`s.
- **Repeat visits:** Chrome was told to write its WebAssembly code cache immediately (`--js-flags=--wasm-caching-timeout-ms=0`), which is how it will behave once the V8 fix ships. Each run was a first visit and then a repeat visit with the same profile, four runs of the single-threaded build with the eight-file prefetch.
- **Cupola:** headless Chromium on an Apple Silicon laptop against the development server, four runs each, Haybarn-Wasm rc5 against rc6 with prefetch, while Cupola loaded nine extensions.

## Notes on switching

### Extensions on DuckDB-Wasm's multithreaded build

None of the extensions loaded on DuckDB-Wasm's multithreaded build. By default `LOAD` never returned, and with the thread count set to one first, it failed with a `LinkError`. Those extension binaries are built without shared memory, which the threaded engine needs. Haybarn builds its threaded extensions with shared memory and drops to one thread around each `LOAD` for you.

### Other details

- The package is larger than [jsDelivr](https://www.jsdelivr.com/) allows, so `getJsDelivrBundles()` won't find it. Serve the files yourself, or load them from [unpkg](https://unpkg.com/).
- Extensions come from Haybarn's repository at `haybarn-extensions.query.farm`, signed with Haybarn's key. It has its own builds of DuckDB's core and community extensions, including some that aren't published for WebAssembly upstream, such as grainlift. `INSTALL … FROM community` works as before.
- The multithreaded build still needs a [cross-origin isolated](https://web.dev/articles/coop-coep) page (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`), as with DuckDB-Wasm.
- Haybarn-Wasm 1.5.6-rc6 runs engine 1.5.6; DuckDB-Wasm 1.33.1-dev57.0 runs DuckDB 1.5.4. Haybarn-Wasm releases are currently release candidates.
