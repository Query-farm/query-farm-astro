---
title: "DuckDB 2.0 Pushes Whole Queries Through ADBC—10–11× Faster on PostgreSQL"
description: "Query Farm's adbc_scanner uses DuckDB 2.0 whole-query pushdown to run supported queries entirely in PostgreSQL. In our benchmark, it was 10–11× faster."
pubDate: 2026-09-13
author: "Rusty Conover"
tags: ["DuckDB", "ADBC", "PostgreSQL", "Performance", "Extensions"]
heroImage: "/media/posts/one-query-one-arrow-stream-adbc-duckdb-2/social.png"
draft: false
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>DuckDB 2.0 can hand a complete query tree to a remote database before turning it into a local plan.</li>
      <li><a href="/products/extensions/adbc_scanner/"><code>adbc_scanner</code></a> can now translate supported queries into one remote SQL statement and read the result through one Arrow stream.</li>
      <li>ADBC standardizes the connection, metadata, parameters, and result transport. A small dialect layer still has to decide which SQL is safe for each database.</li>
      <li>On a same-host PostgreSQL benchmark, whole-query pushdown was <strong>10.0× faster</strong> for a grouped aggregate and <strong>11.4× faster</strong> for a selective join and aggregate.</li>
      <li>The extension falls back to ordinary ADBC scans when any part of a query is not known to be compatible.</li>
    </ul>
  </div>
</aside>

DuckDB can query PostgreSQL, MySQL, and other remote databases as though their tables were part of DuckDB. The expensive part comes when a remote table is large but the final result is small: millions of source rows may have to travel into DuckDB before a join or aggregate reduces them.

