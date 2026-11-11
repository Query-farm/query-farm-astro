---
title: "Rhai for DuckDB 2.0: cached rules and bounded execution"
description: "DuckDB’s Rhai extension now caches compiled rules, limits their work, and removes filesystem access while keeping per-row results and errors queryable in SQL."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Scripting", "SQL"]
extensions: ["evalexpr_rhai"]
draft: false
showDescription: false
heroImage: "/media/posts/evalexpr-rhai-for-duckdb-2/social.png"
heroImageAlt: "Rhai for DuckDB 2.0: cached rules and bounded execution. Rows feed arithmetic pieces inside a bounded evaluation frame, with a clock and reusable result card beside it."
leadVisual:
  src: "/media/posts/evalexpr-rhai-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Rhai expression evaluation"
  pitch: "Evaluate Rhai expressions against row data and inspect successful values and errors in SQL."
  href: "/products/extensions/evalexpr_rhai/"
  cta: "Explore Rhai"
  extension: "evalexpr_rhai"
  repo: "https://github.com/Query-farm/evalexpr_rhai"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Rhai expressions now have limits on operations, strings, arrays, maps, and call depth. Long-running evaluations can be cancelled.</li>
      <li>Scripts cannot open files, import modules from disk, or use the scientific package's file and URL readers.</li>
      <li>Compiled expressions are cached per execution thread. Results still use the existing <code>ok</code>/<code>error</code> union, so a failed rule can remain a row in the result.</li>
    </ul>
  </div>
</aside>

A rule stored in a table is still a program. If it contains an infinite loop, applying it to a column should not mean waiting forever. If it asks to open a file, it should not gain access simply because the scripting library happens to provide that function.

Those were the problems behind the DuckDB 2.0 update to [evalexpr_rhai](/products/extensions/evalexpr_rhai/). The extension evaluates [Rhai](https://rhai.rs/) expressions against JSON context, returning either a JSON value or an error. The new build keeps that SQL interface and changes the environment in which the expression runs: bounded work, no host I/O, cancellation, and reuse of compiled rules.

## Keep the rule and its result together

Pass the row's values as the expression's `context`:

```sql
SELECT n,
       evalexpr_rhai('context.n * 2', {'n': n}).ok::INTEGER AS doubled
FROM range(4) t(n)
ORDER BY n;
```

<div class="query-result" role="region" aria-label="Result: n, doubled" tabindex="0">
  <div class="query-result__label">result · 4 rows</div>
  <table>
    <thead><tr><th>n</th><th>doubled</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>0</td></tr>
      <tr><td>1</td><td>2</td></tr>
      <tr><td>2</td><td>4</td></tr>
      <tr><td>3</td><td>6</td></tr>
    </tbody>
  </table>
</div>

The return type is `UNION(ok JSON, error VARCHAR)`. Successful evaluation selects the `ok` member; a script error selects `error`. That lets a batch record failed rules without throwing away the successful ones:

```sql
WITH rules(id, expression) AS (
    VALUES (1, 'context.n * 2'),
           (2, 'throw "rule needs review"')
), evaluated AS (
    SELECT id, evalexpr_rhai(expression, '{"n": 21}') AS result
    FROM rules
)
SELECT id, result.ok AS value, result.error AS error
FROM evaluated
ORDER BY id;
```

The first row contains 42. The second contains the runtime error, including its location in the script. A NULL expression returns SQL NULL. A NULL context evaluates the expression without a `context` variable, which is different from defining that variable as JSON null.

Malformed JSON text can still fail DuckDB's JSON cast before it reaches Rhai. The union reports script evaluation failures; it does not suppress every SQL error around the call.

## Put a budget on evaluation

The new limits apply to each evaluation:

| Setting | Default |
| --- | ---: |
| `evalexpr_rhai_max_operations` | 100,000,000 operations |
| `evalexpr_rhai_max_string_size` | 16,777,216 bytes |
| `evalexpr_rhai_max_array_size` | 1,000,000 elements |
| `evalexpr_rhai_max_map_size` | 1,000,000 properties |
| `evalexpr_rhai_max_call_levels` | 64 nested calls |

For a small business rule, you can use a much smaller operation budget:

```sql
SET evalexpr_rhai_max_operations = 1000;

SELECT evalexpr_rhai('loop {}').error LIKE 'Too many operations%' AS stopped;
```

<div class="query-result" role="region" aria-label="Result: stopped" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>stopped</th></tr></thead>
    <tbody>
      <tr><td>true</td></tr>
    </tbody>
  </table>
</div>

```sql
RESET evalexpr_rhai_max_operations;
```

An operation count is not a wall-clock timeout. It bounds Rhai's work according to the evaluator's accounting. The engine also polls DuckDB for interruption, so cancellation can reach a running script.

Zero disables an individual limit. A separate depth check rejects results nested more than 128 levels before serializing them to JSON. This is needed even when the script itself completes: returning a deeply nested object can exhaust a recursive serializer's stack.

The limits are read for a new query's execution state, so changing a setting affects subsequent queries. They apply whether the expression is a constant in the SQL text or comes from a column.

## Remove host access from the language environment

The earlier build registered filesystem functions that could bypass DuckDB's `enable_external_access` setting. The new build does not register them. It also disables file and URL reading in the scientific package and installs a module resolver that refuses filesystem imports.

That is a behavior change for scripts using `open_file`, `path`, `cwd`, `read_matrix`, or imports from disk. Read the data through DuckDB and pass it into the expression as context instead. URL parsing remains available; parsing a URL does not make a network request.

`print` and `debug` remain valid calls, but they no longer write to the host process's standard output or error streams. The useful result of a script is the value it returns to the query.

## Compile the rule once

A query often applies one expression to thousands of contexts. The new implementation keeps an engine and a cache of compiled expressions in each execution thread, with up to 256 cached expressions. Compile errors are cached too, while still being reported for each affected row. A fresh scope keeps one row's variables from becoming another row's context.

This avoids repeatedly compiling the same source text. It is not a promise that every script becomes faster: evaluating a large expression or building a large result can still dominate its cost.

The [main update](https://github.com/Query-farm/evalexpr_rhai/commit/113c28b) and [module-import follow-up](https://github.com/Query-farm/evalexpr_rhai/commit/d6d9f3d) are on `v2.0`. The [limit tests](https://github.com/Query-farm/evalexpr_rhai/blob/429df6a04c/test/sql/evalexpr_rhai_limits.test) and [host-access tests](https://github.com/Query-farm/evalexpr_rhai/blob/429df6a04c/test/sql/evalexpr_rhai_security.test) pin these behaviors. The [extension reference](/products/extensions/evalexpr_rhai/) has the installation and function details. For existing scripts, check their I/O dependencies and choose limits appropriate to the amount of work each row should perform.
