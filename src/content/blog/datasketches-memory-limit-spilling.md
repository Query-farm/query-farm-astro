---
title: "DataSketches for DuckDB 2.0: sketch aggregates now stay within the memory limit and spill to disk"
description: "A grouped KLL query used 39 GB under a 1 GB memory limit. Now it uses 0.77 GB and runs 3.7× faster. Here's how we moved 15 sketch families into DuckDB's spillable memory, and the library bugs we fixed along the way."
showDescription: false
pubDate: 2026-10-28
author: "Query Farm Team"
tags: ["DuckDB", "DataSketches", "Performance", "Memory", "Extensions"]
heroImage: "/media/posts/datasketches-memory-limit-spilling/social.png"
heroImageAlt: "DataSketches for DuckDB 2.0: a grouped KLL query went from 39 GB to 0.77 GB with a 1 GB memory limit, and ran 3.7 times faster."
draft: false
nextStep:
  title: "DataSketches"
  pitch: "Approximate distinct counts, quantiles, frequent items, sampling and membership tests as DuckDB aggregates, from Apache DataSketches."
  href: "/products/extensions/datasketches/"
  cta: "Explore DataSketches"
  extension: "datasketches"
  installNote: "Spilling and the new sketch families need DuckDB 2.0."
  repo: "https://github.com/Query-farm/datasketches"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Sketch aggregates in our <a href="/products/extensions/datasketches/">DataSketches extension</a> now stay within DuckDB's <code>memory_limit</code> and spill to disk when they need more.</li>
      <li>A grouped KLL query that used 39 GB under a 1 GB limit now uses 0.77 GB and runs 3.7× faster. Every sketch family uses 3.5× to 79× less memory.</li>
      <li>No SQL changes. Upgrade the extension and your existing queries benefit.</li>
    </ul>
  </div>
</aside>