Query Farm maintains [`adbc_scanner`](/products/extensions/adbc_scanner/), a DuckDB community extension that connects to databases through [Arrow Database Connectivity](https://arrow.apache.org/adbc/current/) drivers. Our original proposition was deliberately modest: if a database has an ADBC driver, DuckDB should not need another bespoke connector just to discover tables and read Arrow data from it.

That worked, but it left a fairly large performance opportunity on the table with DuckDB 2.0.

The user experience starts in DuckDB. You attach a remote PostgreSQL or MySQL database, then query its tables alongside everything else DuckDB can see. DuckDB documents this model for both its [PostgreSQL extension](https://duckdb.org/docs/current/core_extensions/postgres/overview) and [MySQL extension](https://duckdb.org/docs/current/core_extensions/mysql). [`adbc_scanner`](/products/extensions/adbc_scanner/) offers the same experience through an ADBC driver:

```sql
ATTACH 'postgresql://app:secret@db.example.com/warehouse'
    AS pg (TYPE adbc, driver 'postgresql', READ_ONLY);

SELECT region, SUM(revenue)
FROM pg.public.orders
GROUP BY region;
```

From the user's point of view, `pg.public.orders` is simply a table in a DuckDB query. Behind the scenes, PostgreSQL was always doing some work: [`adbc_scanner`](/products/extensions/adbc_scanner/) sent it SQL for the table scan and any supported filters. The transfer was vectorized in Arrow batches, but millions of rows could still have to move into DuckDB before it performed the remaining joins, grouping, and ordering.

On DuckDB's 2.0 development branch, a supported query can take a shorter path. When all its tables belong to one remote database and every operation is safe to run there, DuckDB passes over the complete query, PostgreSQL or MySQL performs the work, and ADBC returns only the result. Otherwise, DuckDB uses the existing local path.

## The result: 10–11× faster

Before getting into the implementation, here is what the change did in practice. We compared the same [`adbc_scanner`](/products/extensions/adbc_scanner/) build and PostgreSQL database with whole-query pushdown enabled and disabled. Both ran on the same host, which favors the local plan by removing network latency.

**Remote pushdown won both workloads. It used 90–91% less time and moved at least 50,000× fewer rows through ADBC.**

### Grouped aggregate: 10.0× faster

- **Remote pushdown: 369 ms**
- Local processing: 3,702 ms
- **Difference: 3,333 ms saved, or 90.0% less time**
- Rows moved through ADBC: **100 instead of 5,000,000**

PostgreSQL grouped the five million input rows and returned the 100-row result. Without whole-query pushdown, ADBC returned all five million `dim_id` and `amount` pairs for DuckDB to aggregate locally.

### Selective join and aggregate: 11.4× faster

- **Remote pushdown: 187 ms**
- Local processing: 2,131 ms
- **Difference: 1,944 ms saved, or 91.2% less time**
- Rows moved through ADBC: **1 instead of 50,100**

DuckDB's local plan already used a dynamic filter, so it reduced the fact scan to 50,000 matching rows plus the 100-row dimension input. The pushed query still needed to return only the single aggregate row.

The row reductions are much larger than the latency reductions. PostgreSQL still has to scan and compute, and ADBC still has fixed statement and Arrow-stream costs. Pushdown removes transfer and local execution work; it does not make the remote query free. The complete setup and run procedure are in the [reproduction appendix](#appendix-reproducing-the-benchmark).

[`adbc_scanner` is available today](/products/extensions/adbc_scanner/), and the DuckDB 2.0 implementation can be tested from its [`v2.0` branch](https://github.com/Query-farm/adbc_scanner/tree/v2.0).

## Why this matters

Whole-query pushdown matters when the remote input is much larger than the result DuckDB actually needs. It is especially useful for:

- Data engineers querying PostgreSQL or MySQL from DuckDB
- Applications using embedded DuckDB as a federated query layer
- Teams moving large remote tables through local joins or aggregates
- ADBC driver authors who want deeper DuckDB integration
- Database vendors that want a tested pushdown profile

When it applies, pushdown can reduce data transfer, DuckDB memory use, and client-side CPU work. It may also reduce network egress when DuckDB and the database run in different places. Those are expected consequences of moving fewer rows, not additional measurements from this benchmark.

There is a tradeoff: the remote database does more CPU work. That can be exactly right for a warehouse or read replica and the wrong choice for a busy operational system. The attachment option `query_pushdown false` keeps that decision under the user's control.

The difference is easiest to see side by side. We have wired DuckDB 2.0's remote-database pushdown interface into [`adbc_scanner`](/products/extensions/adbc_scanner/); the implementation is on its [`v2.0` branch](https://github.com/Query-farm/adbc_scanner/tree/v2.0).

<figure>
  <img src="/blog/one-query-one-arrow-stream-adbc-duckdb-2/adbc-query-pushdown.svg" alt="Comparison of ADBC execution paths. Previously, ADBC sent table-level SQL to the remote database and returned many Arrow rows for DuckDB to join, group, and order locally. With DuckDB 2.0, a supported QueryNode passes through a dialect safety gate and becomes one remote statement containing the joins, filters, aggregates, and ordering; only the final Arrow result returns to DuckDB." loading="eager" width="760" height="650" />
  <figcaption>ADBC always executed SQL on the remote server. DuckDB 2.0 lets <a href="/products/extensions/adbc_scanner/"><code>adbc_scanner</code></a> move the rest of a supported query there too.</figcaption>
</figure>

The same connector can now do more than return source rows. When the remote database can safely run the whole statement, DuckDB only has to read the result.

<blockquote class="is-pullquote">The fastest row to move is the row that never leaves the remote database.</blockquote>

## The missing piece was the plan

ADBC already covers a great deal of connector plumbing. It gives an application a common way to open databases and connections, create statements, bind parameters, inspect metadata, execute queries, and receive Arrow data. That is enough to make a broad DuckDB connector useful without reimplementing every wire protocol.

What ADBC does not decide is how much of the user's query belongs in each remote SQL statement. That decision needs information from DuckDB's planner and knowledge of the target database's SQL dialect.

Users could already send hand-written SQL directly through an ADBC connection. The new part is automatic: DuckDB can recognize that an ordinary query is safe to move without making the user rewrite it as a database-specific SQL string.

DuckDB 2.0 makes that decision earlier, while the SQL still looks like a complete query. Its new [`RemotePushdownOptimizer`](https://github.com/duckdb/duckdb/pull/22914) asks the remote database, “Can you run all of this?” If the answer is yes, DuckDB hands over the `QueryNode` for remote execution. If not, DuckDB keeps the local plan. The same mechanism now powers whole-query pushdown in DuckDB's MySQL extension ([DuckDB PR #23135](https://github.com/duckdb/duckdb/pull/23135)).

That timing matters. The extension gets the user's query while it is still recognizably a query—not after it has become a forest of local operators.

The same series of DuckDB changes added [`CONNECT`](https://github.com/duckdb/duckdb/pull/22950), which makes a remote database the current execution target. With [`adbc_scanner`](/products/extensions/adbc_scanner/), the two styles look like this:

```sql
-- Using a DuckDB 2.0 development build and a matching v2.0 extension build:
LOAD adbc_scanner;

ATTACH 'postgresql://app:secret@db.example.com/warehouse'
    AS pg (TYPE adbc, driver 'postgresql');

-- Query the attached database through DuckDB
SELECT dim_id, SUM(amount), COUNT(*)
FROM pg.public.qf_adbc_bench_fact
GROUP BY dim_id
ORDER BY dim_id;

-- Or make PostgreSQL the current database and run the same query directly
CONNECT pg;
SELECT dim_id, SUM(amount), COUNT(*)
FROM public.qf_adbc_bench_fact
GROUP BY dim_id
ORDER BY dim_id;
DISCONNECT;
```

These are the same grouped-aggregate query; after `CONNECT`, the `pg` prefix is no longer needed. `CONNECT` and structured `QueryNode` pushdown solve related but different problems. `CONNECT` deliberately forwards complete statements, including statements DuckDB does not plan locally. Structured pushdown preserves the normal DuckDB experience: DuckDB sees the query, the extension proves that it can be moved, and unsupported queries remain valid local DuckDB plans.

The benchmark above uses the first form. Structured pushdown made this grouped aggregate **10.0× faster** than the local ADBC scan plan; a selective join and aggregate was **11.4× faster**.

## What [`adbc_scanner`](/products/extensions/adbc_scanner/) does with a QueryNode

The API is small; deciding when to use it is the hard part. Before pushing a query, [`adbc_scanner`](/products/extensions/adbc_scanner/) has to establish that the target database supports every expression, join, type, and query modifier with the same meaning DuckDB intended.

When DuckDB offers a `QueryNode`, [`adbc_scanner`](/products/extensions/adbc_scanner/) first identifies the SQL dialect from the selected ADBC driver. It currently has structured-pushdown profiles for PostgreSQL, MySQL, SQLite, and DuckDB. The extension then walks the tree recursively and checks three levels of support:

1. Every expression must be safe in the target dialect: constants, operators, functions, casts, subqueries, and modifiers all count.
2. Every table reference and join must have semantics the target can reproduce.
3. The complete query shape—`SELECT`, set operations, ordering, limits, `DISTINCT`, and related modifiers—must be supported as a unit.

If the checks pass, the extension clones the tree, applies the small rewrites required by the target, serializes it to SQL, executes that SQL with an ADBC statement, and exposes the returned `ArrowArrayStream` to DuckDB.

Cloning is important. The extension is inspecting a candidate optimization; it should not mutate DuckDB's original tree and leave a half-rewritten query behind if a later check fails.

The dialect rewrite is intentionally narrower than a SQL transpiler. For example, MySQL needs backtick-quoted identifiers and different treatment of catalog/schema qualification. PostgreSQL can accept `FILTER` on aggregates, `DISTINCT ON`, right joins, and its own temporal type names. SQLite has a smaller type and join surface. DuckDB-to-DuckDB is naturally the broadest match.

The shared machinery is substantial, but there is no honest `supports_sql = true` switch. SQL databases overlap; they are not interchangeable.

## ADBC solves transport, not dialects

Because ADBC is a standard, it is tempting to assume that adding an ADBC driver should automatically enable whole-query pushdown. It does not.

ADBC standardizes how the extension talks to a driver and how data comes back. That removes a huge amount of repetitive connector code. It does not standardize the SQL text accepted on the other side, its function catalog, implicit casts, identifier rules, null ordering, or edge-case semantics.

Here is the split in the current extension:

| Capability | Shared through ADBC | Per-dialect work |
| :-- | :--: | :--: |
| Open databases and connections | Yes | Connection options still vary |
| Discover schemas and tables | Yes | Driver metadata quality varies |
| Prepare and execute statements | Yes | Placeholder syntax can vary |
| Return results as Arrow | Yes | Type mapping still needs testing |
| Decide whether a full query is equivalent | No | Yes |
| Serialize identifiers, casts, and functions | No | Yes |

That is still a very good bargain. A new profile does not need a new network stack, result decoder, transaction wrapper, or catalog implementation. It needs a conservative description of the SQL intersection between DuckDB and that driver.

The extension already exercises more ADBC drivers—including Flight SQL, DataFusion, chDB, Trino, and SQL Server—for connection, metadata, scan, or `CONNECT` behavior. They do not automatically get structured whole-query pushdown. Each needs a profile and real compatibility tests before we would trust it with that optimization.

## What works today

<aside class="article-brief" aria-labelledby="works-today-title">
  <div class="article-brief-inner">
    <p id="works-today-title" class="article-brief-label">On the <code>v2.0</code> branch</p>
    <ul>
      <li>Structured whole-query profiles for PostgreSQL, MySQL, SQLite, and DuckDB</li>
      <li>Automatic fallback to local DuckDB execution when a query is not safe to push</li>
      <li>Generated remote SQL visible through <code>EXPLAIN</code></li>
      <li>Direct remote statement execution through <code>CONNECT</code></li>
      <li>Broader ADBC connection and scan coverage for Flight SQL, DataFusion, chDB, Trino, and SQL Server</li>
    </ul>
  </div>
</aside>

[`adbc_scanner`](/products/extensions/adbc_scanner/) is open source, and its DuckDB 2.0 work is available for testing now. [Haybarn](/products/haybarn/), Query Farm's DuckDB distribution, will also have a DuckDB 2.0 preview release soon, with the engine and matching extensions packaged together.

Several customers have already asked for profiles tailored to their databases and SQL conventions. [Query Farm can build and validate a custom profile on a consulting basis](/consulting/), using the customer's actual server and representative queries rather than assuming compatibility from a driver name.

## Fallback is a feature

The tempting implementation is to emit SQL for everything DuckDB's serializer can print and let the remote database complain. It is also the wrong implementation.

Remote rejection is the easy failure. The dangerous case is remote acceptance with different semantics.

Consider a PostgreSQL boolean column. DuckDB accepts `MIN(boolean)`; PostgreSQL does not provide that aggregate overload. A `TINYINT` cast is another ordinary DuckDB expression without a direct PostgreSQL type. Those queries must stay local. On the other hand, PostgreSQL-specific constructs such as `DISTINCT ON`, aggregate `FILTER`, and `TIMESTAMPTZ` are good candidates when the profile can recognize and preserve them.

Boolean structure needs the same caution. If one side of an `OR` is pushable and the other is not, pushing only the convenient half changes the predicate. The extension therefore treats support as an all-or-nothing property at the relevant boundary. A single unsafe child vetoes the enclosing expression, and an unsafe expression can veto the complete remote query.

<blockquote class="is-pullquote">Pushdown is an optimization. If it changes the answer, it is a bug.</blockquote>

When a query is vetoed, nothing dramatic happens. DuckDB falls back to the existing ADBC table-scan path and evaluates the unsupported operation locally. The user gets the same query result, just without the whole-query shortcut.

That conservative fallback makes it practical to grow support incrementally. A profile can begin with projections, comparisons, inner joins, common aggregates, grouping, ordering, and limits. More functions and query shapes can be added as tests prove their semantics. It does not have to pretend to understand an entire database on day one.

For diagnosis and comparison, the attachment also accepts `query_pushdown false`:

```sql
ATTACH 'postgresql://app:secret@db.example.com/warehouse'
    AS pg_local (
        TYPE adbc,
        driver 'postgresql',
        query_pushdown false,
        READ_ONLY
    );
```

And `EXPLAIN` exposes the generated statement as `Remote SQL`. That is more than a convenience. Once execution can move between engines, the plan needs to tell the user which engine is actually doing the work.

## What comes next

The immediate next step is more dialect profiles, driven by real deployments rather than a count of driver names. A profile should ship only when its behavior is backed by a real server and a useful set of positive *and negative* tests. Flight SQL is especially interesting because the transport can front many different SQL engines; that is also precisely why treating it as one universal SQL dialect would be risky.

Capability discovery could eventually reduce some hard-coded knowledge. Drivers may know whether a backend supports transactions, parameter forms, or particular statement behavior. Those signals can help, but fine-grained SQL equivalence is still difficult to advertise through a portable API.

Finally, the same remote-database pushdown work points beyond reads. `CONNECT` already gives users a direct statement path. Structured remote DML, better transaction integration, and cost-aware choices between local and remote execution are natural directions, provided they retain the same bias toward visible plans and safe fallback.

## Takeaways

- **DuckDB 2.0 changes what a connector can be.** A remote database can now accept a complete structured query before it is fragmented into local operators.
- **ADBC is the leverage point, not a universal dialect.** It supplies reusable connection, statement, metadata, parameter, and Arrow transport machinery. Each SQL family still needs a tested compatibility profile.
- **Fallback is part of the design.** Unsupported expressions and query shapes remain ordinary DuckDB plans; the extension does not gamble with semantics for a faster-looking `EXPLAIN`.
- **Moving less data produced a large result.** On the same-host five-million-row benchmark, full pushdown was 10.0× and 11.4× faster for the two tested workloads.
- **The implementation is available now for experimentation.** The [`adbc_scanner`](/products/extensions/adbc_scanner/) work is on its [`v2.0` branch](https://github.com/Query-farm/adbc_scanner/tree/v2.0), built against DuckDB's development branch. Expect both to keep moving before DuckDB 2.0 is released.

The most exciting part is not the PostgreSQL result by itself. A community extension can add one carefully tested SQL profile and reuse the rest of the ADBC stack. DuckDB 2.0 provides the planning seam; ADBC provides the common execution seam.

The result is simple: write an ordinary DuckDB query, let the remote database perform the work it is good at, and bring back only the rows DuckDB actually needs.

Have an ADBC-backed database that needs whole-query pushdown? [Query Farm can build and validate its query profile against your server and workloads](/consulting/).

## Appendix: Reproducing the benchmark

The benchmark isolates the value of whole-query pushdown rather than comparing two unrelated connectors. Both sides used the same [`adbc_scanner`](/products/extensions/adbc_scanner/) build, the same ADBC PostgreSQL driver, and the same PostgreSQL database. The only difference was whether the attachment allowed DuckDB 2.0's structured query pushdown.

The fact table contained 5,000,000 generated rows:

```sql
CREATE TABLE qf_adbc_bench_fact AS
SELECT i::BIGINT AS id,
       (i % 100)::INTEGER AS dim_id,
       ((i * 17) % 10000)::BIGINT AS amount
FROM generate_series(1, 5000000) AS g(i);
```

A second table had 100 dimension rows, with one row selected by a boolean `keep` column. We ran two queries:

```sql
-- A: grouped aggregate
SELECT dim_id, SUM(amount), COUNT(*)
FROM pg.public.qf_adbc_bench_fact
GROUP BY dim_id
ORDER BY dim_id;

-- B: selective join and aggregate
SELECT COUNT(*), SUM(fact.amount)
FROM pg.public.qf_adbc_bench_fact AS fact
JOIN pg.public.qf_adbc_bench_dim AS dim
  ON fact.dim_id = dim.id
WHERE dim.keep;
```

Each result reported above is the median of nine measured runs after one warm-up, with the pushed and local variants interleaved in the same DuckDB process.

These measurements ran on a 48-vCPU AWS Graviton host (Neoverse N1, `aarch64`) with PostgreSQL 16.15 and ADBC PostgreSQL driver 1.12.0. DuckDB reported `v2.0.0-dev84467`. The exact test build used [`adbc_scanner`](/products/extensions/adbc_scanner/) [commit `dc26125`](https://github.com/Query-farm/adbc_scanner/commit/dc26125b47f7527b38b7c9e5393a14b0b3e4437e) with [DuckDB commit `10de957`](https://github.com/duckdb/duckdb/commit/10de9573794001c649621013bdd93553b54e00c9). DuckDB and PostgreSQL ran on the same EC2 machine with no artificial network delay. Query output was discarded, timing used DuckDB CLI wall-clock time, and the two attachment modes were interleaved to reduce drift.

Same-host placement is an important caveat. It is unusually favorable to the local-scan plan because moving five million rows does not cross a real network. A production topology may widen the gap, but this benchmark does not measure that claim. It establishes the simpler result: even without network latency, avoiding millions of rows of Arrow transport and local processing mattered substantially.

The data is synthetic and deliberately compressible in meaning, if not skipped by the query. This is not a TPC-H score or a general promise that every workload becomes ten times faster. Queries that already return most of a table, use DuckDB-only functions, join local and remote data, or benefit from DuckDB's execution engine can reasonably stay local. The point is that [`adbc_scanner`](/products/extensions/adbc_scanner/) can now choose the remote shape when it is clearly the better shape.
