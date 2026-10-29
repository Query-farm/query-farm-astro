---
title: "Hashfuncs for DuckDB 2.0: row hashing, cross-system compatibility, and Iceberg buckets"
description: "Hashfuncs now hashes whole rows, matches Spark and BigQuery fingerprints, reproduces Kafka and Iceberg buckets, and adds Jump consistent hashing for growing shard counts."
showDescription: false
pubDate: 2026-10-28
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Hashing", "Interoperability"]
extensions: ["hashfuncs"]
draft: false
heroImage: "/media/posts/hashfuncs-for-duckdb-2/social.png"
heroImageAlt: "Hashfuncs for DuckDB 2.0: row hashing, cross-system compatibility, and Iceberg buckets. Illustrated data records connect to fingerprints and partition buckets in ochre, moss green, and terracotta."
leadVisual:
  src: "/media/posts/hashfuncs-for-duckdb-2/hashing-artwork.webp"
  alt: ""
  width: 1440
  height: 480
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Hash whole rows, lists, maps, and arrays directly, with field boundaries and NULLs preserved in the encoding.</li>
      <li>Reproduce Spark and BigQuery fingerprints, Kafka's keyed partition assignment, ClickHouse string hashes, and Iceberg's bucket transform in DuckDB.</li>
      <li>Use Jump consistent hashing to add a shard while moving only the keys assigned to the new shard.</li>
    </ul>
  </div>
</aside>

A hash often outlives the query that created it. It becomes a cache key, a partition number, or the fingerprint you compare after moving a table from one system to another. At that point, the question is whether the next system will produce exactly the same answer.

The [Hashfuncs extension](/products/extensions/hashfuncs/) already brought xxHash, MurmurHash3, and RapidHash to DuckDB. Its DuckDB 2.0 update adds the pieces around those algorithms: an encoding for whole rows, functions that follow other systems' hashing rules, and partition functions for Iceberg, Kafka, and changing shard counts. There are new algorithms, broader input types, and faster execution paths too.

## Hash the row directly

Building a row fingerprint by concatenating columns looks simple until a separator appears in the data. These two different rows produce the same input string:

```sql
SELECT 'a|' || '|' || 'b' AS first_row,
       'a' || '|' || '|b' AS second_row;
-- Both are 'a||b'.
```

Changing the hash algorithm cannot recover a boundary that the concatenation has erased. Hashfuncs now accepts `STRUCT`, `LIST`, `MAP`, and `ARRAY` values in its general-purpose hash functions. Pass the columns as a row:

```sql
SELECT xxh3_64(('a|', 'b')) = xxh3_64(('a', '|b')) AS same_hash;
-- false
```

The same syntax works for a useful fingerprint over several kinds of data:

```sql
WITH orders(order_id, customer, items) AS (
    VALUES (42::BIGINT, 'alice', ['coffee', 'tea']),
           (43::BIGINT, 'bob',   ['bread'])
)
SELECT order_id,
       xxh3_64((order_id, customer, items)) AS row_fingerprint
FROM orders;
```

Each field gets a NULL marker. Strings carry their byte length, lists carry their element count, and nested values follow the same rules recursively. A NULL field therefore has a position in the row, and an empty string has a different encoding from a NULL. The extension hashes the resulting byte sequence once.

The encoding is defined for a given schema. Field order and numeric types matter; struct field names are omitted. Arrays and lists with the same element type and values hash alike, while maps are encoded in their entry order. Keep the schema and ordering consistent when persisting these fingerprints. The encoding removes ambiguity from concatenation; the hash itself can still collide.

These row hashes use Hashfuncs' encoding. When the goal is to reproduce a fingerprint from another system, use the function for that system.

## Match the system that made the hash

Two implementations can both say “MurmurHash3” and disagree on every row. They might use different seeds, encode an integer at different widths, or combine columns differently. The new compatibility functions handle those details:

