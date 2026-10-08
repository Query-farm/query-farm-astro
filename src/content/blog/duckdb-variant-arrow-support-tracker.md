---
title: "DuckDB VARIANT and Arrow: What Works Today"
description: "Direct VARIANT interchange with Arrow is merged into DuckDB's 2.0 development branch. See what works, what still needs a release, and the remaining limits across C++, Python, Go, Rust, and Java."
pubDate: 2026-09-13
updatedDate: 2026-10-08
heroImage: '/media/posts/duckdb-variant-arrow-support-tracker/social.png'
author: "Rusty Conover"
tags: ["DuckDB", "Arrow", "VARIANT", "Interoperability"]
draft: false
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">Status on 8 October 2026</p>
    <ul>
      <li>DuckDB's 2.0 development branch supports <code>VARIANT</code> in SQL, native storage, Parquet, and now direct Arrow interchange.</li>
      <li>Arrow import and export merged on 21 September. The latest stable release, DuckDB 1.5.6, does not include that implementation.</li>
      <li>Arrow Go has released read/write support. Rust is broad but experimental. C++ data handling and PyArrow bindings are still in progress.</li>
      <li>The merged DuckDB implementation exchanges unshredded values; it still rejects Arrow's <code>typed_value</code> shredded form.</li>
    </ul>
  </div>
</aside>

