---
title: "Bringing HTTP’s caching rules to DuckDB functions with VGI"
description: "A data service can tell DuckDB how long an answer is safe to reuse, so repeated queries can skip another API call. Our benchmarks show when that saves time—and when caching costs more than it saves."
pubDate: 2026-09-25
author: 'Query.Farm Team'
tags: ["VGI", "DuckDB", "Caching", "Arrow"]
draft: false
showTableOfContents: false
heroImage: "/media/posts/cache-control-for-remote-functions/social.png"
leadVisual:
  src: "/blog/cache-control-for-remote-functions/cache-bezier-lead.svg"
  alt: "Repeated agent queries enter DuckDB's client cache. Green Bézier paths reuse an eligible result without another service call; ochre paths visit an API-backed worker marked with the VGI logo."
  width: 720
  height: 228
---

You ask an AI agent to compare sales across countries. It looks up exchange rates, tries a query, and revises the analysis after a follow-up question. The SQL changes, but the exchange rates it needs may be exactly the ones it fetched a moment ago. Calling the service again adds another wait, and possibly another charge, without giving the agent any new information.

[VGI](/vgi), the Vector Gateway Interface, makes services like this available to DuckDB as SQL functions. Imagine `rates.rates()` returns exchange rates in US dollars. An agent might inspect those rates before joining them to your sales:

```sql
-- Inspect the exchange rates.
SELECT currency, rate FROM rates.rates();

-- Use them to compare sales across countries.
SELECT country, sum(amount * rate) AS sales_usd
FROM sales
JOIN rates.rates() USING (currency)
GROUP BY country;
```

Both queries ask for the same rates. If the service allows those rates to be reused for five minutes, DuckDB's VGI client can keep the first answer and use it again. **The second query can reuse the rates even though the SQL has changed.** DuckDB still reads the sales and calculates the totals; the saving comes from avoiding another trip to the rates service.

But how does DuckDB know that five minutes is acceptable? The code providing the rates—a VGI **worker**—has to say so. That is the part we borrow from HTTP caching: the provider tells the caller how long an answer is good for. An agent can explore different questions using that answer, while the service controls when it needs to be fetched again.

## Where HTTP-style caching fits

SQL engines already have caches. DuckDB's [external file cache](https://duckdb.org/2025/05/21/announcing-duckdb-130#external-file-cache), for example, can reduce repeat reads from remote files. What an arbitrary API-backed function still needs is a contract for reusing its *result*: how long it is valid, who may reuse it, and how to check whether it has changed. VGI borrows that vocabulary from HTTP's [freshness rules in RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2) and [conditional requests in RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13).

An exchange-rate feed or weather service may have a useful answer between updates. A worker can give that answer a lifetime that suits the source, allowing repeated queries to share it. This is a choice the worker author makes: connecting an API through VGI does not automatically cache its results or copy its HTTP headers into a caching policy.