| Existing system | Hashfuncs function | What it matches |
|---|---|---|
| BigQuery | `farm_fingerprint(value)` | `FARM_FINGERPRINT` of string or binary bytes, including its signed 64-bit result |
| Spark | `spark_hash(a, b, ...)`, `spark_xxhash64(a, b, ...)` | Spark's `hash()` and `xxhash64()`, including type rules and seed chaining |
| Kafka | `kafka_murmur2(key)`, `kafka_partition(key, n)` | The hash and partition assignment for a serialized key under Kafka's default keyed partitioning |
| ClickHouse | `clickhouse_cityhash64(value)` | `cityHash64` of a String, using CityHash v1.0.2 |
| Iceberg | `iceberg_hash(value)`, `iceberg_bucket(value, n)` | The specification's type encodings and `bucket[N]` transform |

For example, the fingerprint of the string from [BigQuery's documented example](https://cloud.google.com/bigquery/docs/reference/standard-sql/hash_functions#farm_fingerprint) is now one DuckDB call:

```sql
SELECT farm_fingerprint('1footrue') AS fingerprint;
-- -1541654101129638711
```

It returns a signed `BIGINT`, so a negative result is expected. To compare existing BigQuery fingerprints, pass exactly the same string or bytes that BigQuery hashed, including any concatenation the original query performed.

Spark's [published example](https://spark.apache.org/docs/latest/api/sql/hash-functions/) also works directly:

```sql
SELECT spark_hash('Spark', [123], 2) AS hash32,
       spark_xxhash64('Spark', [123], 2) AS hash64;
```

<div class="query-result" role="region" aria-label="Result: Spark-compatible hashes computed in DuckDB" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>hash32</th><th>hash64</th></tr></thead>
    <tbody><tr><td>-1321691492</td><td>5602566077635097486</td></tr></tbody>
  </table>
</div>

Both Spark functions start with seed 42 and feed each value's hash into the next value as its seed. They skip NULLs, matching Spark. They also distinguish an `INTEGER` from a `BIGINT` with the same value:

```sql
SELECT spark_hash(42::INTEGER) AS int_hash,
       spark_hash(42::BIGINT) AS bigint_hash;
-- 29417773, 1316951768
```

Preserve the source types when checking a migration. For timestamps, DuckDB's `TIMESTAMP` maps to Spark's `TIMESTAMP_NTZ`, and `TIMESTAMPTZ` maps to Spark's `TIMESTAMP`; both hash microseconds.

Kafka's functions take the serialized key as `VARCHAR` or `BLOB`. A string key such as `'order-42'` can be passed directly. If the producer uses a binary serializer, pass those serialized bytes. A NULL key returns NULL because an unkeyed record's partition choice is outside this function's contract. The ClickHouse function likewise covers string or binary input; it does not reproduce ClickHouse's multi-argument hashing of arbitrary types.

## Compute Iceberg buckets in SQL

Iceberg's [bucket transform](https://iceberg.apache.org/spec/#bucket-transform-details) uses a 32-bit Murmur3 hash, clears its sign bit, and takes the remainder modulo the bucket count. Its type encoding is part of the contract. In particular, an integer and a long with the same value must hash alike, so changing a column from `int` to `long` preserves its bucket assignment.

```sql
SELECT iceberg_hash(34) AS hash,
       iceberg_bucket(34, 16) AS int_bucket,
       iceberg_bucket(34::BIGINT, 16) AS bigint_bucket;
```

<div class="query-result" role="region" aria-label="Result: Iceberg integer and long values share a bucket" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>hash</th><th>int_bucket</th><th>bigint_bucket</th></tr></thead>
    <tbody><tr><td>2017239379</td><td>3</td><td>3</td></tr></tbody>
  </table>
</div>

The extension handles decimals through their unscaled value, dates as days, and times and timestamps as microseconds. It also supports strings, binary values, and UUIDs. Types Iceberg cannot bucket, such as floating-point and nested values, fail when the query is bound.

This gives a DuckDB query the same bucket calculation as an Iceberg writer. It is useful for checking an existing partition assignment or preparing data for a writer; computing a bucket number alone does not create an Iceberg table.

## Add a shard without reshuffling almost every key

For a fixed number of shards, `xxh3_64(key) % n` is straightforward. Change `n` from 16 to 17, though, and most keys land somewhere else.

The new `jump_hash` implements Jump consistent hashing. It takes a 64-bit key and a bucket count. When the count grows from *n* to *n* + 1, about 1 / (*n* + 1) of the keys move, all into the new bucket. You can compare the two approaches over a million keys:

```sql
WITH keys AS (
    SELECT xxh3_64(i) AS h FROM range(1000000) t(i)
)
SELECT
    round(100.0 * count(*) FILTER (
        WHERE h % 16 <> h % 17
    ) / count(*), 2) AS modulo_moved_pct,
    round(100.0 * count(*) FILTER (
        WHERE jump_hash(h, 16) <> jump_hash(h, 17)
    ) / count(*), 2) AS jump_moved_pct
FROM keys;
```

Expect roughly 94% of keys to move with modulo and 6% with Jump. That can make a large difference when a move means copying cached objects or repartitioning stored data. Buckets are numbered consecutively from zero; this is suited to growing or shrinking the bucket count, rather than removing an arbitrary server from the middle of a numbered set. The implementation matches Guava's `Hashing.consistentHash`.

## More algorithms and less work per row

The update also adds `wyhash`, `komihash`, `siphash13`, `siphash24`, `crc32c`, `fnv1a_32`, and `fnv1a_64`, plus RapidHash's `rapidhash_micro` and `rapidhash_nano` variants. SipHash accepts a 128-bit key, and CRC32C can extend a previous checksum. These sit alongside the existing xxHash, MurmurHash3, and RapidHash functions.

The generic functions now accept booleans, decimals, UUIDs, enums, intervals, and a broader range of date and time types. UUIDs hash their 16 RFC 4122 bytes; enums hash their labels. We also fixed `DATE` and `TIME` inputs that previously raised an internal error.

Profiling the new implementation on an ARM Neoverse N1, with 20 million rows and one thread, found several places where the work around the hash cost too much:

| Workload | Before profiling changes | After |
|---|---|---|
| Row hashing | 1.55 s | 0.94 s |
| `murmurhash3_32` over `BIGINT` | 0.24 s | 0.14 s |
| `spark_hash(n, s)` | 0.92 s | 0.56 s |
| CRC32C over 150-byte strings | 3.4 s | 0.8 s |

These are [measurements from optimizing this update](https://github.com/Query-farm/hashfuncs/commit/7369e2a), not a comparison between released versions. Row encoding now resolves its types once per chunk and reuses a buffer. Spark hashing processes a column at a time. CRC32C uses CPU instructions when available, with a software fallback. Constant inputs are hashed once.

## Keep existing fingerprints usable

The extension's compatibility tests pin the existing algorithms' outputs for previously supported input types. In particular, the numeric `xxh3_128()` retains its historical `UHUGEINT` layout so stored numeric keys continue to match.

There is one earlier fix to account for when upgrading from an older build: `xxh3_128_hex()` was corrected in October to emit the canonical xxHash byte order. Its result for `'hello'` is:

```sql
SELECT xxh3_128_hex('hello') AS digest;
-- b5e9c1ad071b3e7fc779cfaa5e523818
```

Affected older builds emitted the two 16-character halves in the opposite order. Previously stored hex digests from those builds need that one-time correction before comparison. The numeric function was deliberately left unchanged.

The new compatibility functions have [reference tests](https://github.com/Query-farm/hashfuncs/blob/v2.0/test/sql/hash_interop.test) generated from the systems they match, alongside [Iceberg and Guava cases](https://github.com/Query-farm/hashfuncs/blob/v2.0/test/sql/hash_iceberg.test). That checks the signed results, input encodings, and type-specific behavior that a matching algorithm name alone cannot establish.

## Try it

Install the DuckDB 2.0 build from the [Query Farm extension repository](/blog/duckdb-2-query-farm-repository/):

```sql
SET allow_extension_repositories = 'allowed';

CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
    WITH PREFIX 'https://duckdb-extensions.query.farm';

INSTALL hashfuncs FROM query_farm;
LOAD hashfuncs FROM query_farm;
```

If you already installed it from this repository, replace the install line with `FORCE INSTALL hashfuncs FROM query_farm` in a fresh session before loading it.

The [Hashfuncs page](/products/extensions/hashfuncs/) has the extension overview, and [the source repository](https://github.com/Query-farm/hashfuncs) has the implementation and tests. If a fingerprint or partition assignment differs from the system you're comparing against, [open an issue](https://github.com/Query-farm/hashfuncs/issues) with the input, its type, and the expected result.