DuckDB 2.0 makes `VARIANT` a first-class semi-structured type. DuckDB can discover common structure, shred it into physical columns, push extraction into scans, and read or write Parquet Variant. That pipeline is described in the [DuckDB 2.0 preview](https://duckdb.org/2026/08/17/duckdb-20-highlights#2-variant-becomes-a-first-class-citizen).

Arrow interoperability is a separate piece of work. There is now a standard representation—[`arrow.parquet.variant`](https://arrow.apache.org/docs/format/CanonicalExtensions.html#parquet-variant)—but each Arrow implementation still has to recognize the extension, validate its storage, and expose useful APIs for its language.

The statuses below distinguish released library support, code merged into DuckDB's 2.0 development branch, and work still under review. Merged code is not necessarily included in a stable release.

<div class="support-legend" aria-label="Support status legend">
  <span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span>
  <span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial or experimental</span>
  <span class="status-badge status-badge--waiting"><span class="status-badge__icon" aria-hidden="true">↻</span>Waiting to merge</span>
  <span class="status-badge status-badge--blocked"><span class="status-badge__icon" aria-hidden="true">×</span>Not supported</span>
</div>

## The DuckDB side

[PR #24157](https://github.com/duckdb/duckdb/pull/24157) merged into `v2.0-cyanoptera` on 21 September 2026, closing the direct Arrow import/export gap tracked in [#24091](https://github.com/duckdb/duckdb/issues/24091). Builds containing that change export `VARIANT` as `arrow.parquet.variant` and recognize the same canonical extension on import, preserving the logical type instead of reducing it to a bare Struct.

The table describes the **2.0 development branch**. The latest stable release as of this update is [DuckDB 1.5.6](https://github.com/duckdb/duckdb/releases/tag/v1.5.6); its [Arrow extension registry](https://github.com/duckdb/duckdb/blob/v1.5.6/src/common/arrow/arrow_type_extension.cpp) does not contain the new Variant implementation. Updating to 1.5.6 alone will not enable this exchange.

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
      <td><span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Merged into 2.0</span></td>
      <td><a href="https://github.com/duckdb/duckdb/pull/24157">PR #24157</a> implements the canonical extension in both directions; requires a build containing the 21 September merge.</td>
    </tr>
    <tr>
      <td>Shredded Arrow <code>typed_value</code></td>
      <td><span class="status-badge status-badge--blocked"><span class="status-badge__icon" aria-hidden="true">×</span>Not supported</span></td>
      <td>The reader rejects fully and partially shredded Arrow Variants with an explicit error.</td>
    </tr>
  </tbody>
</table>

The [merged implementation](https://github.com/duckdb/duckdb/blob/4f7173bd98dced0a0c9a8dd6d0929db04e351e45/src/common/arrow/arrow_type_extension.cpp) registers `arrow.parquet.variant` and converts through DuckDB's Variant binary encoder and decoder. It preserves SQL nulls and resolves the `metadata` and `value` fields by name. The [upstream tests](https://github.com/duckdb/duckdb/blob/4f7173bd98dced0a0c9a8dd6d0929db04e351e45/test/arrow/arrow_roundtrip.cpp) cover nested values, Binary, LargeBinary, BinaryView, dictionary-encoded metadata, and run-end-encoded metadata.

The important remaining boundary is shredding. DuckDB exports an unshredded `Struct(metadata, value)`. Its Arrow reader rejects a `typed_value` field, even when residual `value` bytes are also present. Shredded Parquet support inside DuckDB does not imply support for shredded Arrow input.

## Support by Arrow implementation

Arrow defines Variant as a Struct containing non-null `metadata` and either `value`, `typed_value`, or both. A library can preserve that Struct without understanding the value inside it. The more useful question is whether it can encode, decode, shred, or inspect Variant data.

### C++

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial</span>

Arrow C++ already defines the canonical extension type and maps it to Parquet schemas. Reading, writing, validation, shredding, and unshredding are still under review in [PR #50252](https://github.com/apache/arrow/pull/50252).

DuckDB 2.0 builds containing the merge can exchange the unshredded representation through the Arrow C Data interface. Constructing, inspecting, or transforming Variant values with Arrow C++ still depends on its own implementation work.

### Python / PyArrow

<span class="status-badge status-badge--waiting"><span class="status-badge__icon" aria-hidden="true">↻</span>Waiting</span>

PyArrow can preserve the underlying Struct and its field metadata, but it has no public `VariantType`, `VariantArray`, or `VariantScalar`.

On DuckDB builds containing the merge, an unshredded column carrying the canonical extension metadata can enter as `VARIANT`. That does not give PyArrow a native API for inspecting the values: [#50131](https://github.com/apache/arrow/issues/50131) still tracks the Python type and array bindings, and [#50132](https://github.com/apache/arrow/issues/50132) tracks Parquet integration. Both issues remain open.

### Go

<span class="status-badge status-badge--available"><span class="status-badge__icon" aria-hidden="true">✓</span>Available</span>

Go has released read/write support. [Arrow Go PR #434](https://github.com/apache/arrow-go/pull/434) shipped in [v18.4.0](https://github.com/apache/arrow-go/releases/tag/v18.4.0) with `pqarrow` round trips for both unshredded and shredded Variant.

The unshredded representation matches the form supported by the merged DuckDB implementation. Shredded values must first be unshredded before DuckDB can accept them.

### Rust

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Experimental</span>

`arrow-rs` includes Variant arrays, builders, JSON conversion, path kernels, shredding, and unshredding behind its [`variant_experimental`](https://github.com/apache/arrow-rs/blob/60.0.0/parquet/README.md) feature. The released 60.0.0 documentation still marks this feature experimental and warns that it may change even between minor releases.

That provides broad coverage for unshredded exchange, although the APIs remain unstable and DuckDB will reject shredded input. Stabilization is tracked in [#10546](https://github.com/apache/arrow-rs/issues/10546).

### Java

<span class="status-badge status-badge--partial"><span class="status-badge__icon" aria-hidden="true">◐</span>Partial</span>

[Arrow Java 19.0.0](https://github.com/apache/arrow-java/releases/tag/v19.0.0) includes [PR #947](https://github.com/apache/arrow-java/pull/947), which added an unshredded `VariantVector` plus readers and writers.

Java's [released `VariantType`](https://github.com/apache/arrow-java/blob/v19.0.0/arrow-variant/src/main/java/org/apache/arrow/variant/extension/VariantType.java) still registers `parquet.variant` rather than the canonical `arrow.parquet.variant`. Direct exchange therefore needs an adapter that corrects the extension name while preserving the storage representation.

### Other Arrow implementations

<span class="status-badge status-badge--transport"><span class="status-badge__icon" aria-hidden="true">→</span>Raw transport</span>

An implementation that preserves the Struct and its extension metadata can carry DuckDB's unshredded representation without offering a semantic Variant API. The receiver must retain the canonical extension name to recover `VARIANT`; applications still need a decoder to inspect the binary values themselves.

## Available or merged

- The [Parquet Variant encoding](https://github.com/apache/parquet-format/blob/master/VariantEncoding.md) and [shredding](https://github.com/apache/parquet-format/blob/master/VariantShredding.md) specifications are finalized.
- `arrow.parquet.variant` is an official [Arrow canonical extension type](https://arrow.apache.org/docs/format/CanonicalExtensions.html#parquet-variant).
- Arrow C++ has its [`VariantExtensionType`](https://github.com/apache/arrow/pull/45375) and the corrected canonical extension name.
- Arrow Go has released full Parquet/Arrow Variant round trips.
- Arrow Java has released its unshredded Variant module, and Rust releases contain the experimental Variant crates and kernels.
- DuckDB's 2.0 development branch has the database and Parquet side, plus merged unshredded Arrow import/export. That Arrow implementation is not in the latest stable 1.5.6 release.

## Still in flight

- **DuckDB:** ship the merged Arrow implementation in a stable release, and add support for Arrow `typed_value` shredding.
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

This snapshot was checked against upstream pull requests, release information, and source on 8 October 2026. It distinguishes released libraries from DuckDB's development branch; it is not a new cross-language runtime test. We may revisit it as the work moves, particularly after DuckDB 2.0 ships.