The [DataSketches extension](/products/extensions/datasketches/) brings [Apache DataSketches](https://datasketches.apache.org/) to DuckDB as SQL aggregates: approximate distinct counts, quantiles, frequent items, sampling and membership tests, each in a small mergeable sketch per group. The DuckDB 2.0 release of the extension changes what you can expect from those queries:

- **They respect `memory_limit`.** Sketch memory is now DuckDB's memory. It counts toward the limit, and DuckDB spills it to disk instead of letting it grow until the machine runs out.
- **Grouped queries are faster.** With many groups and a 1 GB limit, sketch queries ran 1.3× (Density) to 4.7× (TDigest) faster, and four that never finished before now complete in under 20 seconds.
- **Five new sketch families:** Bloom filters, Count-Min, VarOpt and EBPPS weighted sampling, and Density, each with merge aggregates and scalar functions.
- **Scalar functions are faster on repeated sketches.** A function called on the same sketch row after row deserializes it once. Ranking a million values against one KLL sketch went from 6.6 seconds to under 0.1.
- **Count-Min sketches are portable.** A Count-Min sketch built on Linux used to give wrong estimates when read on macOS or Windows. It now gives the same answers everywhere.

## Before and after

This query builds 2 million KLL sketches from 20 million rows, with a 1 GB limit:

```sql
SET threads = 8;
SET memory_limit = '1GB';

SELECT count(s) FROM (
  SELECT i % 2000000 AS g, datasketch_kll(200, v) AS s
  FROM (SELECT i, ((i * 7919) % 1000003)::DOUBLE AS v FROM range(20000000) t(i))
  GROUP BY g
);
```

The previous release peaked at 39 GB. The TDigest version used 83 GB of the test machine's 92 GB. We ran the same query for each sketch family on a 48-core aarch64 machine:

<figure>
  <img src="/blog/datasketches-memory-limit-spilling/reduction.svg" alt="Two bar charts sharing one row per sketch family. Times less peak memory: TDigest 79×, Array of Doubles at least 55×, KLL 51×, Tuple 40×, Bloom filter at least 32×, REQ 27×, VarOpt and Count-Min at least 24×, Theta 23×, EBPPS 14×, Frequent items 8.4×, Quantiles 5.6×, CPC 4.7×, HLL 4.0×, Density 3.5×. Times faster: TDigest 4.7×, KLL 3.7×, Quantiles 2.4×, REQ and EBPPS 2.3×, Tuple 2.1×, Frequent items 1.5×, Theta, CPC and HLL 1.4×, Density 1.3×. Array of Doubles, Bloom filter, VarOpt and Count-Min didn't finish before and now take 6.9 to 18.3 seconds." width="760" height="498" loading="lazy" />
  <figcaption>The DuckDB 2.0 release against the previous one, on the query above. The table below has the raw numbers.</figcaption>
</figure>

Peak memory sits at or near the limit, a little above it for some families, because the limit governs DuckDB's buffer-managed memory, not every byte the process holds. Peak resident memory and wall time for each run:

| Sketch | Before | After |
|---|---|---|
| KLL | 39 GB, 22 s | 0.77 GB, 6.0 s |
| Quantiles | 4.3 GB, 17.1 s | 0.77 GB, 7.1 s |
| REQ | 29.3 GB, 21.4 s | 1.07 GB, 9.2 s |
| TDigest | 83 GB, 43 s | 1.05 GB, 9.2 s |
| HLL | 3.3 GB, 9.6 s | 0.82 GB, 6.9 s |
| CPC | 3.6 GB, 10.4 s | 0.77 GB, 7.7 s |
| Theta | 22.8 GB, 22.4 s | 1.01 GB, 16.0 s |
| Tuple | 43.4 GB, 33.9 s | 1.08 GB, 16.1 s |
| Array of Doubles | out of memory at a 60 GB cap | 1.09 GB, 18.3 s |
| Frequent items | 8.5 GB, 14 s | 1.01 GB, 9.6 s |
| VarOpt | over 24 GB (stopped) | 1.01 GB, 9 s |
| EBPPS | 13.9 GB, 21 s | 1.02 GB, 9 s |
| Bloom filter | over 24 GB (stopped) | 0.75 GB, 6.9 s |
| Count-Min | over 24 GB (stopped) | 1.02 GB, 9.5 s |
| Density | 3.9 GB, 10.1 s | 1.12 GB, 7.6 s |

We stopped some "before" runs early to protect the shared machine. Density reads its points from a table.

One limit remains: sketches whose items allocate memory of their own, such as KLL over `VARCHAR`, still keep their sketches on the heap. They work as before but don't spill.

## How the sketches moved into DuckDB's memory

<figure>
  <img src="/blog/datasketches-memory-limit-spilling/state-layout.svg" alt="Two panels. Previous release: DuckDB's aggregate memory, which counts toward memory_limit and can spill, holds states that are only pointers; each points to a full sketch of about 1.6 KB on the C++ heap, which DuckDB can't see or spill. DuckDB 2.0 release: the aggregate arena holds small states that buffer up to 32 values and states with full sketches, plus a scratch arena for temporaries; when memory runs short, buffers spill as raw values and sketches as serialized bytes." width="760" height="400" loading="lazy" />
  <figcaption>Where a sketch aggregate's memory lives, before and after.</figcaption>
</figure>

DuckDB 2.0 can spill an aggregate state only if the state lives in the aggregate's arena, the memory DuckDB counts toward `memory_limit`; has no destructor; and can export itself to a value and import itself back. Our states were pointers to sketches on the C++ heap, freed by a destructor, so DuckDB could neither see nor spill them.

DataSketches lets each sketch take a custom allocator. We gave ours an arena mode that allocates from the running aggregate's arena, so each state now holds its sketch, and everything the sketch allocates, in DuckDB's memory, and exports as the sketch's serialized bytes. Two details mattered. When DuckDB combines states from different threads, the source may sit in another thread's arena that's still in use, so a combine copies it rather than taking it over. And temporaries, such as an input sketch being merged, go to a short-lived scratch arena so they don't accumulate in the state's arena.

The bigger memory cost came from DuckDB itself. When a hash table isn't reducing its input much, as with 2 million groups over 8 threads, DuckDB gives each row its own state and merges them later. A new KLL sketch reserves room for all 200 items up front, about 1.6 KB per row before any values arrive. States now start small: KLL buffers its first 32 values and builds a sketch only when more arrive, feeding them in their original order so the result is identical. HLL buffers 7 distinct values, CPC 16, and Theta, Bloom, Count-Min, VarOpt and EBPPS 32 inputs. A buffered state that spills is written as its raw values, not as a full-size sketch.

Heap sketches also got faster: they now use DuckDB's allocator, which is jemalloc on Linux. That made grouped KLL queries up to 2.5× faster and TDigest up to 3.5×.

## Fixes sent to Apache DataSketches

Relying on the library's allocator support exposed eight problems in the DataSketches C++ library. We fixed each in [our fork](https://github.com/rustyconover/datasketches-cpp), with a test that fails without the fix, and sent it upstream:

| Upstream | Problem |
|---|---|
| [#556](https://github.com/apache/datasketches-cpp/pull/556) | An HLL union copied input sketches with the input's allocator. |
| [#557](https://github.com/apache/datasketches-cpp/pull/557) | EBPPS's `merge(const&)` called an unqualified `swap`, which doesn't compile with an allocator from another namespace. |
| [#558](https://github.com/apache/datasketches-cpp/pull/558) | KLL reserved `k` items in its constructor. |
| [#559](https://github.com/apache/datasketches-cpp/pull/559) | Count-Min allocated its hash seeds with `std::allocator`. |
| [#560](https://github.com/apache/datasketches-cpp/pull/560) | Frequent items allocated a temporary array on every purge. |
| [#561](https://github.com/apache/datasketches-cpp/pull/561) | TDigest reserved about 10 KB of buffers up front. |
| [#562](https://github.com/apache/datasketches-cpp/pull/562) | Density's kernel only accepted `std::vector`, and an unused allocator member was always default-constructed. |
| [#555](https://github.com/apache/datasketches-cpp/issues/555) | Count-Min's hash seeds differed between C++ standard libraries. |

Until a DataSketches release includes these, the extension builds from the fork's `duckdb-5.3.0` branch: release 5.3.0 plus one commit per fix.

## Two DuckDB issues worth knowing about

**Benchmark aggregates from a table, not `range()`.** In DuckDB 2.0, `range()` is read by a single thread while the aggregate still divides its memory budget across all threads, which makes aggregates spill when they don't need to ([#27749](https://github.com/duckdb/duckdb/issues/27749)). Our early numbers showed a 3× slowdown at 200,000 groups for this reason. Read from a table, the KLL aggregate over 200,000 groups doesn't spill at all and finishes in 0.52 seconds, ahead of DuckDB's built-in `approx_quantile` at 1.50.

**Some in-memory queries spill anyway.** Even reading from a table, DuckDB's own `list()` exported its states about 920 times on the same query, whatever the memory limit. The aggregate's memory reservation stayed at its 270 MB minimum: a check on arena size exported states before DuckDB asked for more memory, and after that first export the reservation never grew. Requesting more memory first halved `list()`'s time. We reported it, with measurements and the experimental change, as [duckdb/duckdb#28040](https://github.com/duckdb/duckdb/issues/28040).

The [extension page](/products/extensions/datasketches/) documents the established sketch families. Until it covers the five new ones, their functions are shown in the [extension's tests](https://github.com/Query-farm/datasketches/tree/v2.0/test/sql). If a sketch query doesn't behave as you expect, [open an issue](https://github.com/Query-farm/datasketches/issues).
