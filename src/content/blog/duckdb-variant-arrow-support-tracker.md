---
title: "DuckDB VARIANT and Arrow: What Works Today"
description: "DuckDB 2.0 brings VARIANT to SQL, storage, and Parquet. Direct Arrow interchange is close, but support still differs across C++, Python, Go, Rust, and Java."
pubDate: 2026-09-13
author: "Rusty Conover"
tags: ["DuckDB", "Arrow", "VARIANT", "Interoperability"]
draft: false
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">Status on 13 September 2026</p>
    <ul>
      <li>DuckDB 2.0 has end-to-end <code>VARIANT</code> support in SQL, native storage, and Parquet.</li>
      <li>Direct DuckDB ↔ Arrow <code>VARIANT</code> conversion is implemented in a substantial pull request, but it is not merged.</li>
      <li>Arrow Go has released read/write support. Rust is broad but experimental. C++ data handling and PyArrow bindings are still in progress.</li>
      <li>The current DuckDB proposal exchanges unshredded values; it deliberately rejects Arrow's <code>typed_value</code> shredded form.</li>
    </ul>
  </div>
</aside>

DuckDB 2.0 makes `VARIANT` a first-class semi-structured type. DuckDB can discover common structure, shred it into physical columns, push extraction into scans, and read or write Parquet Variant. That pipeline is described in the [DuckDB 2.0 preview](https://duckdb.org/2026/08/17/duckdb-20-highlights#2-variant-becomes-a-first-class-citizen).

Arrow interoperability is a separate piece of work. There is now a standard representation—[`arrow.parquet.variant`](https://arrow.apache.org/docs/format/CanonicalExtensions.html#parquet-variant)—but each Arrow implementation still has to recognize the extension, validate its storage, and expose useful APIs for its language.

The badges below distinguish released code from work that is still under review.

<div class="support-legend" aria-label="Support status legend">
  <span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span>
  <span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial or experimental</span>
  <span class="status-badge status-badge--waiting"><span class="status-badge__icon" aria-hidden="true">↻</span>Waiting to merge</span>
  <span class="status-badge status-badge--blocked"><span class="status-badge__icon" aria-hidden="true">×</span>Not supported</span>
</div>

## The DuckDB side

Direct Arrow import and export remain the main gap, tracked in [duckdb/duckdb#24091](https://github.com/duckdb/duckdb/issues/24091). On the current DuckDB 2.0 branch, exporting `SELECT 42::VARIANT` to Arrow raises `Unsupported Arrow type VARIANT`. Importing a canonical Variant column loses the logical type and produces its bare `STRUCT(metadata BLOB, value BLOB)` storage instead.

<table class="support-matrix">
  <thead>
    <tr><th>DuckDB capability</th><th>Status</th><th>What that means</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>SQL, native storage, execution</td>
      <td><span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span></td>
      <td>First-class in DuckDB 2.0, including shredded execution and extraction pushdown.</td>
    </tr>
    <tr>
      <td>Parquet Variant</td>
      <td><span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span></td>
      <td>DuckDB reads and writes unshredded and shredded Parquet Variant.</td>
    </tr>
    <tr>
      <td>Arrow C Data import/export</td>
      <td><span class="status-badge status-badge--waiting"><span class="status-badge__icon" aria-hidden="true">↻</span>PR open</span></td>
      <td><a href="https://github.com/duckdb/duckdb/pull/24157">PR #24157</a> implements the canonical extension in both directions.</td>
    </tr>
    <tr>
      <td>Shredded Arrow <code>typed_value</code></td>
      <td><span class="status-badge status-badge--blocked"><span class="status-badge__icon" aria-hidden="true">×</span>Not in PR</span></td>
      <td>The proposed reader rejects fully and partially shredded Arrow Variants with an explicit error.</td>
    </tr>
  </tbody>
</table>

[PR #24157](https://github.com/duckdb/duckdb/pull/24157) spans nine commits, 18 changed files, and more than 700 lines of Arrow tests. It registers `arrow.parquet.variant`, converts through DuckDB's Parquet Variant encoder and decoder, preserves SQL nulls, resolves fields by name, and tests Binary, LargeBinary, BinaryView, dictionary-encoded metadata, and run-end-encoded metadata.

Its CI is green and it has an approval, but a DuckDB maintainer still has changes requested. The remaining review covers code placement, large nested-vector capacity, binary child validation, and a few conversion cleanups. The head commit is [`83cbc26770`](https://github.com/duckdb/duckdb/pull/24157/commits/83cbc267706bab5ed5cc60751f4e7f9ba36b4629); none of those commits is in the DuckDB 2.0 release branch yet.

## Support by Arrow implementation

Arrow defines Variant as a Struct containing non-null `metadata` and either `value`, `typed_value`, or both. A library can preserve that Struct without understanding the value inside it. The more useful question is whether it can encode, decode, shred, or inspect Variant data.

### C++

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial</span>

Arrow C++ already defines the canonical extension type and maps it to Parquet schemas. Reading, writing, validation, shredding, and unshredding are still under review in [PR #50252](https://github.com/apache/arrow/pull/50252).

If DuckDB PR #24157 lands as written, C++ callers will be able to exchange unshredded values through the Arrow C Data interface. Native C++ value handling will still depend on the Arrow work.

### Python / PyArrow

<span class="status-badge status-badge--waiting"><span class="status-badge__icon" aria-hidden="true">↻</span>Waiting</span>

PyArrow can preserve the underlying Struct and its field metadata, but it has no public `VariantType`, `VariantArray`, or `VariantScalar`.

After the DuckDB PR, a carefully constructed canonical schema should enter DuckDB as `VARIANT`. Python still will not have a natural way to inspect those values until [#50131](https://github.com/apache/arrow/issues/50131) and [#50132](https://github.com/apache/arrow/issues/50132) land.

### Go

<span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span>

Go currently has the most complete released implementation. [Arrow Go PR #434](https://github.com/apache/arrow-go/pull/434) shipped in v18.4.0 with `pqarrow` round trips for both unshredded and shredded Variant.

Canonical unshredded values should round-trip directly once the DuckDB PR lands. Shredded values must first be unshredded before DuckDB can accept them.

### Rust

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Experimental</span>

`arrow-rs` includes Variant arrays, builders, JSON conversion, path kernels, shredding, and unshredding behind its [`variant_experimental`](https://github.com/apache/arrow-rs/blob/main/parquet/README.md) feature.

That provides broad coverage for unshredded exchange, although the APIs remain unstable and DuckDB will reject shredded input. Stabilization is tracked in [#10546](https://github.com/apache/arrow-rs/issues/10546).

### Java

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial</span>

[Arrow Java 19](https://github.com/apache/arrow-java/pull/947) added an unshredded `VariantVector` plus readers and writers.

Java currently registers the older `parquet.variant` extension name rather than the canonical `arrow.parquet.variant`. Direct exchange therefore needs an adapter for the name and metadata.

### Other Arrow implementations

<span class="status-badge status-badge--transport"><span class="status-badge__icon" aria-hidden="true">→</span>Raw transport</span>

An implementation that preserves the Struct and its field metadata can carry the bytes without offering a semantic Variant API. After the DuckDB PR, it should be able to relay DuckDB's unshredded representation, but applications must decode the binary format themselves to inspect values.

## Already available

- The [Parquet Variant encoding](https://github.com/apache/parquet-format/blob/master/VariantEncoding.md) and [shredding](https://github.com/apache/parquet-format/blob/master/VariantShredding.md) specifications are finalized.
- `arrow.parquet.variant` is an official [Arrow canonical extension type](https://arrow.apache.org/docs/format/CanonicalExtensions.html#parquet-variant).
- Arrow C++ has its [`VariantExtensionType`](https://github.com/apache/arrow/pull/45375) and the corrected canonical extension name.
- Arrow Go has released full Parquet/Arrow Variant round trips.
- Arrow Java has released its unshredded Variant module, and Rust releases contain the experimental Variant crates and kernels.
- DuckDB 2.0 has the database and Parquet side: storage, shredding, execution, functions, and Parquet import/export.

## Still in flight

- **DuckDB:** merge [PR #24157](https://github.com/duckdb/duckdb/pull/24157), then decide how and when to support Arrow `typed_value` shredding.
- **Arrow C++:** merge [PR #50252](https://github.com/apache/arrow/pull/50252) for full read, write, validation, shredding, and unshredding.
- **PyArrow:** expose Variant types and arrays in [#50131](https://github.com/apache/arrow/issues/50131), followed by Parquet integration in [#50132](https://github.com/apache/arrow/issues/50132).
- **Rust:** close the stabilization list and replace `variant_experimental` with a stable feature.
- **Java:** align `parquet.variant` with the canonical `arrow.parquet.variant` name and add shredded support.

## The practical fallback

For portable application output, cast a DuckDB Variant to JSON before crossing the Arrow boundary:

```sql
SELECT payload::JSON AS payload
FROM events;
```

That gives up native Variant typing, but it works across today's Arrow clients and makes the compromise visible in the query.

DuckDB's Parquet extension also exposes a lower-level bridge: `variant_to_parquet_variant()` produces the canonical `metadata` and `value` blobs, while `variant_bytes_to_variant(metadata || value)` reconstructs the DuckDB value. That path can preserve the binary representation when both ends are under your control, but it does not turn the Arrow column into the canonical extension automatically and should be treated as a version-sensitive integration technique.

This is a snapshot as of 13 September 2026. We may revisit it as the work moves, particularly after DuckDB 2.0 ships.
