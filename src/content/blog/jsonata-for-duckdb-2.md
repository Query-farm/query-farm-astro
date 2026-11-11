---
title: "JSONata for DuckDB 2.0: expressions that can be stopped"
description: "JSONata for DuckDB 2.0 adds evaluation timeouts, depth limits, syntax validation, and compiled-expression caching, with RE2 patterns and correct per-row randomness."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "JSON", "Scripting"]
extensions: ["jsonata"]
draft: false
showDescription: false
heroImage: "/media/posts/jsonata-for-duckdb-2/social.png"
heroImageAlt: "JSONata for DuckDB 2.0: expressions that can be stopped. A branching tree of JSON values passes through expression brackets and is reshaped into selected result rows."
leadVisual:
  src: "/media/posts/jsonata-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "JSONata"
  pitch: "Query and transform JSON values with JSONata expressions inside DuckDB."
  href: "/products/extensions/jsonata/"
  cta: "Explore JSONata"
  extension: "jsonata"
  repo: "https://github.com/Query-farm/jsonata"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Each JSONata evaluation now has a default ten-second timeout and a depth limit of 1,000, with a separate native stack guard.</li>
      <li><code>jsonata_validate</code> checks expression syntax without evaluating it. Parsed expressions are reused within each execution thread.</li>
      <li>Regular expressions use RE2, and calls to <code>$random()</code>, <code>$now()</code>, and <code>$millis()</code> retain their per-row behavior.</li>
    </ul>
  </div>
</aside>

There are two ways a recursive expression can get stuck. It can keep adding calls until the stack runs out, or it can use tail recursion and run forever without growing the stack. Fixing one does not fix the other.

Both cases mattered in the [JSONata extension](/products/extensions/jsonata/). A transformation that looked like an ordinary scalar function could crash DuckDB or leave a query running indefinitely. The 2.0 update adds checks for evaluation time, depth, native stack space, and query interruption. It also updates jsonata-cpp to 0.3.0, replaces the regular-expression engine, and stops parsing the same expression again for every row.

## The ordinary query stays short

The function still takes a JSONata expression and a JSON value:

```sql
SELECT jsonata(
    '$sum(items.price)',
    '{"items": [{"price": 12}, {"price": 8}, {"price": 5}]}'
) AS total;
```

<div class="query-result" role="region" aria-label="Result: total" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>total</th></tr></thead>
    <tbody>
      <tr><td>25</td></tr>
    </tbody>
  </table>
</div>

A third argument supplies variable bindings. That is useful when the transformation stays fixed and the parameters change:

```sql
SELECT jsonata(
    'items[price > $minimum].name',
    '{"items": [{"name": "coffee", "price": 12},
                {"name": "tea", "price": 8}]}',
    '{"minimum": 10}'
) AS name;
```

<div class="query-result" role="region" aria-label="Result: name" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>name</th></tr></thead>
    <tbody>
      <tr><td>"coffee"</td></tr>
    </tbody>
  </table>
</div>

The result is JSON. The extension keeps JSONata's sequence behavior, including returning a single value when a selection has one result. If a downstream query needs a list regardless of the number of matches, express that shape in the JSONata expression.

## Give each evaluation a deadline

Two settings control the evaluator:

```sql
SELECT current_setting('jsonata_timeout_ms') AS timeout_ms,
       current_setting('jsonata_max_depth') AS max_depth;
```

<div class="query-result" role="region" aria-label="Result: timeout_ms, max_depth" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>timeout_ms</th><th>max_depth</th></tr></thead>
    <tbody>
      <tr><td>10000</td><td>1000</td></tr>
    </tbody>
  </table>
</div>

The timeout applies to one evaluation. Twenty thousand fast rows do not collectively spend a single ten-second allowance. A recursive expression that never returns, however, must stop within its own evaluation budget:

```sql
SET jsonata_timeout_ms = 100;

SELECT jsonata('($f := function($x){ $f($x) }; $f(1))', '{}');
```

This raises a timeout error after the evaluation spends its 100 ms budget.

Reset the setting after experimenting with it:

```sql
RESET jsonata_timeout_ms;
```

`jsonata_max_depth` limits evaluation nesting. Setting either limit to zero disables that limit, but disabling the depth limit does not disable the native stack guard. Threads have different stack sizes across platforms; on a small stack, the guard can stop an expression before it reaches the configured depth.

The extension checks deeply nested JSON data and bindings before parsing them, and checks expression structure before handing it to the recursive parser. The point is to report a query error while the process still has enough stack space to report one.

## Validate syntax before evaluating rows

`jsonata_validate` is new:

```sql
SELECT expression, jsonata_validate(expression) AS valid
FROM (VALUES ('$sum(items.price)'), ('$sum(')) t(expression);
```

<div class="query-result" role="region" aria-label="Result: expression, valid" tabindex="0">
  <div class="query-result__label">result · 2 rows</div>
  <table>
    <thead><tr><th>expression</th><th>valid</th></tr></thead>
    <tbody>
      <tr><td>$sum(items.price)</td><td>true</td></tr>
      <tr><td>$sum(</td><td>false</td></tr>
    </tbody>
  </table>
</div>

This is a syntax check, not a trial execution. A syntactically valid recursive function can still time out. A valid expression can also fail on a document with the wrong types or call a function that does not exist. Use the check to reject malformed expressions when accepting them, then keep the evaluation limits in place when running them.

## Reuse parsed expressions without reusing their answers

Parsed expressions now live in a small cache owned by an execution thread and query. A constant expression can be reused across a column; a column of expressions can reuse its recently encountered entries. The objects are not shared between execution threads because the library keeps thread-local evaluation state.

Caching the parsed expression must not cache a random result. The extension now marks expressions using `$random`, `$now`, `$millis`, or `$eval` as volatile. Expressions supplied by a column are treated conservatively too. For example:

```sql
SELECT count(DISTINCT jsonata('$random()', '{}')) > 1 AS varies
FROM range(100);
```

<div class="query-result" role="region" aria-label="Result: varies" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>varies</th></tr></thead>
    <tbody>
      <tr><td>true</td></tr>
    </tbody>
  </table>
</div>

A pure constant expression can still be folded. The distinction lets DuckDB avoid repeated work when the result is fixed without turning one random draw into an entire column.

## Check existing regular expressions

The regex implementation now uses RE2. Long subjects and patterns prone to catastrophic backtracking no longer use `std::regex`'s recursive matcher. Ordinary matching, splitting, replacement groups, Unicode, and the supported flags are covered by the extension's tests.

There is a compatibility cost: RE2 does not support lookaround or backreferences in patterns. An expression using those constructs now fails validation or evaluation with an invalid-regex error. Replacement strings can still use captured groups, such as `$2 $1`; that is different from a backreference inside the pattern.

The [implementation update](https://github.com/Query-farm/jsonata/commit/ac09a23), [limit tests](https://github.com/Query-farm/jsonata/blob/81499fda3e/test/sql/jsonata_limits.test), and [function tests](https://github.com/Query-farm/jsonata/blob/81499fda3e/test/sql/jsonata_functions.test) record these behaviors. The [extension page](/products/extensions/jsonata/) has the complete function reference. On upgrade, check your regex syntax and any legitimate transformation that needs more than the default ten seconds for one document.
