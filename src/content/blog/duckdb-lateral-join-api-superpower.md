---
title: "DuckDB’s LATERAL Join Is an API Superpower"
description: "A table function turns an API call into rows in your database. A LATERAL join lets every row on the left call it — and VGI makes those calls in batches."
pubDate: 2026-08-30
author: "Rusty Conover"
tags: ["DuckDB", "VGI", "SQL", "Performance"]
draft: true
leadVisual:
  src: "/blog/duckdb-lateral-join-api-superpower/lateral-bezier-flow.svg"
  alt: ""
  width: 720
  height: 156
---

Most SQL joins combine two inputs that can be evaluated independently. A `LATERAL` join is different: the right-hand side may use columns from the current row on the left.

The syntax is small and easy to overlook, but it opens up a powerful pattern. With [VGI](/vgi/), a `LATERAL` join becomes a natural, efficient interface to an API. Keep a table of inputs on the left and call a remote table function on the right; each input can produce no rows, one row, or many, and [DuckDB](https://duckdb.org/) preserves the association between inputs and results. VGI makes the pattern efficient by passing inputs to the function in batches, giving the integration an opportunity to combine API work instead of being forced into one call at a time.

<figure>
  <img src="/blog/duckdb-lateral-join-api-superpower/scalar-versus-lateral.svg" alt="A scalar function maps Ocean City to exactly one value. A lateral table function maps the same input to zero, one, or many rows; this example produces three Ocean City matches in three different states." loading="eager" width="760" height="350" />
  <figcaption>A scalar function has a 1→1 contract. A <code>LATERAL</code> table function has a 1→0…N contract, so it can represent no match, one match, or many matches without hiding rows inside a single value.</figcaption>
</figure>

Every SQL example below can run live in your browser using [Haybarn WASM](/products/haybarn/) and the same hosted [Open-Meteo](https://open-meteo.com/) VGI service used in [VGI's live tour](/vgi/#tour). The first run downloads the WebAssembly engine, so it may take a few seconds.

## A table function returns a table

A familiar SQL scalar function returns one value for each call. `upper('Ocean City')` returns one string. `round(3.14159, 2)` returns one number. Even when DuckDB evaluates a scalar function over a whole column, each input row still gets exactly one output value.

That contract is too narrow for search-like APIs. A place name may have no match, one obvious match, or several legitimate matches. Packing those into a list-valued scalar is possible, but SQL then needs another operation to turn the list back into rows.

A **table function** returns a table instead of one value. It may return zero rows, one row, or many rows. Because its result has rows and columns of its own, it belongs in the `FROM` clause:

```sql
SELECT name, latitude, longitude, admin1, country
FROM m.main.geocoding(
    'Ocean City', count := 3, country_code := 'US'
);
```

<div class="query-result" role="region" aria-label="Result: three Ocean City matches in three different states" tabindex="0">
  <div class="query-result__label">result · 3 rows</div>
  <table>
    <thead><tr><th>name</th><th>latitude</th><th>longitude</th><th>admin1</th><th>country</th></tr></thead>
    <tbody>
      <tr><td>Ocean City</td><td>39.27762</td><td>-74.5746</td><td>New Jersey</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>38.33650</td><td>-75.08491</td><td>Maryland</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>30.44103</td><td>-86.61356</td><td>Florida</td><td>United States</td></tr>
    </tbody>
  </table>
</div>

Here `geocoding` is not a stored table but a VGI function backed by the [Open-Meteo](https://open-meteo.com/) geocoding API. The call has fixed arguments—`'Ocean City'`, `count := 3`, and `country_code := 'US'`—and its result happens to have columns named `name`, `latitude`, `longitude`, `admin1`, and `country`.

This is already useful. It lets the rest of SQL treat an external API response like any other relation: select a few columns, filter it, sort it, or join it. DuckDB's own documentation describes table functions in the same plain terms: they are functions that return a table and can appear in `FROM`, alongside ordinary table references ([DuckDB table functions](https://duckdb.org/docs/current/sql/query_syntax/from#table-functions)).

But the argument is still a literal, and it asks about one place. You can repeat the call with a different literal each time, which is reasonable when you are typing two or three values by hand. That falls apart when the inputs already live as rows in a table: you would be turning the table back into a loop of separate queries, then attaching every result to its input again yourself. What we need is one table-shaped operation that says “call this function for every input row.”

## Let the left row supply the argument

Start with a tiny table of place names:

```sql
WITH places(city) AS (
    VALUES ('Glen Allen, VA'), ('No such place zxqv'), ('Ocean City')
)
SELECT * FROM places;
```

<div class="query-result" role="region" aria-label="Result: the three input place rows" tabindex="0">
  <div class="query-result__label">result · 3 input rows</div>
  <table>
    <thead><tr><th>city</th></tr></thead>
    <tbody>
      <tr><td>Glen Allen, VA</td></tr>
      <tr><td>No such place zxqv</td></tr>
      <tr><td>Ocean City</td></tr>
    </tbody>
  </table>
</div>

We want to feed each `city` into `geocoding`. The function call is on the right of `places`, but its argument refers back to `places.city` on the left. That backward reference is the correlation, and `LATERAL` is the SQL word that allows it:

```sql
WITH places(city) AS (
    VALUES ('Glen Allen, VA'), ('No such place zxqv'), ('Ocean City')
)
SELECT p.city,
       g.name AS matched_name,
       g.admin1,
       g.country
FROM places AS p,
     LATERAL m.main.geocoding(
         p.city, count := 3, country_code := 'US'
     ) AS g
ORDER BY p.city, g.country, g.admin1;
```

<div class="query-result" role="region" aria-label="Result: four matches correlated with two of the three input rows" tabindex="0">
  <div class="query-result__label">result · 4 right-hand rows</div>
  <table>
    <thead><tr><th>city</th><th>matched_name</th><th>admin1</th><th>country</th></tr></thead>
    <tbody>
      <tr><td>Glen Allen, VA</td><td>Glen Allen</td><td>Virginia</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>Florida</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>Maryland</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>New Jersey</td><td>United States</td></tr>
    </tbody>
  </table>
</div>

Read the `FROM` clause from left to right. First there is a row from `places`, such as `Glen Allen, VA`. That row supplies the argument to `geocoding`. The row returned by the function is joined back to that particular input row. Then the same thing happens for the next place.

DuckDB often detects the correlation and makes the `LATERAL` keyword optional. I still write it. It tells the next person that the reference to `p.city` is deliberate, and that the right side is not an independent table ([DuckDB lateral joins](https://duckdb.org/docs/current/sql/query_syntax/from#lateral-joins)).

There is one more important difference from a scalar function: one input does not have to mean one output.

- A name with no match can return **zero** rows.
- An unambiguous name can return **one** row.
- `Ocean City` can return **many** rows.

The result has four rows, not three. `Glen Allen, VA` produced one match, while `Ocean City` expanded to three matches in three different states. `No such place zxqv` produced zero right-hand rows and therefore disappeared. A scalar function cannot express that change in row count; a table function can.

When the left row must survive even when the function returns nothing, use a left `LATERAL` join:

```sql
WITH places(city) AS (
    VALUES ('Glen Allen, VA'), ('No such place zxqv'), ('Ocean City')
)
SELECT p.city,
       g.name AS matched_name,
       g.admin1,
       g.country
FROM places AS p
LEFT JOIN LATERAL m.main.geocoding(
    p.city, count := 3, country_code := 'US'
) AS g
  ON true
ORDER BY p.city, g.country, g.admin1;
```

<div class="query-result" role="region" aria-label="Result: the unmatched input is retained with null values" tabindex="0">
  <div class="query-result__label">result · 5 joined rows</div>
  <table>
    <thead><tr><th>city</th><th>matched_name</th><th>admin1</th><th>country</th></tr></thead>
    <tbody>
      <tr><td>Glen Allen, VA</td><td>Glen Allen</td><td>Virginia</td><td>United States</td></tr>
      <tr><td>No such place zxqv</td><td class="query-result__null">NULL</td><td class="query-result__null">NULL</td><td class="query-result__null">NULL</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>Florida</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>Maryland</td><td>United States</td></tr>
      <tr><td>Ocean City</td><td>Ocean City</td><td>New Jersey</td><td>United States</td></tr>
    </tbody>
  </table>
</div>

Now an unmatched place remains in the result with `NULL` in the `g` columns. The inner-versus-left choice is the same as in an ordinary join; only the way the right-hand rows are produced is different.

<figure>
  <img src="/blog/duckdb-lateral-join-api-superpower/lateral-correlated-batch.svg" alt="Three left-hand place rows sent in one VGI batch. Glen Allen produces one correlated row, a missing place produces zero rows, and Ocean City produces three correlated rows. Parent-row metadata maps every result back to its input." loading="lazy" width="760" height="470" />
  <figcaption>A <code>LATERAL</code> table function is a 0→N operation for every row on the left. VGI sends the inputs together and carries the correlation back as parent-row metadata.</figcaption>
</figure>

## Two API calls can become one query

The weather example on the [VGI page](/vgi/#tour) first geocodes Glen Allen and then feeds the returned coordinates straight into a forecast function:

```sql
SELECT w.time,
       round(w.temperature_2m, 1)                AS temp_f,
       m.main.weather_code_emoji(w.weather_code) AS icon,
       m.main.weather_code_text(w.weather_code)  AS conditions
FROM m.main.geocoding(
         'Glen Allen, VA', count := 1, country_code := 'US'
     ) AS g,
     LATERAL m.main.forecast_hourly(
         g.latitude,
         g.longitude,
         forecast_days := 2,
         temperature_unit := 'fahrenheit'
     ) AS w
WHERE w.time >= now()
ORDER BY w.time
LIMIT 6;
```

<div class="query-result" role="region" aria-label="Example result: six forecast hours for Glen Allen" tabindex="0">
  <div class="query-result__label">example result · weather observed 30 August 2026</div>
  <table>
    <thead><tr><th>time</th><th>temp_f</th><th>icon</th><th>conditions</th></tr></thead>
    <tbody>
      <tr><td>2026-08-30 23:00:00+00</td><td>86.0</td><td>☀️</td><td>Clear sky</td></tr>
      <tr><td>2026-08-31 00:00:00+00</td><td>81.4</td><td>☀️</td><td>Clear sky</td></tr>
      <tr><td>2026-08-31 01:00:00+00</td><td>78.3</td><td>⛅</td><td>Partly cloudy</td></tr>
      <tr><td>2026-08-31 02:00:00+00</td><td>76.8</td><td>☀️</td><td>Clear sky</td></tr>
      <tr><td>2026-08-31 03:00:00+00</td><td>77.5</td><td>☁️</td><td>Overcast</td></tr>
      <tr><td>2026-08-31 04:00:00+00</td><td>76.8</td><td>☁️</td><td>Overcast</td></tr>
    </tbody>
  </table>
</div>

`geocoding` returns a coordinate. `forecast_hourly` uses that coordinate and returns many forecast hours. The second function could not be evaluated independently: its latitude and longitude exist only because the first function produced them.

The same shape works over a real input table, and it can be chained more than once:

```sql
WITH places(city) AS (
    VALUES ('Richmond, VA'), ('Boston, MA'), ('Glen Allen, VA')
)
SELECT p.city,
       round(w.temperature_2m, 1)                AS temp_c,
       m.main.weather_code_text(w.weather_code)  AS conditions
FROM places AS p,
     LATERAL m.main.geocoding(
         p.city, count := 1, country_code := 'US'
     ) AS g,
     LATERAL m.main.forecast_current(
         g.latitude, g.longitude
     ) AS w
ORDER BY p.city;
```

<div class="query-result" role="region" aria-label="Example result: current weather for three cities" tabindex="0">
  <div class="query-result__label">example result · 3 correlated rows</div>
  <table>
    <thead><tr><th>city</th><th>temp_c</th><th>conditions</th></tr></thead>
    <tbody>
      <tr><td>Boston, MA</td><td>27.1</td><td>Overcast</td></tr>
      <tr><td>Glen Allen, VA</td><td>31.2</td><td>Clear sky</td></tr>
      <tr><td>Richmond, VA</td><td>31.4</td><td>Clear sky</td></tr>
    </tbody>
  </table>
</div>

> **The payoff.** In application code this usually becomes a loop, a collection of HTTP requests, a pile of response objects, and finally a merge back onto the input records. Here the association is part of the query plan. That is more than shorter code: SQL can still filter, project, and combine the result without an application having to materialize an intermediate table.

## Correlated does not have to mean one call at a time

The usual explanation of `LATERAL` is a loop: for each left row, evaluate the right side. It is a good explanation of the result, but a bad execution plan for a remote API.

Imagine 5,000 place names on the left and `geocoding(city)` on the right. A naive row-by-row implementation can make 5,000 API calls—one per place. Request setup, scheduling, serialization, and network latency soon cost more than the useful computation.

A SQL query describes the result we want. DuckDB turns it into a query plan made of executable steps: scan these rows, apply this filter, perform this join, call this table function. DuckDB calls each such step a **physical operator**. The operator relevant here decides how rows are presented to `geocoding` and how its answers are attached to the left side.

DuckDB's stock `PhysicalTableInOutFunction` produces the correct result, but for this correlated shape it calls the function once per outer row. VGI recognizes eligible **blended row-transform** table functions and replaces that one plan step with `PhysicalVgiLateralBatch` (shown as `VGI_LATERAL_BATCH` by `EXPLAIN`).

<figure>
  <img src="/blog/duckdb-lateral-join-api-superpower/physical-operator-batching.svg" alt="The stock DuckDB query-plan step sends Glen Allen, a missing place, and Ocean City through three separate function calls. VGI's query-plan step sends the same three inputs together in one batched call." loading="lazy" width="760" height="430" />
  <figcaption>Both plan steps produce the same rows. Three are shown for clarity; a real DuckDB input chunk can contain many more.</figcaption>
</figure>

### Why a new operator was necessary

Why add a plan step at all? Not to make the query correct. DuckDB already knew how to execute the `LATERAL` table function, and VGI keeps that row-at-a-time path as a fallback that `SET vgi_batch_lateral=false` restores. The specialized operator was necessary to make **transparent batching** work with the natural `LATERAL geocoding(p.city)` call shape.

Without it, the VGI function receives one city at a time. By the time the API code runs, the rest of the input chunk is no longer available to batch, deduplicate, or schedule concurrently. We could have exposed a different function that accepted a list or a whole table, but then every query would have to build the batch and reconstruct the correlation itself. The operator lets the optimizer make that change underneath unchanged SQL. The optimizer extension is deliberately narrow: when a VGI function or plan is not eligible, the rewrite leaves DuckDB's stock operator alone.

The batched operator does four jobs:

1. Take a vector-sized DuckDB input chunk and extract the function arguments.
2. Remove duplicate argument tuples when the function is safe to deduplicate, then send the remaining arguments in one Arrow batch.
3. Receive zero or more result rows plus a `parent_row` value for every result row.
4. Copy the correct left-hand values onto each output row and emit an ordinary correlated result.

### What the parent-row map means

A `parent_row` value is not a database key, and it is not a row number in the final result. It is only a position in the current input chunk:

<div class="query-result" role="region" aria-label="How parent-row values map function results to the input chunk" tabindex="0">
  <div class="query-result__label">function result → parent input row</div>
  <table>
    <thead><tr><th>function result</th><th>parent_row</th><th>copy left values from</th></tr></thead>
    <tbody>
      <tr><td>Glen Allen, Virginia</td><td>0</td><td>input row 0 · Glen Allen, VA</td></tr>
      <tr><td>Ocean City, Florida</td><td>2</td><td>input row 2 · Ocean City</td></tr>
      <tr><td>Ocean City, Maryland</td><td>2</td><td>input row 2 · Ocean City</td></tr>
      <tr><td>Ocean City, New Jersey</td><td>2</td><td>input row 2 · Ocean City</td></tr>
    </tbody>
  </table>
</div>

On the wire, that middle column is an `int32` array `[0, 2, 2, 2]`, carried as Arrow batch metadata. There is no `1`, because input row 1—the deliberately missing place—produced no output. The repeated `2` says that three different output rows all came from the Ocean City input. The operator uses those four positions to gather the corresponding left-hand columns. Nothing has to infer parentage from output order.

For a strict 1→1 function, the response may omit the array and VGI uses the identity mapping `[0, 1, 2, …]`. A function that can filter or fan out must provide it: if the array is missing and the output row count does not match the input row count, VGI raises an error rather than guessing which left row each output belongs to.

This is also why the API code sees useful work rather than a procession of single values. It can call an upstream bulk endpoint once. If the API has no bulk endpoint, it can issue bounded concurrent requests. The TypeScript Open-Meteo function, for example, receives a batch of place names and runs its geocoding requests with a concurrency limit. VGI can remove repeated place names before making that call, then fan each answer back out to every left row that asked for it.

One batched VGI call does not magically mean one HTTP request; the upstream API decides what can be combined. The important change is that the function receives the inputs **together**, so it has the option. A row-at-a-time interface has already thrown that option away.

The distinction is visible in VGI's tests. A correlated query over 5,000 inputs produces a handful of `table_in_out.write_input` events—one per input chunk, subject to parallelism—instead of roughly 5,000. Separate tests compare the batched plan with the row-at-a-time fallback for 1→0, 1→1, and 1→N functions and require identical result multisets. The optimization changes the trip across the boundary, not the meaning of the query.

## Deduplication makes repeated values cheap

Batching helps even when every argument is different. Many useful API workloads are lower-cardinality than that: millions of customer records but a few hundred city names, many events but a small vocabulary of labels, or repeated locations across a shipment table.

VGI deduplicates argument tuples within a chunk before invoking a row-transform function. If twenty left rows contain only four distinct values, the function sees four. After the response arrives, VGI expands the result back across all twenty original rows, including any other left-hand columns that differ between them.

That optimization is gated by the function's declared **stability**. A `CONSISTENT` function promises the same arguments have the same result. `CONSISTENT_WITHIN_QUERY` makes that promise for the duration of one query. Both are safe to deduplicate inside an input chunk. A `VOLATILE` function is not: random values, wall-clock reads, and calls with observable side effects may legitimately do something different each time, so VGI sends every occurrence. The session setting `vgi_exchange_input_dedup` can also disable the optimization entirely.

This is a contract, not a heuristic VGI can infer by watching the output. The SDK default is `CONSISTENT`, so a function author must explicitly mark volatile behavior. In SQL terms, that is the right division: an optimizer may reuse a pure function result, but it must not silently reduce the number of calls to a volatile or side-effecting function. Geocoding is a natural fit for deduplication; an API operation that charges a card or advances a cursor is not.

Caching is a separate optimization. VGI also supports opt-in cached function results, which can make later `LATERAL` calls cheaper or avoid them entirely. Freshness, cache keys, and invalidation deserve their own post; none of that machinery is required for the batching and deduplication described here.

## How other query engines handle `LATERAL`

I surveyed the current releases and documentation for DataFusion, Spark, Trino, SQLite, and Polars on 30 August 2026. The narrow question was not “does the parser recognize `LATERAL`?” It was:

> Can user-defined code receive a batch of correlated inputs and return zero or more rows for each input, while SQL preserves the left-to-right association?

That distinction matters. Several engines have two of those pieces. Few put all of them on one path.

<div class="engine-comparison" aria-label="Comparison of correlated table-function support by query engine">
  <section class="engine-card engine-card--featured">
    <h3 class="engine-name"><img class="engine-logo--square" src="/images/duckdb-icon.svg" alt="" aria-hidden="true" width="24" height="24" loading="lazy" />DuckDB + VGI</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd><strong>Yes:</strong> <code>LATERAL f(t.x)</code></dd></div>
      <div><dt>Batch reaches user code</dt><dd><strong>Yes:</strong> Arrow chunks plus parent-row provenance.</dd></div>
      <div><dt>Practical external-API path</dt><dd>Direct. Inputs can also be deduplicated, with caching available when the function advertises a sound policy.</dd></div>
    </dl>
  </section>
  <section class="engine-card">
    <h3 class="engine-name"><img class="engine-logo--square" src="/images/datafusion-icon.svg" alt="" aria-hidden="true" width="24" height="24" loading="lazy" />DataFusion 55</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd>Yes, with basic <code>LATERAL</code> subqueries.</dd></div>
      <div><dt>Batch reaches user code</dt><dd>Partly. Async scalar UDFs are vectorized but remain 1→1; UDTFs create a <code>TableProvider</code> during planning.</dd></div>
      <div><dt>Practical external-API path</dt><dd>Return a list from an async UDF and <code>UNNEST</code> it in the select list, or build a custom plan. There is no single batched 0→N UDTF interface.</dd></div>
    </dl>
  </section>
  <section class="engine-card">
    <h3 class="engine-name"><img class="engine-logo--dark" src="/blog/duckdb-lateral-join-api-superpower/engine-spark.svg" alt="" aria-hidden="true" width="36" height="24" loading="lazy" />Spark 4.2</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd>Yes, for ordinary SQL and Python UDTFs.</dd></div>
      <div><dt>Batch reaches user code</dt><dd>Not on the same path. Classic UDTFs can be used laterally but are row-oriented; Arrow UDTFs are batched but barred from <code>LATERAL</code>.</dd></div>
      <div><dt>Practical external-API path</dt><dd>Batch through a table argument and carry a key for a later join, or accept row-at-a-time <code>LATERAL</code> evaluation.</dd></div>
    </dl>
  </section>
  <section class="engine-card">
    <h3 class="engine-name"><img class="engine-logo--dark" src="/blog/duckdb-lateral-join-api-superpower/engine-trino.svg" alt="" aria-hidden="true" width="36" height="24" loading="lazy" />Trino 483</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd>Yes, but table-function scalar arguments must be constant.</dd></div>
      <div><dt>Batch reaches user code</dt><dd>Row semantics are explicitly row by row; set semantics hand pages to a connector.</dd></div>
      <div><dt>Practical external-API path</dt><dd>Use a table argument and a custom Java connector. Batching changes the call from row semantics to set or partition semantics.</dd></div>
    </dl>
  </section>
  <section class="engine-card">
    <h3 class="engine-name"><img class="engine-logo--sqlite" src="/blog/duckdb-lateral-join-api-superpower/engine-sqlite.svg" alt="" aria-hidden="true" width="42" height="24" loading="lazy" />SQLite 3.53</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd>Yes in effect: correlated virtual table functions, without the keyword.</dd></div>
      <div><dt>Batch reaches user code</dt><dd>No vector-input contract.</dd></div>
      <div><dt>Practical external-API path</dt><dd>An eponymous virtual table can receive the left value as a hidden-column constraint, but scans are still per invocation.</dd></div>
    </dl>
  </section>
  <section class="engine-card">
    <h3 class="engine-name"><img class="engine-logo--square" src="/blog/duckdb-lateral-join-api-superpower/engine-polars.svg" alt="" aria-hidden="true" width="24" height="24" loading="lazy" />Polars 1.44</h3>
    <dl>
      <div><dt>Correlated 0→N SQL</dt><dd>No <code>LATERAL</code> join or custom SQL table-function surface.</dd></div>
      <div><dt>Batch reaches user code</dt><dd>Yes, in the expression API with <code>map_batches</code>.</dd></div>
      <div><dt>Practical external-API path</dt><dd>Batch in application code, return a list column, then <code>explode</code>. It works, but is not a callable correlated relation in SQL.</dd></div>
    </dl>
  </section>
</div>

There are a few recent changes hiding behind that table.

### DataFusion

DataFusion 54 added basic `CROSS`, `INNER`, and `LEFT JOIN LATERAL` support in June 2026. Its implementation uses decorrelation rather than literally re-running a subquery for every left row, which is the right foundation. It still has documented limits: outer references in the `LATERAL` subquery's select list and `HAVING` inside a lateral subquery are both listed as unsupported, and the keyword is mandatory—DataFusion does not detect correlation on its own ([DataFusion 54 release](https://datafusion.apache.org/blog/2026/06/12/datafusion-54.0.0/), [current lateral syntax](https://datafusion.apache.org/user-guide/sql/select.html#lateral-join)).

For extension authors, however, DataFusion's two useful APIs stop on opposite sides of the problem. An async scalar UDF receives Arrow arrays and even declares an ideal batch size, making it a good place for network I/O—but scalar UDF output has the same number of rows as its input. A table UDF can return an arbitrary table, but its interface takes expressions and creates a `TableProvider` during planning; it is not handed a runtime batch of correlated values ([DataFusion UDF guide](https://datafusion.apache.org/library-user-guide/functions/adding-udfs.html)). You can compose an async UDF that returns lists with an `UNNEST`, but you are building the bridge yourself—and the `UNNEST` has to sit in the select list, because DataFusion does not yet support implicit lateral references from a `FROM`-clause `UNNEST` such as `FROM orders AS t, UNNEST(t.items)`.

### Spark

Spark is the closest comparison, and its current behavior is especially revealing. A normal Python UDTF can be used laterally and yield any number of rows, but its `eval` method is invoked for each input row. Arrow makes transfer cheaper; it does not change that row-oriented call contract ([PySpark UDTFs](https://spark.apache.org/docs/latest/api/python/tutorial/sql/python_udtf.html)).

Spark 4.1 introduced a genuinely vectorized `arrow_udtf`: it receives PyArrow arrays or record batches and can emit zero or more batches. That sounds like the whole answer. But Spark explicitly disallows lateral joins with Arrow Python UDTFs ([Arrow UDTF guide](https://spark.apache.org/docs/latest/api/python/tutorial/sql/arrow_python_udtf.html), [SPARK-52982](https://issues.apache.org/jira/browse/SPARK-52982)). The separation leaves the same association problem: an arbitrary output batch needs a way to say which outer input produced each of its 0→N rows. VGI's `parent_row` metadata supplies exactly that map.

### Trino

Trino has both `LATERAL` and a serious polymorphic table-function API. Its table functions can process pages, report pass-through row indexes, and work with external systems. But scalar table-function arguments must be constant, so a per-row input arrives as a table argument instead. Declare that argument with row semantics and Trino says plainly that it is processed row by row. Declare set semantics and the function can process pages, but the author now owns partitioning, pass-through columns, and a connector plugin rather than writing `f(t.x)` ([Trino table functions](https://trino.io/docs/current/functions/table.html), [developer guide](https://trino.io/docs/current/develop/table-functions.html)). Capable machinery, certainly. But not the same easy call shape.

### SQLite and Polars

SQLite is the charming exception to the syntax test. It has no `LATERAL` keyword, yet its table-valued virtual tables can take a left-hand column as an argument. The official JSON example is `FROM user, json_each(user.phone)`: `json_each` produces zero or more rows for each phone value. Underneath, function arguments become constraints on hidden virtual-table columns ([SQLite JSON functions](https://www.sqlite.org/json1.html#jeach), [virtual table functions](https://www.sqlite.org/vtab.html#tabfunc2)). That gives the right relational result, but the virtual-table interface offers no batch of outer values to an API client.

Polars has the inverse strengths. Its SQL interface documents file-reading table functions, ordinary joins, and `UNNEST`, but no `LATERAL` join or registration point for a custom SQL table function ([Polars SQL `SELECT`](https://docs.pola.rs/user-guide/sql/select/)). Its expression API does have `map_batches`, and a function can return list-shaped results that are later exploded ([Polars `map_batches`](https://docs.pola.rs/api/python/stable/reference/expressions/api/polars.Expr.map_batches.html)). So the computation is possible and can be efficiently batched; the application has to assemble the correlation and expansion outside the SQL table-function model.

The result of the survey is not that other engines cannot do useful versions of this. They can. The point is that the four properties—plain SQL correlation, 0→N output, a batch visible to user code, and automatic reconstruction of the left-row association—rarely arrive together.

## Why DuckDB is still the best fit

For this kind of API-shaped work, I have not found anything that fits better. `LATERAL` lets SQL express the real shape of the work: there is a table of things we know, a function that can discover more about each one, and a result whose cardinality is not known in advance. No temporary table or client-side merge is needed to explain that.

VGI makes the physical execution match modern service interfaces. Inputs reach the function in Arrow batches. Repeated arguments can be collapsed. The API integration can use a bulk endpoint or controlled concurrency. Its output carries enough provenance for DuckDB to reconstruct the correlated result exactly, including the awkward zero-row and many-row cases. If the function advertises a sound cache policy, later calls can be cheaper still.

That is an unusually good division of labor. SQL says which rows depend on which other rows. DuckDB plans and joins them. VGI handles the batch boundary. The function integration worries about the API.

And the query still looks like a query.
