---
title: "Fuzzycomplete for DuckDB 2.0: put the useful suggestion first"
description: "Fuzzycomplete now ranks relevant tables and columns first, handles SQL comments, and matches DuckDB 2.0 shell completion metadata without hiding tied matches."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Developer Tools"]
extensions: ["fuzzycomplete"]
draft: false
showDescription: false
heroImage: "/media/posts/fuzzycomplete-for-duckdb-2/social.png"
heroImageAlt: "Fuzzycomplete for DuckDB 2.0: put the useful suggestion first. Uneven rows of paper letter tiles pass a ranking strip and settle into an ordered list with the closest completion highlighted."
leadVisual:
  src: "/media/posts/fuzzycomplete-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Fuzzycomplete"
  pitch: "Complete SQL keywords, table names, columns and paths from abbreviated or mistyped input."
  href: "/products/extensions/fuzzycomplete/"
  cta: "Explore Fuzzycomplete"
  extension: "fuzzycomplete"
  installNote: "These changes are in the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/fuzzycomplete"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Equally good fuzzy matches now favor your tables, columns from the query, and common SQL statements.</li>
      <li>Completion returns the five columns the DuckDB 2.0 shell expects, including the suggestion type and trailing character.</li>
      <li>Comments, very large suggestion limits and filenames that cannot be represented as UTF-8 no longer trip up completion.</li>
    </ul>
  </div>
</aside>

You have typed enough of a table name to know which one you mean. The completion list has other ideas. A built-in function comes first, then a system table, then the table you use every day.

[Fuzzycomplete](/products/extensions/fuzzycomplete/) already matched abbreviated names such as `cstmr_ord_hst` to `customer_order_history`. Its DuckDB 2.0 update improves the ordering around those matches and makes the results fit the shell's completion interface. The matcher had been calculating useful ranking bonuses all along. It just wasn't applying them.

## The same match, with a better tie-breaker

A fuzzy score measures how closely the characters match. It does not tell you whether a candidate is relevant to the query. Two equally good names can have very different uses.

The new ordering applies the existing candidate bonuses when fuzzy scores tie. Common statement keywords come before less common ones. User tables, views, catalogs and schemas come before built-in objects. Columns from tables named in the query come before other columns, and columns come before functions.

Here is a small catalog where that distinction matters:

```sql
CREATE TABLE customer_order_history (
    order_total INTEGER,
    order_id INTEGER
);
CREATE TABLE store_inventory (order_quantity INTEGER);

SELECT suggestion
FROM sql_auto_complete('SELECT * FROM store_inventory WHERE ordr')
LIMIT 1;
```

<div class="query-result" role="region" aria-label="Result: suggestion" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>suggestion</th></tr></thead>
    <tbody>
      <tr><td>order_quantity</td></tr>
    </tbody>
  </table>
</div>

Change the referenced table to `customer_order_history`, and its columns move ahead. At the start of a statement, an empty input puts `SELECT` first; completing `D` puts `DELETE` first.

The reported `suggestion_score` deliberately stays unchanged by the bonus. The shell uses that score to distinguish a clear winner from a tie. Reordering equally plausible choices should make the list more useful, without causing the shell to silently accept a choice that remains ambiguous.

## Give the shell the information it expects

The 2.0 shell expects five fields from `sql_auto_complete`:

| Column | Purpose |
| --- | --- |
| `suggestion` | Text to insert |
| `suggestion_start` | Where replacement begins |
| `suggestion_type` | Keyword, table, column, function, file or directory |
| `suggestion_score` | Distance from the best fuzzy match; zero is best |
| `extra_char` | A following space, quote or path separator where appropriate |

Earlier output did not match that shape. The update supplies all five columns and the types the shell expects. It also reports table macros as `table_function`, instead of calling them tables.

You can inspect a completion directly from SQL:

```sql
SELECT suggestion, suggestion_start, suggestion_type, suggestion_score
FROM sql_auto_complete('SELECT * FROM cstmr_ord_hst');
```

<div class="query-result" role="region" aria-label="Result: suggestion, suggestion_start, suggestion_type, suggestion_score" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>suggestion</th><th>suggestion_start</th><th>suggestion_type</th><th>suggestion_score</th></tr></thead>
    <tbody>
      <tr><td>customer_order_history</td><td>14</td><td>table</td><td>0</td></tr>
    </tbody>
  </table>
</div>

With the example table above, the result is `customer_order_history`, starting at position 14, with type `table` and score 0. The [shell-interface tests](https://github.com/Query-farm/fuzzycomplete/blob/1f921db/test/sql/fuzzycomplete_cli_columns.test) also cover catalogs, schemas, scalar functions, filenames and trailing characters.

Loading Fuzzycomplete after the stock `autocomplete` extension now activates the fuzzy implementation correctly. That matters in a shell that has already loaded completion before you load this extension.

## Comments should stay comments

Completion needs enough SQL awareness to recognize what you are typing. It should not try to finish a word inside a comment.

The parser now skips block comments like whitespace and returns no suggestions while a block comment is unfinished. Text after `--` stays in the comment until the newline. Both forms work between a keyword and its argument:

```sql
SELECT suggestion
FROM sql_auto_complete('SELECT * FROM/**/cstmr_ord')
LIMIT 1;
```

<div class="query-result" role="region" aria-label="Result: suggestion" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>suggestion</th></tr></thead>
    <tbody>
      <tr><td>customer_order_history</td></tr>
    </tbody>
  </table>
</div>

This also keeps the replacement offset correct. Recognizing the right table is only half the job; inserting it at the wrong position still breaks the statement.

## A directory listing should not crash the shell

File completion exposed a less visible problem. On filesystems that permit filenames with invalid UTF-8, converting a candidate to Rust text could panic and abort the process. Such names are now skipped because they cannot be returned as a DuckDB `VARCHAR`. The Rust boundary also checks pointers and catches panics instead of allowing them to escape into C++.

Large suggestion limits are capped by the available candidate pool, rather than allocating a slot for every requested result. File completion respects DuckDB's external-access setting; catalog completion continues to work when filesystem access is disabled.

These changes are covered by the [ranking and robustness tests](https://github.com/Query-farm/fuzzycomplete/blob/aff4ebf26eff1822453a6fa3f73e11ebf97ac638/test/sql/fuzzycomplete_robustness.test) and the [implementation change](https://github.com/Query-farm/fuzzycomplete/commit/aff4ebf26eff1822453a6fa3f73e11ebf97ac638). They do not change fuzzy completion into a query planner. They make the suggestions it already knows how to find more useful at the cursor.

Install the 2.0 build through the [Query Farm extension repository](/blog/duckdb-2-query-farm-repository/) and load `fuzzycomplete` in your DuckDB shell. The [extension page](/products/extensions/fuzzycomplete/) has the full setup and function reference.
