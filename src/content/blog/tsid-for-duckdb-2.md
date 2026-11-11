---
title: "TSID for DuckDB 2.0: native UUIDs and IDs from event time"
description: "TSID adds native UUID output and timestamp inputs in DuckDB 2.0, fixes concurrent random generation, and rejects malformed IDs without crashing the process."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Identifiers"]
extensions: ["tsid"]
draft: false
showDescription: false
heroImage: "/media/posts/tsid-for-duckdb-2/social.png"
heroImageAlt: "TSID for DuckDB 2.0: native UUIDs and IDs from event time. A clock feeds a timeline of paper ID cards whose shared timestamp bands sit beside distinct random suffixes."
leadVisual:
  src: "/media/posts/tsid-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "TSID"
  pitch: "Generate time-sortable identifiers as text or UUID and recover their embedded timestamps."
  href: "/products/extensions/tsid/"
  cta: "Explore TSID"
  extension: "tsid"
  installNote: "These changes are in the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/tsid"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Generate a native <code>UUID</code> with <code>tsid_uuid()</code>, or supply a timestamp to embed an event time.</li>
      <li><code>tsid()</code> keeps returning text. The decoder accepts text and UUID, and rejects malformed text with a SQL error.</li>
      <li>Random generation no longer shares one unsynchronized engine across worker threads. Timestamp order still is not commit order.</li>
    </ul>
  </div>
</aside>

An event can arrive today and describe something that happened yesterday. An identifier generated at ingestion time sorts by arrival. Sometimes that is what you want; sometimes the useful order is the time carried by the event.

The [TSID extension](/products/extensions/tsid/) now supports both. Its DuckDB 2.0 update adds timestamp-taking generators and a native UUID result, while retaining the existing text function. It also fixes concurrent access to the random generator and a parser bug that could turn a malformed ID into a process crash.

## Put the event's timestamp in the ID

The zero-argument `tsid()` still embeds the current time. Pass a `TIMESTAMP` to use a time you already have:

```sql
SELECT tsid(TIMESTAMP '2024-06-01 12:00:00.123456') AS id;
```

The timestamp prefix is fixed by the argument; the tail remains random. Calling the function twice with the same timestamp produces two independently generated identifiers. It is not a deterministic encoding of an event and does not deduplicate repeated input.

For a table of imported events, the distinction is explicit:

```sql
WITH events(event_time, event_name) AS (
    VALUES (TIMESTAMP '2024-06-01 12:00:00.123456', 'opened'),
           (TIMESTAMP '2024-06-01 12:00:02.000000', 'completed')
)
SELECT tsid_uuid(event_time) AS event_id, event_time, event_name
FROM events
ORDER BY event_time;
```

The timestamp overload accepts values from the Unix epoch through `2106-02-07 06:28:15.999999`. Earlier, later or infinite timestamps raise an error; NULL returns NULL. This is the range of the identifier's time representation, not DuckDB's full timestamp range.

## Choose text or UUID without changing the time layout

`tsid()` continues to return a 32-character hexadecimal `VARCHAR`. Existing text columns do not change type when you upgrade.

The new `tsid_uuid()` returns DuckDB's native `UUID` type. It has the same identifier layout and also accepts a timestamp. The decoder now has a UUID overload:

```sql
SELECT typeof(tsid_uuid()) AS id_type,
       tsid_to_timestamp(
           tsid_uuid(TIMESTAMP '2024-06-01 12:00:00.123456')
       ) AS event_time;
```

<div class="query-result" role="region" aria-label="Result: id_type, event_time" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>id_type</th><th>event_time</th></tr></thead>
    <tbody>
      <tr><td>UUID</td><td>2024-06-01 12:00:00.123456</td></tr>
    </tbody>
  </table>
</div>

This avoids keeping an identifier as text merely because that was the only available result type. UUID values display with hyphens when formatted as strings, and the text decoder accepts that canonical representation too.

This is TSID's existing time-sortable layout exposed as a UUID value. It is not a switch to UUIDv7. If another system expects a particular UUID time layout, check that contract before passing these identifiers to it.

## Parse the shape before reading the bytes

The old text parser accepted a 36-character input on the assumption that it contained the expected hyphens. An input with 36 hexadecimal characters instead could write 18 bytes into a 16-byte buffer. A string consisting entirely of hyphens could decode to the epoch.

The decoder now accepts exactly 32 hexadecimal digits or the canonical 8-4-4-4-12 dashed form. Hexadecimal letters can be uppercase or lowercase. Wrong lengths, misplaced dashes and non-hexadecimal characters produce `Invalid TSID format`.

When importing a column where some values may be bad, use DuckDB's `TRY` to keep the valid rows available:

```sql
SELECT raw_id, TRY(tsid_to_timestamp(raw_id)) AS embedded_time
FROM (VALUES
    ('65d4a2b6000000004000800000000000'),
    ('bogus')
) AS incoming(raw_id);
```

<div class="query-result" role="region" aria-label="Result: raw_id, embedded_time" tabindex="0">
  <div class="query-result__label">result · 2 rows</div>
  <table>
    <thead><tr><th>raw_id</th><th>embedded_time</th></tr></thead>
    <tbody>
      <tr><td>65d4a2b6000000004000800000000000</td><td>2024-02-20 13:01:42</td></tr>
      <tr><td>bogus</td><td class="query-result__null">NULL</td></tr>
    </tbody>
  </table>
</div>

The known ID decodes to `2024-02-20 13:01:42`; the malformed input yields NULL. The [decoder tests](https://github.com/Query-farm/tsid/blob/e2ac803245a1d9ac3707d234eb2331acea7195be/test/sql/tsid_decode.test) pin the accepted representations and the malformed cases.

## Each worker needs its own random generator

The random tail previously came from a single static `mt19937_64` shared by all worker threads without synchronization. The update puts the generator in expression-local execution state and seeds it using `std::random_device` mixed with clock and thread-specific information.

The [generation tests](https://github.com/Query-farm/tsid/blob/e2ac803245a1d9ac3707d234eb2331acea7195be/test/sql/tsid_generate.test) include two million text and UUID values on eight threads, plus repeated generation at one timestamp. Those are regression checks for the implementation, not a mathematical guarantee that random identifiers can never collide. TSIDs are identifiers, not secret tokens.

The timestamp prefix supports sorting by embedded time. It does not establish a strict insertion or transaction order across concurrent producers, and a clock that moves backward can produce an earlier prefix. If commit order matters, store the sequence that defines it. If event time matters, retain the event timestamp too.

Install the DuckDB 2.0 build from the [Query Farm extension repository](/blog/duckdb-2-query-farm-repository/). The [source change](https://github.com/Query-farm/tsid/commit/e2ac803245a1d9ac3707d234eb2331acea7195be) keeps the old text API while adding the new forms, so choosing UUID storage or event-time generation can be a deliberate schema decision.
