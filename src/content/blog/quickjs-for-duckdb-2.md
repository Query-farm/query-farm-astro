---
title: "QuickJS for DuckDB 2.0: pass real values to JavaScript"
description: "QuickJS for DuckDB 2.0 passes lists, structs, dates, and large integers as native JavaScript values, with memory limits, timeouts, and fixes for crashing scripts."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "JavaScript", "SQL"]
extensions: ["quickjs"]
draft: false
showDescription: false
heroImage: "/media/posts/quickjs-for-duckdb-2/social.png"
heroImageAlt: "QuickJS for DuckDB 2.0: pass real values to JavaScript. A circle, square, and triangle retain their distinct types as they enter JavaScript braces, with a clock limiting the call."
leadVisual:
  src: "/media/posts/quickjs-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "QuickJS"
  pitch: "Evaluate JavaScript functions against DuckDB values, or return a JavaScript array as rows."
  href: "/products/extensions/quickjs/"
  cta: "Explore QuickJS"
  extension: "quickjs"
  repo: "https://github.com/Query-farm/quickjs"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>DuckDB lists become JavaScript arrays, structs become objects, and dates become <code>Date</code> values. Large integers become <code>BigInt</code> without losing digits.</li>
      <li>Each JavaScript runtime has a 256 MB heap limit by default. A separate, opt-in timeout can stop individual evaluations.</li>
      <li>Recursion, failed allocations, and unusual exception values now produce query errors instead of taking down the process.</li>
    </ul>
  </div>
</aside>

This expression ought to return 2:

```sql
SELECT quickjs_eval('(x) => x + 1', 1::SMALLINT) AS incremented;
```

<div class="query-result" role="region" aria-label="Result: incremented" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>incremented</th></tr></thead>
    <tbody>
      <tr><td>2</td></tr>
    </tbody>
  </table>
</div>

In the old build, the argument arrived in JavaScript as a string. JavaScript did exactly what it does with `'1' + 1`: it returned `'11'`. The same problem affected `TINYINT` and decimals. Casting a column could change the meaning of the JavaScript expression without changing the expression itself.

The DuckDB 2.0 update to [QuickJS](/products/extensions/quickjs/) fixes that conversion and expands it to the nested and temporal types you are likely to pass from a query. We also added controls for scripts that allocate too much memory or never finish, and updated the embedded engine to QuickJS-NG 0.18.0.

## Use the value you already have

There is no need to turn a list into JSON text just to use `map`:

```sql
SELECT quickjs_eval('(values) => values.map(x => x * x)', [1, 2, 3]) AS squares;
```

<div class="query-result" role="region" aria-label="Result: squares" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>squares</th></tr></thead>
    <tbody>
      <tr><td>[1,4,9]</td></tr>
    </tbody>
  </table>
</div>

A row or struct becomes an object, including its nested values:

```sql
SELECT quickjs_eval(
    '(item) => item.name + ":" + item.tags.join("|")',
    {'name': 'duck', 'tags': ['a', 'b']}
) AS label;
```

<div class="query-result" role="region" aria-label="Result: label" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>label</th></tr></thead>
    <tbody>
      <tr><td>"duck:a|b"</td></tr>
    </tbody>
  </table>
</div>

`quickjs_eval` returns JSON, which is why the string result includes quotes. The scalar `quickjs(code)` function returns text, while the table form turns an array result into rows.

The conversions are defined by the input type:

| DuckDB value | JavaScript value |
| --- | --- |
| Booleans, integers within the safe range, floats, decimals | Boolean or Number |
| Integers outside the safe Number range | BigInt |
| `LIST`, `ARRAY` | Array |
| `STRUCT`, `MAP` | Object |
| `UNION` | Its active member |
| Finite dates and timestamps | Date, in UTC at millisecond precision |
| `BLOB` | Uint8Array |

Other types, including UUIDs and intervals, use their string representation. Decimals become JavaScript Numbers, so this is not an exact decimal arithmetic interface. Timestamps finer than milliseconds lose that extra precision when converted to `Date`; infinite dates remain strings.