A time-based policy is a different contract from a transactional database read. [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html) and [MySQL's InnoDB](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html) determine which row versions a query can see through their transaction and snapshot rules. Keeping an arbitrary query result for five minutes cannot, by itself, preserve those guarantees. A service backed by either database could explicitly offer a cached snapshot, but a freshness window is not a substitute for the database's consistency rules.

The same reasoning applies to **scalar functions**, which return one value for each input row. Looking up coordinates for an address can involve an API request worth avoiding when that address appears again. Multiplying an integer by two is so cheap that checking a cache may take longer than doing the calculation. Repetition creates an opportunity to save work, but the cost of that work determines whether caching pays.

## What repeated queries can reuse

In the sales example, the reusable answer is the rate table. The sales totals can change independently, so storing the result of the entire query would miss the opportunity we care about. VGI keeps results at the function-call level, checking the inputs, request details, and caller before reusing them.

<div class="function-kind-description"><img src="/vgi/docs/assets/kinds/table.svg" width="66" height="40" alt="" /><p>A <a href="/vgi/docs/python/how-to/function-patterns/#table"><strong>table function</strong></a> produces rows, so a call that retrieves a rate table can reuse the complete result.</p></div>

<div class="function-kind-description"><img src="/vgi/docs/assets/kinds/scalar.svg" width="64" height="40" alt="" /><p>A <a href="/vgi/docs/python/how-to/function-patterns/#scalar"><strong>scalar function</strong></a> returns one value per input row, so repeated addresses can reuse individual geocoding answers even across different queries.</p></div>

<div class="function-kind-description"><img src="/vgi/docs/assets/kinds/table-in-out.svg" width="66" height="40" alt="" /><p>A <a href="/vgi/docs/python/how-to/function-patterns/#table-in-out"><strong>table-in/out function</strong></a> consumes rows and emits rows; its opportunities depend on whether it receives independent batches, correlated inputs, or the whole input together.</p></div>

The distinction matters when an agent changes the surrounding query but continues to ask about the same entities. A new batch of orders might contain many familiar addresses, even though that batch as a whole has never appeared before. Per-value reuse can avoid processing those addresses again, while a cache of complete batches alone would miss the repetition.

| Function type and call shape | Reusable unit | What a hit avoids |
|---|---|---|
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/table.svg" width="66" height="40" alt="" />Table function</span> `FROM rates()` | Complete scan | Producing and transferring the result again |
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/table.svg" width="66" height="40" alt="" />Partitioned table function</span> With `partition_scope=True` | Individual partition | Producing the cached partition |
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/scalar.svg" width="64" height="40" alt="" />Scalar</span> `SELECT geocode(address)` | Distinct input tuple, with `per_value=True` | Computing cached values; input scanning and output assembly remain |
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/table-in-out.svg" width="66" height="40" alt="" />Streaming table-in/out</span> `FROM enrich((SELECT …))` | Input batch | The worker exchange for that batch |
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/table-in-out.svg" width="66" height="40" alt="" />Correlated table-in/out</span> `FROM orders, LATERAL enrich(orders.country)` | Input chunk, plus distinct tuples when `per_value=True` | Chunk computation, or computation for cached tuples |
| <span class="function-kind-label"><img src="/vgi/docs/assets/kinds/buffering.svg" width="102" height="40" alt="" />Buffered table-in/out</span> | Whole input | Combine and final result production; input ingestion still runs |

Input order and duplicate counts can also affect the answer. A function that preserves row positions needs an order-sensitive input key, while an unordered operation may be able to match the same collection of rows in a different order. These rules must follow the function's behavior rather than assuming that every repeated-looking input is interchangeable.

## What the benchmarks show

We wanted to see both sides of that tradeoff: work expensive enough to justify a cache, and work where the cache gets in the way. We measured table, scalar, and table-in/out functions in **[Haybarn 1.5.5rc1](/products/haybarn/) with VGI 8f9571b**, using a local Python subprocess on an Apple M3. These are synthetic workloads, including simulated service waits, rather than measurements of live APIs or agents. The tables show median query time across seven trials, in milliseconds; lower is better.

<p class="benchmark-legend" aria-label="Benchmark color legend"><span class="benchmark-result benchmark-result--faster">Faster</span><span class="benchmark-result benchmark-result--neutral">About the same</span><span class="benchmark-result benchmark-result--slower">Slower</span></p>

Both cached columns are compared with **cache off**. Amber means within 10% of that baseline, a descriptive band rather than a statistical significance test. Ratios use the unrounded medians.

<h3 class="benchmark-group" id="benchmarks-table"><img src="/vgi/docs/assets/kinds/table.svg" width="66" height="40" alt="" />Table functions</h3>

| Workload | Rows | Cache off | Empty cache | Later queries |
|---|---:|---:|---:|---:|
| Generate integers | 32,768 | 2.4 | <span class="benchmark-result benchmark-result--neutral"><span>2.4</span><span class="benchmark-result__label">About the same</span></span> | <span class="benchmark-result benchmark-result--faster"><span>0.6</span><span class="benchmark-result__label">4.0× faster</span></span> |
| Same output, simulated 50 ms upstream wait | 32,768 | 63.1 | <span class="benchmark-result benchmark-result--neutral"><span>61.8</span><span class="benchmark-result__label">About the same</span></span> | <span class="benchmark-result benchmark-result--faster"><span>1.2</span><span class="benchmark-result__label">52.2× faster</span></span> |

<h3 class="benchmark-group" id="benchmarks-scalar"><img src="/vgi/docs/assets/kinds/scalar.svg" width="66" height="40" alt="" />Scalar functions</h3>

| Workload | Rows | Cache off | Empty cache | Later queries |
|---|---:|---:|---:|---:|
| Integer × 2, 128 repeating values | 65,536 | 5.0 | <span class="benchmark-result benchmark-result--faster"><span>2.8</span><span class="benchmark-result__label">1.8× faster</span></span> | <span class="benchmark-result benchmark-result--faster"><span>2.7</span><span class="benchmark-result__label">1.8× faster</span></span> |
| Integer × 2, all distinct within each query | 65,536 | 7.4 | <span class="benchmark-result benchmark-result--slower"><span>10.5</span><span class="benchmark-result__label">1.4× slower</span></span> | <span class="benchmark-result benchmark-result--neutral"><span>7.5</span><span class="benchmark-result__label">About the same</span></span> |
| Integer × 2, fresh values on every query | 65,536 | 7.3 | <span class="benchmark-result benchmark-result--slower"><span>10.8</span><span class="benchmark-result__label">1.5× slower</span></span> | <span class="benchmark-result benchmark-result--slower"><span>24.2</span><span class="benchmark-result__label">3.3× slower</span></span> |
| CPU-heavy hash, 128 repeating values | 32,768 | 62.5 | <span class="benchmark-result benchmark-result--faster"><span>5.8</span><span class="benchmark-result__label">10.7× faster</span></span> | <span class="benchmark-result benchmark-result--faster"><span>1.8</span><span class="benchmark-result__label">34.0× faster</span></span> |

<h3 class="benchmark-group" id="benchmarks-table-in-out"><img src="/vgi/docs/assets/kinds/table-in-out.svg" width="66" height="40" alt="" />Table-in/out functions</h3>

| Workload | Rows | Cache off | Empty cache | Later queries |
|---|---:|---:|---:|---:|
| Streaming: passthrough | 65,536 | 254.5 | <span class="benchmark-result benchmark-result--neutral"><span>258.1</span><span class="benchmark-result__label">About the same</span></span> | <span class="benchmark-result benchmark-result--neutral"><span>254.6</span><span class="benchmark-result__label">About the same</span></span> |
| Streaming: simulated 5 ms wait per batch | 65,536 | 464.6 | <span class="benchmark-result benchmark-result--neutral"><span>489.0</span><span class="benchmark-result__label">About the same</span></span> | <span class="benchmark-result benchmark-result--faster"><span>251.4</span><span class="benchmark-result__label">1.8× faster</span></span> |
| Correlated: CPU-heavy hash, 128 repeating values | 16,384 | 33.0 | <span class="benchmark-result benchmark-result--faster"><span>8.2</span><span class="benchmark-result__label">4.0× faster</span></span> | <span class="benchmark-result benchmark-result--faster"><span>3.0</span><span class="benchmark-result__label">10.9× faster</span></span> |

“Empty cache” excludes worker startup. “Later queries” follows ten untimed queries; every row except the fresh-values case reuses the same input. Cache counters confirmed hits on stable inputs and zero hits on fresh inputs. A cold scalar query can benefit immediately because later batches reuse values cached earlier in that query.

The hash performs 300 PBKDF2-HMAC-SHA256 iterations per distinct value. All runs use one engine thread, memory caching, and the default per-value store cap. Deduplication remains enabled with caching off. [The methodology, scripts, and raw samples](/benchmarks/vgi-result-cache/README.md) are available to reproduce the comparisons.

The expensive scalar function becomes about **34× faster** when later queries reuse its inputs, because a lookup replaces substantial computation. But cheap arithmetic over 65,536 distinct values is effectively tied, even when those values are already cached. When every query instead introduces fresh values, caching becomes about **3.3× slower**: the client pays for lookups and storage without avoiding any computation.

The streaming result is just as instructive. Passthrough sees almost no improvement even with all 32 batch-cache hits. Skipping those exchanges leaves the rest of the query's execution costs in place. Adding a 5 ms wait per batch makes reuse worthwhile, but the gain is about **1.8×**, not the scalar map's 34×. Function type, repeat rate, and avoided work all matter; a hit rate alone cannot tell you whether caching pays.

For the agent in our opening example, the saving would depend on the time spent fetching rates and how often it asks for them again. The benchmarks show why that is worth measuring: a high hit rate can remove a costly wait, or merely replace cheap work with bookkeeping.

## The worker advertises freshness

The client cannot infer a safe lifetime from the function name or its arguments. The worker therefore supplies a **time to live (TTL)** or an expiry time with its result. Here is the `process()` method of the `rates()` table function, returning sample exchange rates with a five-minute lifetime:

```python
import pyarrow as pa
from vgi.cache_control import CacheControl

# Inside the Rates table-function class:
@classmethod
def process(cls, params, state, out):
    rates = pa.record_batch({
        "currency": ["EUR", "GBP", "JPY"],
        "rate": [1.09, 1.27, 0.0067],
    })
    out.emit(rates, cache_control=CacheControl(ttl=300))
    out.finish()
```

The TTL borrows the freshness-lifetime idea from HTTP's [`max-age` directive](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.1). In VGI, the lifetime starts when the client has received the complete result. During that window, an eligible matching call can use the cached answer.

The policy travels with the table function's first output batch—the same batch that carries the rates. A Python scalar declares `CACHE_CONTROL = CacheControl(ttl=300, per_value=True)` on its `ScalarFunction` class, while a streaming table-in/out function attaches `cache_control` when emitting an output batch. They share the freshness vocabulary, but cache different units of work. The [complete Python worker example](/vgi/docs/python/how-to/result-caching/) includes the class definition and registration.

**VGI caching requires an explicit worker advertisement.** By default, that includes `ttl` or `expires`; `no_store` overrides either. HTTP also permits [heuristic caching](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2.2) in some circumstances, so VGI's default is deliberately stricter. Memory limits, catalog settings, and eligibility checks can still make the client decline to cache a result.

The worker also chooses a reuse scope. `catalog` permits reuse across transactions within the calling catalog identity, while `transaction` restricts reuse to the requesting transaction. These database boundaries are distinct from HTTP's `public` and `private` directives; they are part of deciding which calls may safely share an answer.

## When the TTL runs out

Expiry means the freshness promise has ended, but the underlying data may still be unchanged. Refetching an entire rate table in that case repeats work unnecessarily, so a worker that supports revalidation can offer a cheaper check.

The worker can include an [ETag](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3), such as `etag='"rates-v3"'`, to identify the result's version, and set `revalidatable=True` to offer that check.

On a supported path, the client sends its stored validator back as `if_none_match` or `if_modified_since`, borrowing HTTP's [`If-None-Match`](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2) and [`If-Modified-Since`](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.3) conditions. The worker either returns fresh data or emits a zero-row batch with `not_modified=True` and a renewed lifetime. The latter is analogous to HTTP's [`304 Not Modified`](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4.5): retain the stored rows and update their expiry.

The worker must implement that check. Setting `revalidatable=True` does not compare versions automatically, and an ETag must change when the corresponding result changes. A check also costs a round trip, so below its configured payload-size threshold the DuckDB client refetches instead. Split scans currently refetch expired results too; setting a TTL of zero does not guarantee a conditional request on every call.

[HTTP's RFC 5861](https://www.rfc-editor.org/rfc/rfc5861.html) inspired the `stale_while_revalidate` and `stale_if_error` fields, which describe serving stale data during a refresh or after a failure. The DuckDB implementation covered here parses those fields but does not yet use them to serve stale results.

## What makes two calls the same?

A freshness window is useful only if the cached answer belongs to the request being made. A rate table for another date, a result filtered for another customer, or data returned under different credentials is not interchangeable just because it has not expired.

HTTP uses the request method and URI, together with [headers named by `Vary`](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.1), to distinguish cached representations. The DuckDB VGI client needs a corresponding set of distinctions for function calls:

| Question | Key dimensions |
|---|---|
| Who is asking? | Catalog and authentication identity, attach options, secret fingerprints where required |
| What is being called? | Worker, schema, function, arguments, settings |
| What is being requested? | Projection, filters, ordering, sampling |
| Which version applies? | Catalog, data and implementation versions, time-travel options, transaction scope |
| What input is being processed? | Input digest and operator shape |

A concrete bug showed why this detail matters: a key that omitted the schema allowed two same-named functions in one catalog to share an entry. Including the schema made the key identify the function actually being called. Pushed-down filters need the same care, because an engine that delegates a filter to a worker may trust the returned rows without applying that filter again.

Identity matters just as much as the arguments. Two users asking for “my recent orders” must not receive each other's results. Workers can receive caller identity through `AuthContext`; the client separates entries using the calling catalog and authentication fingerprint. Secret-dependent results also need a fingerprint of the secrets resolved at bind time, and become ineligible if that fingerprint is unavailable. Raw secret values do not enter the key. Separate agent processes and different users do not automatically share one cache. Dynamic filters and unseeded samples are excluded because they do not provide a stable request to match at lookup time.

Matching the key still relies on the function author's promise that the output can be reused for that input and context. A function whose answer depends on an earlier batch, unkeyed external state, or a side effect cannot simply opt into per-value caching. Each tuple's answer must be independent of the other tuples in its batch, and volatile functions are excluded from deduplication and per-value reuse.

## Reusing part of an input

A finer-grained cache can help when only some inputs repeat, but the client must assemble cached and newly computed results into the right output. For an eligible correlated table-in/out call, it first checks whether the whole input chunk is cached. If that misses and per-value caching is enabled, it can gather the values it already has and send only the missing tuples to the worker. Scalar calls use the per-value tier without a whole-chunk cache.

<figure role="img" aria-label="Flow for one input chunk: probe the whole-chunk key; on a hit, replay one cached batch. On a miss, deduplicate to K distinct tuples, probe K per-value slots; if all hit, gather from the arena; otherwise ship only the missing tuples to the worker, store the results, and scatter back to the full chunk." style="margin:2.25rem 0">
<svg viewBox="0 0 760 424" width="100%" style="max-width:700px;height:auto;font-family:Commissioner,system-ui,sans-serif">
  <defs>
    <marker id="fa" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#5d4632"/></marker>
    <marker id="fg" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#45632f"/></marker>
  </defs>
  <rect x="60" y="16" width="300" height="38" rx="5" fill="#efe9db" stroke="#cfc4ad"/>
  <text x="210" y="40" font-size="12" fill="#211a12" text-anchor="middle">Input chunk — N rows</text>
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
  <text x="210" y="177" font-size="10" fill="#5d4632" text-anchor="middle">N rows → K distinct tuples</text>
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
  <text x="210" y="375" font-size="10" fill="#5d4632" text-anchor="middle">arena append + coarse entry, K → N</text>
  <text x="452" y="300" font-size="9.5" fill="#5d4632">A partial hit still counts as a</text>
  <text x="452" y="313" font-size="9.5" fill="#5d4632">MISS for the hit-rate counters —</text>
  <text x="452" y="326" font-size="9.5" fill="#5d4632">the worker did run. The saving</text>
  <text x="452" y="339" font-size="9.5" fill="#5d4632">shows up as a smaller input.</text>
</svg>
<figcaption style="margin-top:0.8rem;font-size:0.85rem;opacity:0.7">For an eligible correlated table-in/out call with per-value caching enabled, a whole-chunk hit skips the worker exchange. Otherwise, the client gathers cached values and sends only the missing tuples. Volatile functions are excluded from deduplication and per-value reuse.</figcaption>
</figure>

Because workers already return Arrow record batches, the client can store complete batches as Arrow IPC streams. That format was expensive when our early implementation used a separate stream for every small value, so per-value results now share a columnar arena: common column storage that maps each input tuple to its output rows. A hit assembles rows from that storage instead of decoding a separate stream for every value.

Larger captures can spill to disk when disk storage is enabled and replay one batch at a time. A complete-scan entry is committed only after its producer finishes successfully, so an interrupted query cannot leave a partial answer available for reuse. These storage choices belong to the client; the worker supplies the freshness and reuse policy.

## Try it with Yahoo Finance history

An agent researching a few companies might ask for average closing prices, then change its mind and look at trading volume. Both questions need the same daily price history. The [Yahoo Finance VGI connector](https://github.com/Query-farm/vgi-yfinance) makes that history available to SQL, so we can try the same kind of reuse with a real data source.

Click **Try it in your browser** to run this example in [Haybarn WASM](/products/haybarn/). SQL runs in your browser; the hosted VGI worker fetches the data from Yahoo Finance. No API key or local Python process is needed. The first run downloads the engine.

<div id="yfinance-cache-example">

```sql
LOAD httpfs;
ATTACH 'yfinance' AS yf (
    TYPE vgi,
    LOCATION 'https://vgi-yfinance.rusty-bb6.workers.dev'
);

CREATE OR REPLACE TEMP TABLE watchlist AS
SELECT * FROM (VALUES ('AAPL'), ('MSFT')) t(symbol);

-- First question: average closing prices over the past month.
SELECT w.symbol, round(avg(h.close), 2) AS average_close
FROM watchlist w,
     LATERAL yf.history(w.symbol, range := '1mo') h
GROUP BY w.symbol
ORDER BY w.symbol;

-- New question, same history: the busiest trading day.
SELECT w.symbol, max(h.volume) AS busiest_day_volume
FROM watchlist w,
     LATERAL yf.history(w.symbol, range := '1mo') h
GROUP BY w.symbol
ORDER BY w.symbol;

SELECT exchange_hits, exchange_misses
FROM vgi_result_cache_stats();
```

</div>

The history worker allows its response to be reused for **60 seconds**. That is a short snapshot: today's candle can still change, and older prices can be corrected. The first query fetches the candles for each symbol; the second can calculate trading volume from those same candles without asking the worker to fetch them again.

Here `history()` is a **correlated table-in/out function**: each symbol on the left produces several daily rows on the right. The `LATERAL` calls use the exchange cache, which is why the final result shows `exchange_hits` and `exchange_misses`. A fresh run should show hits from the second question. Changing the symbol or history arguments can require another fetch; after the minute expires, the next call fetches again.

The shell reports each query's elapsed time. A cache hit confirms reuse, but the saving still depends on how much of the query was spent fetching data. Try another question over the same history, or another symbol, and compare what happens.

An agent revising its analysis should be able to use information it just fetched, as long as the service says that information is still good. VGI makes that agreement part of the function call. The worker guides cover how to add it in [Python](/vgi/docs/python/how-to/result-caching/), [TypeScript](/vgi/docs/typescript/how-to/result-caching/), [Go](/vgi/docs/go/how-to/result-caching/), and [Rust](/vgi/docs/rust/how-to/result-caching/).
