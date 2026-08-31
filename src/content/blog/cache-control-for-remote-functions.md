---
title: "Cache-Control for Remote Functions"
description: "A VGI function runs somewhere else — a subprocess, an HTTP service, a model endpoint — and queries ask it the same question over and over. So we gave those functions HTTP's caching vocabulary: the worker advertises a TTL, an ETag and whether it can revalidate cheaply, and the engine-side client decides. This is how the cache keys are built, how many granularities the cache actually has, and what the local store looks like."
pubDate: 2026-08-30
author: 'Query.Farm Team'
tags: ["VGI", "DuckDB", "Caching", "Arrow"]
draft: true
---

Ask a query engine the same question twice and it should remember what it told you the first time.

The remembering was never the hard part. What's hard is knowing how long that answer stays true, and who else is entitled to hear it. Sometimes it's good for an hour. Sometimes only until the next commit. Sometimes only inside the transaction that asked.

Engines already do a version of the easy half, at the file layer. DuckDB is a clean example: since 1.3.0 it has shipped an [external file cache](https://duckdb.org/2025/05/21/announcing-duckdb-130) — read a Parquet file from S3 and the byte ranges you touched stay in memory under the buffer manager's budget for the rest of the session. Read it again and it doesn't refetch; it checks the object's `ETag`, and only when the tag differs does it drop those ranges and go back to the network. That is HTTP caching, done by a query engine, on a file.

[VGI](/vgi) — the Vector Gateway Interface — is a protocol for running a query engine's functions in a *different* process, written in whatever language you like, speaking Apache Arrow. A VGI table or scalar function is backed by a worker that could be a subprocess, an HTTP service behind a load balancer, a model endpoint, or a rate-limited third-party API. The engine binds it like any other function and calls it during execution.

Which meant every call went to the worker. Every time. A dashboard running the same six queries a minute paid the worker six times a minute for answers that changed once an hour.

VGI has two halves, and which half does what matters for everything below. The **worker** implements your function and knows nothing about who called it. The **client** lives inside the query engine: it binds the function into the catalog, drives execution, and holds whatever state the engine keeps. DuckDB is the client that ships today; DataFusion, Polars, SQLite, Trino and Spark are the ones we are building toward. A cache therefore belongs on the client side — and the design question is what a worker must tell a client so that *any* client can cache it safely.

Over July and August we built a result cache for it, and we deliberately did not invent a vocabulary for the thing. [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html) worked out how a cache and an origin negotiate reuse nearly thirty years ago, against far more hostile conditions than ours. What follows is what happens when you take that model seriously and push it down into a query engine: what the cache key has to contain when there is no URL, how many *different sizes* of reusable answer exist inside a single query, and what the local store has to look like when the payload is Arrow.

## The shape is borrowed on purpose

<figure role="img" aria-label="Three lanes showing the same caching handshake: a browser and an HTTP origin, DuckDB and a Parquet file on S3, and a query engine running a VGI client against a remote worker. Each has a client that holds the cache and an origin that advertises cacheability." style="margin:2.25rem 0">
<svg viewBox="0 0 760 292" width="100%" style="max-width:760px;height:auto;font-family:Commissioner,system-ui,sans-serif">
  <defs>
    <marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#5d4632"/></marker>
    <marker id="ahg" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#45632f"/></marker>
  </defs>
  <text x="24" y="20" font-size="10.5" font-weight="700" fill="#5d4632" letter-spacing="0.08em">CLIENT — HOLDS THE CACHE</text>
  <text x="472" y="20" font-size="10.5" font-weight="700" fill="#5d4632" letter-spacing="0.08em">ORIGIN — DECIDES REUSE</text>
  <!-- lane 1 -->
  <rect x="24" y="34" width="196" height="46" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="122" y="55" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">Browser</text>
  <text x="122" y="70" font-size="10.5" fill="#5d4632" text-anchor="middle">HTTP cache</text>
  <rect x="472" y="34" width="264" height="46" rx="5" fill="#f6ddab" stroke="#c08e2f"/>
  <text x="604" y="55" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">Web server</text>
  <text x="604" y="70" font-size="10.5" fill="#5a3c22" text-anchor="middle">Cache-Control: max-age · ETag</text>
  <line x1="226" y1="49" x2="464" y2="49" stroke="#5d4632" stroke-width="1.2" marker-end="url(#ah)"/>
  <text x="345" y="45" font-size="9.5" font-family="ui-monospace,monospace" fill="#5d4632" text-anchor="middle">GET /rates  If-None-Match: "v3"</text>
  <line x1="464" y1="68" x2="226" y2="68" stroke="#45632f" stroke-width="1.2" marker-end="url(#ahg)"/>
  <text x="345" y="80" font-size="9.5" font-family="ui-monospace,monospace" fill="#45632f" text-anchor="middle">304 Not Modified</text>
  <!-- lane 2 -->
  <rect x="24" y="122" width="196" height="46" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="122" y="143" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">DuckDB</text>
  <text x="122" y="158" font-size="10.5" fill="#5d4632" text-anchor="middle">external file cache</text>
  <rect x="472" y="122" width="264" height="46" rx="5" fill="#f6ddab" stroke="#c08e2f"/>
  <text x="604" y="143" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">Parquet file on S3</text>
  <text x="604" y="158" font-size="10.5" fill="#5a3c22" text-anchor="middle">ETag on the object</text>
  <line x1="226" y1="137" x2="464" y2="137" stroke="#5d4632" stroke-width="1.2" marker-end="url(#ah)"/>
  <text x="345" y="133" font-size="9.5" font-family="ui-monospace,monospace" fill="#5d4632" text-anchor="middle">HEAD, then ranged GET on mismatch</text>
  <line x1="464" y1="156" x2="226" y2="156" stroke="#45632f" stroke-width="1.2" marker-end="url(#ahg)"/>
  <text x="345" y="168" font-size="9.5" font-family="ui-monospace,monospace" fill="#45632f" text-anchor="middle">unchanged → keep the cached ranges</text>
  <!-- lane 3 -->
  <rect x="24" y="210" width="196" height="46" rx="5" fill="#dee8d1" stroke="#7a9a54"/>
  <text x="122" y="231" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">Engine + VGI client</text>
  <text x="122" y="246" font-size="10.5" fill="#3b5626" text-anchor="middle">result cache</text>
  <rect x="472" y="210" width="264" height="46" rx="5" fill="#dee8d1" stroke="#7a9a54"/>
  <text x="604" y="231" font-size="12.5" font-weight="600" fill="#211a12" text-anchor="middle">VGI worker</text>
  <text x="604" y="246" font-size="10.5" fill="#3b5626" text-anchor="middle">vgi.cache.ttl · vgi.cache.etag</text>
  <line x1="226" y1="225" x2="464" y2="225" stroke="#5d4632" stroke-width="1.2" marker-end="url(#ah)"/>
  <text x="345" y="221" font-size="9.5" font-family="ui-monospace,monospace" fill="#5d4632" text-anchor="middle">first tick · vgi.cache.if_none_match</text>
  <line x1="464" y1="244" x2="226" y2="244" stroke="#45632f" stroke-width="1.2" marker-end="url(#ahg)"/>
  <text x="345" y="256" font-size="9.5" font-family="ui-monospace,monospace" fill="#45632f" text-anchor="middle">0-row batch · vgi.cache.not_modified</text>
  <line x1="24" y1="100" x2="736" y2="100" stroke="#cfc4ad" stroke-dasharray="2 4"/>
  <line x1="24" y1="188" x2="736" y2="188" stroke="#cfc4ad" stroke-dasharray="2 4"/>
</svg>
<figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">The same handshake at three altitudes. In every lane the <em>client</em> holds the bytes and the <em>origin</em> holds the authority to say whether they may be reused. The middle lane is DuckDB's file cache, shown as one concrete instance of a pattern most engines have; the third is the one we built. It carries the vocabulary on Arrow batch metadata rather than HTTP headers, but the state machine is the one from RFC 9111.</figcaption>
</figure>

The most important thing the HTTP model gives you is not the header names. It's the direction of the decision. **Cacheability is advertised, never requested.** The client cannot decide that a function looks cheap and start memoizing it; the worker — which is the only party that knows whether its answer is a stable table of exchange rates or a live sensor reading — attaches metadata to what it returns, and a worker that says nothing is uncacheable. Same as an origin server with no `Cache-Control` header.

Where HTTP puts that metadata in response headers, VGI puts it in Arrow. Every result batch already carries `custom_metadata`, so the first data batch of a result *is* the header block and the batches that follow are the body. A table function [opts in](/vgi/docs/python/how-to/result-caching/) like this:

```python
from vgi.cache_control import CacheControl

vgi_out.emit(
    first_batch,
    cache_control=CacheControl(
        ttl=300,                     # reusable for 5 minutes without asking
        etag='"rates-v3"',           # ...and after that, cheap to check
        revalidatable=True,          # gates whether the client ever asks
        stale_while_revalidate=60,   # serve stale while refreshing behind it
        stale_if_error=600,          # serve stale rather than fail
    ),
)
```

Scalar functions declare it once on the class instead, since every batch they emit is the same kind of answer:

```python
class GeocodeScalarFunction(ScalarFunction):
    CACHE_CONTROL = CacheControl(ttl=86400, per_value=True)
```

The full vocabulary, and what each key is borrowed from:

| `vgi.cache.*` key | HTTP analogue | Meaning |
|---|---|---|
| `ttl` | `max-age` | Freshness lifetime in seconds, measured from **full-result receipt** — skew-immune, and it wins over `expires` |
| `expires` | `Expires` | Absolute RFC 3339 deadline; lifetime is `expires - now` at receipt |
| `no_store` | `no-store` | Never cache. Overrides any freshness key |
| `scope` | `public` / `private` | `catalog` (reusable across transactions under the calling identity) or `transaction` |
| `etag` | `ETag` | Strong opaque validator |
| `last_modified` | `Last-Modified` | Weaker fallback validator |
| `revalidatable` | — | The worker can check freshness *without* recomputing. Gates whether the client ever bothers to ask |
| `stale_while_revalidate` | `stale-while-revalidate` | Grace window to serve stale while refreshing behind it |
| `stale_if_error` | `stale-if-error` | Grace window to serve stale rather than fail |
| `not_modified` | `304` | Set on a 0-row reply: "keep what you have" |
| `partition_scope` | — | Also cache the result split by partition value |
| `per_value` | — | Also memoize per distinct input tuple |

The presence of `ttl` or `expires` is the opt-in; everything else modifies it. Two entries in that table have no HTTP counterpart, and they are the ones this post is really about — they are about *granularity*, which is the thing HTTP never had to solve because a URL names exactly one resource.

`ttl=0` together with `etag` and `revalidatable` reproduces HTTP's `no-cache` exactly: the result is stored but immediately stale, so every read revalidates and nothing is ever served without asking. A worker-supplied `ttl` is clamped at ten years, because a hostile value should not be able to overflow the expiry arithmetic.

There is a second reason to borrow rather than invent, and it matters more the further VGI gets from its first engine. The worker's advertisement is a statement about *its own data* — how long the answer is good for, how to check whether it still is — and it says nothing about how a client should store anything. So the same worker, unchanged, can be cached by a client with a two-tier memory-and-disk store and by a client whose entire cache is a dictionary, and both are correct. The vocabulary is the contract; the storage is each client's business.

What follows is one client's answer to that, the DuckDB one, because it is the one that exists. The parts worth reading are the parts that aren't DuckDB's.

## There is no URL

An HTTP cache has an easy job on keys. The key is the URL, plus whatever the origin names in `Vary`. The origin gets to *tell* the cache which request dimensions matter.

A table function call has no URL and no `Vary`. It has a call site inside a query plan, and the number of things that can make two seemingly identical calls return different rows is uncomfortably large. Get one of them wrong and you don't get a slow query — you get wrong answers, silently, and possibly one tenant's rows served to another.

So the key is nineteen fields, all equality-matched:

<figure role="img" aria-label="Comparison of an HTTP cache key (one URL plus Vary headers) against the VGI result cache key, which has nineteen fields grouped into five categories: who is asking, what is being called, what is being asked for, which version of the world, and what the input was." style="margin:2.25rem 0">
<svg viewBox="0 0 760 392" width="100%" style="max-width:760px;height:auto;font-family:Commissioner,system-ui,sans-serif">
  <text x="20" y="16" font-size="10.5" font-weight="700" fill="#5d4632" letter-spacing="0.08em">AN HTTP CACHE KEYS ON</text>
  <rect x="20" y="26" width="470" height="26" rx="4" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="32" y="43" font-size="10.5" font-family="ui-monospace,monospace" fill="#211a12">https://api.example.com/rates?base=USD</text>
  <text x="502" y="43" font-size="10.5" fill="#5d4632">+ whatever <tspan font-family="ui-monospace,monospace">Vary</tspan> names</text>
  <text x="20" y="82" font-size="10.5" font-weight="700" fill="#5d4632" letter-spacing="0.08em">A VGI RESULT CACHE KEYS ON</text>
  <!-- band 1 -->
  <rect x="20" y="92" width="720" height="42" rx="4" fill="#faf7f0" stroke="#cfc4ad"/>
  <rect x="20" y="92" width="4" height="42" fill="#c08e2f"/>
  <text x="36" y="110" font-size="11" font-weight="600" fill="#211a12">Who is asking</text>
  <text x="36" y="125" font-size="9" fill="#5d4632">a security boundary</text>
  <rect x="196" y="103" width="90" height="20" rx="3" fill="#f6ddab"/><text x="241" y="117" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">identity_scope</text>
  <rect x="294" y="103" width="94" height="20" rx="3" fill="#f6ddab"/><text x="341" y="117" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">attach_options</text>
  <!-- band 2 -->
  <rect x="20" y="140" width="720" height="42" rx="4" fill="#faf7f0" stroke="#cfc4ad"/>
  <rect x="20" y="140" width="4" height="42" fill="#7a9a54"/>
  <text x="36" y="158" font-size="11" font-weight="600" fill="#211a12">What is being called</text>
  <text x="36" y="173" font-size="9" fill="#5d4632">canonicalized, not raw</text>
  <rect x="196" y="151" width="74" height="20" rx="3" fill="#dee8d1"/><text x="233" y="165" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">worker_path</text>
  <rect x="278" y="151" width="76" height="20" rx="3" fill="#dee8d1"/><text x="316" y="165" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">schema_name</text>
  <rect x="362" y="151" width="84" height="20" rx="3" fill="#dee8d1"/><text x="404" y="165" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">function_name</text>
  <rect x="454" y="151" width="118" height="20" rx="3" fill="#dee8d1"/><text x="513" y="165" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">canonical_arguments</text>
  <rect x="580" y="151" width="112" height="20" rx="3" fill="#dee8d1"/><text x="636" y="165" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">canonical_settings</text>
  <!-- band 3 -->
  <rect x="20" y="188" width="720" height="42" rx="4" fill="#faf7f0" stroke="#cfc4ad"/>
  <rect x="20" y="188" width="4" height="42" fill="#8a9a6b"/>
  <text x="36" y="206" font-size="11" font-weight="600" fill="#211a12">What is being asked for</text>
  <text x="36" y="221" font-size="9" fill="#5d4632">pushdown is part of the key</text>
  <rect x="196" y="199" width="68" height="20" rx="3" fill="#e0e5d3"/><text x="230" y="213" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">projection</text>
  <rect x="272" y="199" width="80" height="20" rx="3" fill="#e0e5d3"/><text x="312" y="213" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">filter_bytes</text>
  <rect x="360" y="199" width="88" height="20" rx="3" fill="#e0e5d3"/><text x="404" y="213" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">order_by_hint</text>
  <rect x="456" y="199" width="76" height="20" rx="3" fill="#e0e5d3"/><text x="494" y="213" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">sample_hint</text>
  <!-- band 4 -->
  <rect x="20" y="236" width="720" height="64" rx="4" fill="#faf7f0" stroke="#cfc4ad"/>
  <rect x="20" y="236" width="4" height="64" fill="#a9825a"/>
  <text x="36" y="258" font-size="11" font-weight="600" fill="#211a12">Which version of the world</text>
  <text x="36" y="273" font-size="9" fill="#5d4632">the invalidation dimensions</text>
  <rect x="196" y="245" width="128" height="20" rx="3" fill="#e6dbc2"/><text x="260" y="259" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">attached_data_version</text>
  <rect x="332" y="245" width="136" height="20" rx="3" fill="#e6dbc2"/><text x="400" y="259" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">implementation_version</text>
  <rect x="476" y="245" width="96" height="20" rx="3" fill="#e6dbc2"/><text x="524" y="259" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">catalog_version</text>
  <rect x="196" y="271" width="52" height="20" rx="3" fill="#e6dbc2"/><text x="222" y="285" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">at_unit</text>
  <rect x="256" y="271" width="58" height="20" rx="3" fill="#e6dbc2"/><text x="285" y="285" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">at_value</text>
  <rect x="322" y="271" width="92" height="20" rx="3" fill="#e6dbc2"/><text x="368" y="285" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">transaction_id</text>
  <!-- band 5 -->
  <rect x="20" y="306" width="720" height="42" rx="4" fill="#faf7f0" stroke="#cfc4ad"/>
  <rect x="20" y="306" width="4" height="42" fill="#5d6b46"/>
  <text x="36" y="324" font-size="11" font-weight="600" fill="#211a12">What the input was</text>
  <text x="36" y="339" font-size="9" fill="#5d4632">empty for producer scans</text>
  <rect x="196" y="317" width="70" height="20" rx="3" fill="#e0e5d3"/><text x="231" y="331" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">input_hash</text>
  <rect x="274" y="317" width="66" height="20" rx="3" fill="#e0e5d3"/><text x="307" y="331" font-size="9" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">shape_key</text>
  <text x="20" y="372" font-size="9.5" fill="#5d4632">All nineteen are equality-matched. The 64-bit hash is only a bucket; a SHA-256 over every field is the on-disk name, re-verified on load.</text>
</svg>
<figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">Nineteen fields, in five groups. Adding a field is cheap and safe — worst case you miss a hit you could have had. Missing one is a correctness bug, and every one of the last three fields added was added because it was missing.</figcaption>
</figure>

A few of those deserve explanation, because each one is a bug we either found or nearly shipped.

**`identity_scope` is a security boundary, not a partitioning convenience.** It is the catalog alias plus a fingerprint of the caller's actual auth principal: for OAuth, a salted hash of the exact bearer credential presented to the resource server; for static bearer auth, a separately salted hash of the token; `anon` when there is no auth at all. Two `ATTACH`es of the same alias, same worker, same arguments under different bearer identities therefore *cannot* share an entry, because without that field one principal's rows would be served to another.

Note what is deliberately *not* in there: decoded `id_token` claims. VGI exposes those as unverified display hints, and using attacker-controllable JWT payload bytes as a cache-isolation boundary would be an excellent way to hand someone else's data out. And when the identity is configured but not yet resolvable — an OAuth catalog that hasn't completed its flow at bind time — the fingerprint comes back empty and the scan is refused caching entirely (`ineligible_reason=identity_unresolved`). Fail closed. An ambiguous principal is not a principal.

The same instinct governs secrets. As of last week, a function that declares any secret dependency is excluded from the cache outright, on both the producer and exchange paths. Secret values are never serialized into a key and never retained — but a result that *depends* on one is sensitive to rotation and revocation in a way no TTL models, so the honest move is to not cache it.

**`schema_name` was missing, and that was a real bug.** A function name is only unique within a schema. Two same-named functions in different schemas of one catalog are different functions, but without this field their keys were byte-identical — `identity_scope` is catalog-plus-auth and `function_name` is the bare name — so one schema's memoized result would cross-serve the other. It is the caching-layer twin of a dispatch bug, and it looks like nothing until it looks like data corruption.

**`shape_key` closed a near-miss.** The same function can be reachable as a scalar and through a correlated `LATERAL`. Those are different operators with different output shapes, and for a while their static keys were separated only by an accident: the two paths happened to encode their canonical arguments incompatibly. A function with no const arguments and no projection pushdown would have produced byte-identical keys from both, and one shape's memo would have been served to the other. The fix is a one-word discriminator (`scalar` / `lateral` / `stream` / `buffered`) in the key. The lesson is that "these can't collide because their encodings differ" is not an invariant, it's a coincidence.

**Pushdown is in the key rather than handled by post-filtering.** This one is forced by how engines push filters. When a predicate is pushed *into* a scan, the engine generally does not re-apply it above the scan — it trusts the scan to have honoured it, which is the entire point of pushing it down. (In DuckDB, `PhysicalTableScan` hands the function's chunk straight up.) So a cache serve must be **row-exact**. It can never be a superset that gets filtered down afterwards, because nothing will filter it. That rules out the tempting design where you cache the full scan once and serve every filtered variant from it, and it is why `filter_bytes`, `projection`, `order_by_hint` and `sample_hint` are all key components: a filtered scan caches under a key that includes its filter and can only ever be served to an identically-filtered scan.

Two classes of pushdown disable caching rather than joining the key. **Dynamic filters** — join-key `IN` sets, Top-N thresholds — arrive as ticks *during* the scan, so there is no stable key at the moment the decision has to be made. And an **unseeded `TABLESAMPLE`** is non-deterministic by definition; freezing one answer forever would be a wrong answer forever.

The complete list of reasons a scan gets no cache at all, all of them observable in `duckdb_logs`:

| `ineligible_reason` | Why |
|---|---|
| `disabled_global` / `disabled_attach` | `SET vgi_result_cache=false`, or `ATTACH … (cache false)` |
| `secret_dependent` | The function declares required secrets |
| `identity_unresolved` | Auth configured but no resolvable principal — fail closed |
| `unknown_version` | The catalog version is 0, so version-bump invalidation can't work |
| `dynamic_filter` | Join-key `IN` / Top-N pushdown; no stable key at decision time |
| `unserializable_filter` | The filter serializer can't represent it — fail closed |
| `unseeded_sample` | Non-deterministic |
| `not_vgi` | Not a VGI catalog |

Canonicalization does the quiet work underneath all of this. The settings map is serialized in sorted key order, not iteration order. Argument encodings are canonical rather than raw wire framing. Per-row and per-tuple keys go through a canonical NULL-aware sort-key encoding — `CreateSortKey` in the DuckDB client — which produces a comparable byte blob for any type — so `NULL` and `'NULL'` and an empty string are three different keys, in every type, without anyone having to remember that.

## How big is a reusable answer?

This is the question HTTP never had to ask. A URL names one resource; the resource is the unit; done.

A query is not like that. Consider `SELECT * FROM enrich(orders.country) …` running over ten million rows. What, exactly, is the reusable thing? The entire result? The output for one 2,048-row input chunk? The output for one *country*? All three are true simultaneously, they have wildly different hit rates, and they cost wildly different amounts to store.

VGI ended up with six granularities across two families.

| Family | Unit | Key discriminator | Input hash |
|---|---|---|---|
| Producer — table function | the **whole scan** | — | none (static key only) |
| Producer — partitioned scan | one **partition value** | `p:` prefix | `sha256(CreateSortKey(partition tuple))` |
| Exchange — streaming map | one **input batch** | `input_hash` | ordered: SHA-256 of the batch's Arrow IPC framing |
| Exchange — correlated `LATERAL` | one **input chunk** | `input_hash` | unordered: sorted multiset of per-row sort keys |
| Exchange — buffered | the **whole input** | `input_hash` | additive two-lane 64-bit fold |
| Per-value memo | one **input tuple** | arena slot | the raw sort-key blob itself |

The three input hashes are different on purpose, and the reason each one is the way it is comes straight from the operator's semantics.

The **streaming map** is positionally aligned: output row *i* corresponds to input row *i*. Identical ordered bytes therefore mean an identical result, so the hash is just SHA-256 over the batch's deterministic IPC framing. This has a pleasant safety property — if two logically-equal batches happen to frame differently, the hashes differ and you get a *miss*. Divergent framing can cost you a hit; it can never buy you a wrong one.

The **correlated `LATERAL`** operator is declared `NO_ORDER`, and its decorrelated input is a multiset, not a sequence. Hashing the bytes would make the cache miss on a chunk that is the same rows in a different order — which is most of them. So the hash is order-independent: canonical `CreateSortKey` blobs per row, sorted, then SHA-256 over the count and the length-prefixed blobs. It hashes the **full** chunk, not just the columns the worker sees, because the cached output has the correlated columns already stamped into it.

The **buffered** function is a reduce over the entire input, and its input arrives across many parallel sink threads. So the digest has to be mergeable: each thread folds its rows into a two-lane 64-bit accumulator, and the partials are combined by field-wise addition at `Combine`. Addition is associative and commutative — so the digest is independent of both chunk order and which thread saw which chunk — and unlike XOR it preserves duplicates, which for a multiset is the entire point.

The **per-value** tier drops the cryptographic hash altogether. Inside an arena that is already scoped to a verified static key, the raw sort-key blob *is* the slot key, compared by value. No SHA-256 per row, and no collisions by construction.

### The layering, and the lesson in it

These tiers nest. For one input chunk, the runtime path is:

<figure role="img" aria-label="Flow for one input chunk: probe the whole-chunk key; on a hit, replay one cached batch. On a miss, deduplicate to K distinct tuples, probe K per-value slots; if all hit, gather from the arena; otherwise ship only the missing tuples to the worker, store the results, and scatter back to the full chunk." style="margin:2.25rem 0">
<svg viewBox="0 0 760 424" width="100%" style="max-width:700px;height:auto;font-family:Commissioner,system-ui,sans-serif">
  <defs>
    <marker id="fa" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#5d4632"/></marker>
    <marker id="fg" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#45632f"/></marker>
  </defs>
  <rect x="60" y="16" width="300" height="38" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="210" y="40" font-size="12" fill="#211a12" text-anchor="middle">Input chunk — 2,048 rows</text>
  <line x1="210" y1="54" x2="210" y2="74" stroke="#5d4632" marker-end="url(#fa)"/>
  <rect x="60" y="78" width="300" height="42" rx="5" fill="#e0e5d3" stroke="#8a9a6b"/>
  <text x="210" y="96" font-size="12" font-weight="600" fill="#211a12" text-anchor="middle">Probe the whole-chunk key</text>
  <text x="210" y="111" font-size="10" fill="#3b4630" text-anchor="middle">one lookup, coarse</text>
  <line x1="360" y1="99" x2="446" y2="99" stroke="#45632f" marker-end="url(#fg)"/>
  <text x="403" y="93" font-size="9" font-weight="700" fill="#45632f" text-anchor="middle">HIT</text>
  <rect x="452" y="78" width="248" height="42" rx="5" fill="#dee8d1" stroke="#7a9a54"/>
  <text x="576" y="96" font-size="11.5" fill="#211a12" text-anchor="middle">Replay one cached batch</text>
  <text x="576" y="111" font-size="10" fill="#3b5626" text-anchor="middle">a single IPC decode</text>
  <line x1="210" y1="120" x2="210" y2="140" stroke="#5d4632" marker-end="url(#fa)"/>
  <text x="228" y="135" font-size="9" font-weight="700" fill="#5d4632">MISS</text>
  <rect x="60" y="144" width="300" height="42" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="210" y="162" font-size="12" font-weight="600" fill="#211a12" text-anchor="middle">Deduplicate the input</text>
  <text x="210" y="177" font-size="10" fill="#5d4632" text-anchor="middle">2,048 rows → K distinct tuples</text>
  <line x1="210" y1="186" x2="210" y2="206" stroke="#5d4632" marker-end="url(#fa)"/>
  <rect x="60" y="210" width="300" height="42" rx="5" fill="#e0e5d3" stroke="#8a9a6b"/>
  <text x="210" y="228" font-size="12" font-weight="600" fill="#211a12" text-anchor="middle">Probe K per-value slots</text>
  <text x="210" y="243" font-size="10" fill="#3b4630" text-anchor="middle">one shared-lock read of the arena</text>
  <line x1="360" y1="231" x2="446" y2="231" stroke="#45632f" marker-end="url(#fg)"/>
  <text x="403" y="225" font-size="9" font-weight="700" fill="#45632f" text-anchor="middle">ALL HIT</text>
  <rect x="452" y="210" width="248" height="42" rx="5" fill="#dee8d1" stroke="#7a9a54"/>
  <text x="576" y="228" font-size="11.5" fill="#211a12" text-anchor="middle">One gather from the arena</text>
  <text x="576" y="243" font-size="10" fill="#3b5626" text-anchor="middle">the worker is never called</text>
  <line x1="210" y1="252" x2="210" y2="272" stroke="#5d4632" marker-end="url(#fa)"/>
  <text x="228" y="267" font-size="9" font-weight="700" fill="#5d4632">SOME MISS</text>
  <rect x="60" y="276" width="300" height="42" rx="5" fill="#f6ddab" stroke="#c08e2f"/>
  <text x="210" y="294" font-size="12" font-weight="600" fill="#211a12" text-anchor="middle">Ship only the missing tuples</text>
  <text x="210" y="309" font-size="10" fill="#5a3c22" text-anchor="middle">the worker sees the misses, not the chunk</text>
  <line x1="210" y1="318" x2="210" y2="338" stroke="#5d4632" marker-end="url(#fa)"/>
  <rect x="60" y="342" width="300" height="42" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="210" y="360" font-size="12" font-weight="600" fill="#211a12" text-anchor="middle">Splice, store, scatter</text>
  <text x="210" y="375" font-size="10" fill="#5d4632" text-anchor="middle">arena append + coarse entry, K → 2,048</text>
  <text x="452" y="300" font-size="9.5" fill="#5d4632">A partial hit still counts as a</text>
  <text x="452" y="313" font-size="9.5" fill="#5d4632">MISS for the hit-rate counters —</text>
  <text x="452" y="326" font-size="9.5" fill="#5d4632">the worker did run. The saving</text>
  <text x="452" y="339" font-size="9.5" fill="#5d4632">shows up as a smaller input.</text>
</svg>
<figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">Coarse to fine, with two short-circuits. The chunk is one engine vector — 2,048 rows in DuckDB. Deduplication (2,048 rows → K distinct tuples) is a pure compute win that runs whether or not anything is cached: an engine will not do it for a remote function it must treat as volatile, so the client does.</figcaption>
</figure>

We got the interaction between two of these tiers wrong at first, in an instructive way. The reasoning went: if the per-value tier has memoized every value in a chunk, the coarse whole-chunk entry is redundant, so don't store it. That is true about *coverage* and completely wrong about *cost*. Serving a chunk from the coarse entry is **one** decode. Reassembling the same rows from per-value slots is K decodes plus a K-way concatenation. Suppressing the coarse entry made the warm path about **fourteen times slower**. The coarse entry is now always stored when eligible, and the setting that used to gate it survives as a documented no-op so nobody's existing script errors.

The two tiers are not substitutes. The chunk cache answers *"I have seen this exact chunk before."* The per-value cache answers *"I have seen this value before, in some other chunk, in some other query, possibly in some other process."* Those are different questions and both are worth answering.

## What the local store actually looks like

Here is where being an Arrow protocol pays for itself, and it is worth being precise about why.

VGI workers return **Arrow record batches**, not rows. That single fact determines nearly everything about the cache's design. The unit of storage is a self-contained Arrow IPC stream for one batch — schema, batch, and `custom_metadata` in one blob. Capturing a result is not a transformation; it is framing bytes the worker already produced in the shape they were already in. Serving one is handing those bytes back through the *same* interface the live worker uses: `CachedReplayConnection` implements VGI's `IFunctionConnection`, so `InitLocal`, `GetNextBatch` and `InstallBatch` run completely unchanged and the scan operator never learns whether there was a worker on the other end.

If VGI returned rows, every one of those steps would be a conversion, and the cache would be a second materialization format to keep in sync with the first. Instead the cached form *is* the wire form.

### The memory tier

A cached result is a set of per-thread substreams — parallel capture fans out exactly the way the scan does — each an ordered vector of batches, flattened on serve and sorted by `batch_index` when the producer supplied one. Serving is single-threaded by design; the work has already been done.

The commit is **all-or-nothing**. Batches accumulate during the scan and are only published in the global-state destructor, and only if every launched producer reached end-of-stream. A mid-scan error, an external resolution failure, a cancelled query — any of them leaves `eos < launched` and nothing is committed. There is no code path that stores a partial result, which matters because a partial result in a cache is indistinguishable from a complete one at lookup time.

Four bounds keep it honest: a global byte cap (256 MB), a per-entry cap (64 MB), an entry-count cap (131,072 — because ~700,000 tiny entries fit under the byte cap and the reaper walks are O(N)), and a process-global *in-flight* capture budget, because N concurrent captures otherwise peak at N × the per-entry cap.

### The disk tier

Opt-in, content-addressed, and sharded per identity:

```text
<dir>/<sha256(identity_scope)>/
    objects/<content_sha>.vrc      # immutable blob: "VRC1" magic + batch records to EOF
    refs/<key_fingerprint>.ref     # key -> content sha, ttl, validators, byte counts
    packs/<selfid>-<seq>.vpack     # append-only container for small exchange memos
    packs/<selfid>-<seq>.vidx      # rebuildable index over the pack
```

The ref filename is a SHA-256 over all nineteen key fields, and the ref stores that fingerprint again for the loader to re-verify — so a 64-bit bucket collision can never cross-serve. The loader validates that `content` is 64 hex characters before joining it into a path, and re-hashes the blob against its own name, so a corrupt or tampered object is a clean miss rather than a poisoned serve.

Sharding by identity rather than mixing everything into one content-addressed pool is a security decision, not a filesystem one. A shared pool would dedupe identical objects across tenants, which turns the store into an existence oracle: write your guess, observe whether it collided. Per-identity shards eliminate that, and they make flushing one catalog an O(1) subtree removal that structurally cannot touch another tenant's same-aliased refs.

**Compression is per batch, not per blob**, and that choice was forced. Whole-blob zstd compresses better — 4.10× versus 2.85× on mixed data, a real 44% edge — but a single compressed stream cannot be positioned into, and positioned reads are the only reason a result larger than RAM can be served at all. So each batch stays an independently compressed unit. We use Arrow's built-in IPC buffer compression rather than wrapping the bytes ourselves, which means the codec rides inside the message and `RecordBatchStreamReader` decompresses transparently: the entire read side — materializing load, streaming load, replay connection — did not change by a single line. A directory can hold a mix of codecs, and flipping the setting off still reads everything already written.

Measured on 100 batches × 24,000 rows with distinct data per batch, so there's no artificial cross-batch dedup:

| Data shape | Raw | Per-batch zstd | Ratio |
|---|--:|--:|--:|
| `seq int64` | 19.2 MB | 2.48 MB | **7.7×** |
| `mixed` (string categorical / float / int id) | 52.8 MB | 18.6 MB | **2.85×** |
| `random int64` (worst case) | 19.2 MB | 19.2 MB | 1.0× |

The memory tier is never compressed. Hot-path decompression buys nothing when the bytes are already resident.

**Large results spill instead of aborting.** Capture buffers in RAM up to the per-entry cap; past it, batches are appended straight to a disk blob, hashed incrementally so the object stays content-addressed without ever holding the whole thing in memory. A 1.94 GB result caches at about **125 MB** peak RSS — it used to need ~4.2 GB, buffering everything then serializing a copy — and serves back at about **33 MB**, because the streaming serve reads only the header and a per-batch table of contents at load and then positioned-reads one batch at a time. Positioned `pread`, deliberately, not `mmap`: replay is a single sequential pass, so `mmap`'s random-access and zero-copy advantages don't apply, and it would hand the engine Arrow buffers whose lifetime collides with a leaked singleton's teardown.

**Small entries get packed.** The loose-object store is excellent for a handful of large producer results and pathological for the exchange paths, which memoize per 2,048-row chunk: one query can mint thousands of memos, each costing two files where filesystem metadata dwarfs the payload. Every mature cache reached the same conclusion here — Chromium's blockfile cache packs small responses into block files, Squid abandoned file-per-object for its Rock store, and git packs loose objects into packfiles plus an index. So small exchange memos go into append-only per-process pack files with a rebuildable index; each process writes only its own packs and reads everyone's; and the reaper walks the in-memory index rather than the directory, compacting a pack once half its bytes are dead. Producer entries never pack — few and large is exactly what the loose store is good at.

### The per-value arena — where the format really mattered

The per-value tier was first built the obvious way: one cache entry per memoized value, payload a self-contained IPC stream. It worked, and it was a memory-safety defect.

Holding an **8-byte** result cost about **6,337 bytes** of RSS — a self-contained IPC stream plus a doubly-stored nineteen-field key. That's a 21× under-count against the cache's own accounting, which means the byte cap could never fire: the real ceiling at default settings was around 830 MB against a nominal 256 MB budget. And serving K values cost K stream decodes plus a K-way concat.

The fix was to stop storing values individually and store them **columnar**, which is what they were in the first place:

<figure role="img" aria-label="The per-value memo arena: a contiguous base Arrow record batch of rows zero through seven plus a coalesced tail, with a slot map assigning each input sort-key blob a contiguous row range. One slot has length zero, a negative memo." style="margin:2.25rem 0">
<svg viewBox="0 0 760 244" width="100%" style="max-width:760px;height:auto;font-family:Commissioner,system-ui,sans-serif">
  <text x="20" y="18" font-size="10.5" font-weight="700" fill="#5d4632" letter-spacing="0.08em">SLOT MAP — raw sort-key blob → {row range, expiry, validator}</text>
  <!-- brackets -->
  <g stroke="#8a5f38" fill="none" stroke-width="1.2">
    <path d="M40,64 L40,52 L228,52 L228,64"/>
    <path d="M236,64 L236,52 L292,52 L292,64"/>
    <path d="M300,64 L300,52 L552,52 L552,64"/>
    <path d="M560,64 L560,52 L616,52 L616,64"/>
  </g>
  <text x="134" y="46" font-size="9.5" font-family="ui-monospace,monospace" fill="#5a3c22" text-anchor="middle">"US" → 0..2</text>
  <text x="264" y="46" font-size="9.5" font-family="ui-monospace,monospace" fill="#5a3c22" text-anchor="middle">"GB" → 3</text>
  <text x="426" y="46" font-size="9.5" font-family="ui-monospace,monospace" fill="#5a3c22" text-anchor="middle">"JP" → 4..7</text>
  <text x="588" y="46" font-size="9.5" font-family="ui-monospace,monospace" fill="#5a3c22" text-anchor="middle">"DE" → 8</text>
  <line x1="656" y1="52" x2="656" y2="64" stroke="#a9825a" stroke-width="1.2" stroke-dasharray="2 2"/>
  <text x="700" y="46" font-size="9.5" font-family="ui-monospace,monospace" fill="#7d5714" text-anchor="middle">"ZZ" → len 0</text>
  <!-- cells -->
  <g>
    <rect x="40" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="104" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="168" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="232" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="296" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="360" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="424" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="488" y="68" width="60" height="40" rx="3" fill="#dee8d1" stroke="#7a9a54"/>
    <rect x="556" y="68" width="60" height="40" rx="3" fill="#f6ddab" stroke="#c08e2f"/>
  </g>
  <g font-size="10" font-family="ui-monospace,monospace" fill="#211a12" text-anchor="middle">
    <text x="70" y="93">row 0</text><text x="134" y="93">row 1</text><text x="198" y="93">row 2</text>
    <text x="262" y="93">row 3</text><text x="326" y="93">row 4</text><text x="390" y="93">row 5</text>
    <text x="454" y="93">row 6</text><text x="518" y="93">row 7</text><text x="586" y="93">row 8</text>
  </g>
  <rect x="640" y="68" width="112" height="40" rx="3" fill="#faf7f0" stroke="#cfc4ad" stroke-dasharray="3 3"/>
  <text x="696" y="86" font-size="9.5" fill="#5d4632" text-anchor="middle">no rows</text>
  <text x="696" y="99" font-size="9.5" fill="#5d4632" text-anchor="middle">negative memo</text>
  <!-- braces -->
  <path d="M40,116 L40,124 L548,124 L548,116" fill="none" stroke="#5d4632"/>
  <text x="294" y="140" font-size="11" font-weight="600" fill="#211a12" text-anchor="middle">BASE — one contiguous Arrow RecordBatch</text>
  <path d="M556,116 L556,124 L616,124 L616,116" fill="none" stroke="#5d4632"/>
  <text x="586" y="140" font-size="11" font-weight="600" fill="#211a12" text-anchor="middle">TAIL</text>
  <text x="586" y="154" font-size="9.5" fill="#5d4632" text-anchor="middle">appends</text>
  <line x1="20" y1="172" x2="740" y2="172" stroke="#cfc4ad"/>
  <text x="20" y="192" font-size="10.5" fill="#211a12"><tspan font-weight="600">Serve K values:</tspan> one gather. A single Arrow <tspan font-family="ui-monospace,monospace">Take</tspan> when every hit is in the base, otherwise a bounded two-source</text>
  <text x="20" y="207" font-size="10.5" fill="#211a12">base+tail gather. Never O(arena).</text>
  <text x="20" y="228" font-size="10.5" fill="#211a12"><tspan font-weight="600">Store a chunk's misses:</tspan> one append plus slot inserts, first-writer-wins. A slot is never split across the boundary.</text>
</svg>
<figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">All of one function's per-value memos live in a single arena keyed by the static-key fingerprint. The slot key is the raw NULL-aware sort-key blob compared by value — no per-row digest, no collision. A slot of length 0 is a legitimate <em>negative memo</em>: this value produced no rows, and that is worth remembering too.</figcaption>
</figure>

The arenas live in their own process-wide registry with their own byte budget and whole-arena LRU eviction — deliberately *not* in the main cache's LRU, whose whole-entry staleness reaper would misfire on a container holding thousands of slots with heterogeneous expiry.

Reads take a shared lock. All mutation — store, compaction, validator dedup, stale reclamation — takes the exclusive one, and a probe that finds a stale slot treats it as a miss and leaves it alone rather than mutating on the read path. We measured whether the single lock per arena was a bottleneck before adding sharding: at 40 million rows, total user CPU was flat across thread counts (+1.7% at 2 threads, +3.7% at 4) while wall time dropped from 1.06 s to 0.71 s. A first pass at 4 million rows appeared to show 4× CPU inflation, which turned out to be small-workload fixed cost rather than contention — exactly the artifact you'd expect, and a good reminder to size the benchmark before believing it.

The arena's disk backend is **SQLite in WAL mode**: one file, concurrent readers with a single writer across same-host processes, crash-safe, and TTL enforcement is a `WHERE` clause instead of a hand-rolled reaper. Persistence is off the hot path entirely — the backend is touched once per static key per process on a cold hydrate, and on stores, which are by definition misses. It measures about 200,000 stores per second, which is irrelevant next to a worker call expensive enough to be worth memoizing at all. Size is capped with an LRU whose live-size measure is `(page_count - freelist_count) * page_size`, an O(1) pragma pair that *shrinks* as rows are deleted, so evict-to-fit terminates without a `VACUUM`. Memoizing 300,000 distinct values under a 3 MB cap keeps the store at ~2.9 MB with ~5,600 rows retained — and the query result stays exactly correct, because an evicted value simply gets recomputed.

That backend is what makes a warm cache survive a restart. One process warms the values; a second, freshly started process with completely cold memory serves them all without the worker ever being called.

## Revalidation, which is the interesting half

TTLs are the boring part of HTTP caching. The interesting part is what happens when the TTL runs out and the answer *hasn't actually changed*, which — for the exchange-rate tables, reference data and slowly-changing dimensions people actually put behind remote functions — is most of the time.

A stale-but-`revalidatable` entry is probed *before* the ordinary lookup, because the ordinary lookup drops stale entries on sight. If the stored payload is large enough to be worth a round trip, the client sends `if_none_match` / `if_modified_since` and the worker answers one of two ways: a 0-row batch carrying `not_modified`, in which case the client slides the entry's TTL forward and replays the bytes it already had; or fresh data, in which case the normal capture path commits a replacement. Below the size threshold the client doesn't bother asking — a conditional request costs the same round trip as a refetch, so it only pays when the payload it saves is big.

This works identically on both transports, which took some doing. Over the subprocess transport the validators ride the first producer tick. Over HTTP the first producer turn folds into the `/init` request, so the validators attach to that request's metadata and the worker framework surfaces them to the producer's first `process()` call. The detection and consumption logic on the client is transport-agnostic; only the plumbing differs.

## What you are promising when you advertise

Every cache tier here rests on a contract the framework fundamentally cannot verify.

Advertising `vgi.cache.*` is a promise that **your output is a pure function of the keyed unit plus the static key dimensions** — the batch for a streaming map, the full chunk for `LATERAL`, the whole input multiset for a buffered reduce, the individual tuple for a per-value memo. A hit serves memoized output *without running your code*. A streaming map whose output depends on a running counter, a prior batch's carryover, the wall clock, or any per-connection accumulator will serve wrong rows on a hit, and no amount of cleverness on our side can detect that in general.

What we do enforce structurally: a scalar the engine marks volatile is never deduplicated or memoized — gated on DuckDB's `FunctionStability` in this client, and on whatever the equivalent declaration is in the next one. The shapes that are inherently stateful — anything with a `has_finalize`, the serial single-row scan path — never memoize per batch. A function's whole-input state is legitimately keyed by the whole-input digest, so buffered functions are safe by construction. And the never-partial commit means a function that fails halfway leaves nothing behind.

Everything else is your call, which is the same deal an origin server makes when it sets `max-age`.

## Knowing whether it worked

Caches that you cannot see into are how people end up not trusting caches. What follows is the DuckDB client's surface, and it is the most engine-specific section here — but the obligation it illustrates, that every hit, miss, store and refusal is nameable and queryable, is one every client should carry.

`EXPLAIN ANALYZE` labels the operators directly. A producer scan shows `Cache: hit (memory)` or `Cache: hit (disk_streaming)` or `Cache: miss`; an ineligible scan gets no line at all, so absence is informative. The `LATERAL` operator caches per chunk, so it reports a rate:

```text
Cache: 2 hit / 1 miss / 50 store (67% hit)
```

Below that, `vgi_result_cache()` lists every entry — function, scope, rows, bytes, age, TTL, tier, validators, hit count, on-disk codec, partition label — and `vgi_result_cache_stats()` carries the process-global counters, including the ones the background reaper produces (evictions and capture aborts emit no log events, since the reaper has no client context to log into). Every scan-thread decision emits a `result_cache.*` event queryable from `duckdb_logs`, with a `reason` on every refusal. And `vgi_result_cache_reap(advance_seconds := N)` runs a synchronous, clock-injected cleanup pass, which is how the expiry and eviction behaviour is tested deterministically rather than by sleeping.

## When not to turn it on

The per-value tier is the one that needs a warning label, and it ships **off** unless a worker explicitly asks for it.

A per-value serve costs a slot probe, a decode, and an assembly step for each distinct value. That only pays back when it is cheaper than calling you. Measured against a trivial arithmetic map it is roughly **50× slower** than simply doing the arithmetic. It is built for model inference, geocoding, entity enrichment, and rate-limited remote fetches — cases where one call costs milliseconds or money. The `vgi_result_cache_per_value` setting is a *ceiling*, not a switch: setting it false vetoes the tier even for a worker that asks, but setting it true enables nothing on its own. Only the function author can judge whether a call is expensive enough, so only the function author can turn it on.

Two more honest limits. A genuinely high-cardinality input — millions of distinct values that rarely repeat — will churn the tier for little benefit; a per-chunk store cap and the entry-count cap bound the damage, but the right answer there is usually deduplication alone. And a correlated `LATERAL` on a bare column, `FROM t, f(t.x)`, gets nothing from per-value memoization, because DuckDB's delimiter join has already deduplicated the input before the operator ever sees it — an engine that decorrelates differently will draw that line somewhere else. Per-value earns its keep on *expression* arguments — `f(lower(t.x))` — where the delim join can't help, and on value reuse across chunks and queries and processes.

---

Fifty-three integration test files later, the summary is short. A VGI worker can now tell whatever engine called it how long its answer is good for and how to check whether it is still good, in a vocabulary the industry settled on in 1997. The client that exists today will hold the answer in memory, spill it to disk if it is enormous, pack it if it is tiny, compress it if it will compress, remember individual values across restarts, and never — under any auth configuration, catalog version, filter pushdown, or transaction scope we could construct — serve it to a query that asked a different question. The next client will make its own choices about every one of those, and no worker will have to change.

It is the same bet engines already make on their file caches, one layer up: the same data gets queried more than once, and the second time should be nearly free.

If you write VGI workers, the how-to for your language is the place to start: [Python](/vgi/docs/python/how-to/result-caching/), [TypeScript](/vgi/docs/typescript/how-to/result-caching/), [Go](/vgi/docs/go/how-to/result-caching/), [Rust](/vgi/docs/rust/how-to/result-caching/).