## Keep the digits in large integers

JavaScript Numbers cannot represent every integer above 2<sup>53</sup> − 1. Passing a 64-bit identifier through that conversion can quietly change the identifier.

The extension now uses `BigInt` outside the safe Number range:

```sql
SELECT quickjs_eval('(x) => typeof x', 9007199254740993::BIGINT) AS type,
       quickjs_eval('(x) => x', 9007199254740993::BIGINT) AS value;
```

<div class="query-result" role="region" aria-label="Result: type, value" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>type</th><th>value</th></tr></thead>
    <tbody>
      <tr><td>"bigint"</td><td>9007199254740993</td></tr>
    </tbody>
  </table>
</div>

BigInt results are serialized as JSON numbers with their digits intact. A later consumer can still lose precision if it parses that JSON into ordinary JavaScript Numbers. The boundary here preserves the value; downstream code must do the same.

This also affects arithmetic in existing scripts. JavaScript will not mix a BigInt with a Number in `x + 1`. Use a BigInt literal, such as `1n`, when the input is known to be a BigInt, or handle the two cases explicitly when a column crosses the safe-integer boundary.

## Stop a script without stopping DuckDB

A QuickJS runtime now has a default heap limit of `256MB`. It is a limit on each runtime, with one runtime per execution thread and query, rather than a total budget for all JavaScript running in the database.

You can lower that limit and set a timeout:

```sql
SET quickjs_memory_limit = '64MB';
SET quickjs_timeout_ms = 200;

SELECT quickjs_eval('(n) => n * 2', 21) AS doubled;
```

<div class="query-result" role="region" aria-label="Result: doubled" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>doubled</th></tr></thead>
    <tbody>
      <tr><td>42</td></tr>
    </tbody>
  </table>
</div>

The timeout applies to each scalar evaluation, or to the whole call of the table function. Its default is **0**, meaning disabled. The interrupt handler also checks DuckDB's query deadline and cancellation, including while processing asynchronous promise jobs.

An allocation failure must remain a failure even if the script catches JavaScript exceptions. The extension tracks whether the runtime hit its memory limit and reports it after evaluation. It also handles the awkward case where QuickJS has too little memory left to allocate an error object. That now reports an out-of-memory error instead of an unexplained `null` exception.

## A few smaller corrections matter

The table function now accepts multi-statement scripts and uses their completion value:

```sql
SELECT value FROM quickjs('let a = [1, 2]; a.push(arg0); a', 3) AS results(value);
```

<div class="query-result" role="region" aria-label="Result: value" tabindex="0">
  <div class="query-result__label">result · 3 rows</div>
  <table>
    <thead><tr><th>value</th></tr></thead>
    <tbody>
      <tr><td>1</td></tr>
      <tr><td>2</td></tr>
      <tr><td>3</td></tr>
    </tbody>
  </table>
</div>

Plain string arguments no longer have to survive an unconditional `JSON.parse`. Embedded NUL bytes retain their length. `quickjs_eval` returns SQL `NULL` for `undefined`, while JavaScript `null` remains JSON `null`.

Recursion and deeply nested inputs have stack checks. Returning or throwing a Symbol no longer follows a failed string conversion into a process crash. These cases are recorded in the [regression tests](https://github.com/Query-farm/quickjs/blob/67e93b8b78/test/sql/quickjs_regressions.test), alongside the [type conversions](https://github.com/Query-farm/quickjs/blob/67e93b8b78/test/sql/quickjs_types.test) and [resource limits](https://github.com/Query-farm/quickjs/blob/67e93b8b78/test/sql/quickjs_limits.test).

The embedded environment still has no filesystem, network, process, or module access. It is useful for applying JavaScript logic to query data. The [extension page](/products/extensions/quickjs/) documents all three forms; when upgrading, start with scripts that parse arguments themselves or depend on their old string types.
