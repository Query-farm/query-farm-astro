---
title: "Inflector for DuckDB 2.0: unique column names and per-connection acronyms"
description: "Inflector for DuckDB 2.0 isolates acronym settings by connection, resolves renamed column collisions, and adds human-readable labels, URL slugs, and class names."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Text", "Data Cleaning"]
extensions: ["inflector"]
draft: false
showDescription: false
heroImage: "/media/posts/inflector-for-duckdb-2/social.png"
heroImageAlt: "Inflector for DuckDB 2.0: unique column names and per-connection acronyms. Two nested paper tables preserve their structure as differently styled field-name strips are renamed between them."
leadVisual:
  src: "/media/posts/inflector-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Inflector"
  pitch: "Convert text, struct fields, and query column names to a consistent naming convention."
  href: "/products/extensions/inflector/"
  cta: "Explore Inflector"
  extension: "inflector"
  repo: "https://github.com/Query-farm/inflector"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Renaming columns or struct fields now resolves collisions in order, including inside nested structs.</li>
      <li><code>inflector_acronyms</code> belongs to the connection that sets it. One client's preferences no longer change another client's results.</li>
      <li>New helpers make human-readable labels, URL slugs, and singular class names. NULLs and embedded NUL bytes also get consistent handling.</li>
    </ul>
  </div>
</aside>

`fooBar`, `foo_bar`, and `Foo Bar` are three different column names. Convert all three to snake case and they become the same name. A case conversion library can do its job correctly and still leave the database with a schema it cannot use.

The [Inflector extension](/products/extensions/inflector/) works on strings, but it also renames query columns and nested struct fields. Its DuckDB 2.0 update deals with the problems that appear at that second level: duplicate names, connection-specific acronym preferences, and NULL values that need to keep their place in a nested result.

## Keep every column after renaming

The table form of `inflect` applies a naming convention to a query's output:

```sql
SELECT column_name
FROM (DESCRIBE SELECT * FROM inflect('snake', (
    SELECT 1 AS fooBar, 2 AS foo_bar, 3 AS "Foo Bar", 4 AS foo_bar_1
)));
```

<div class="query-result" role="region" aria-label="Result: column_name" tabindex="0">
  <div class="query-result__label">result · 4 rows</div>
  <table>
    <thead><tr><th>column_name</th></tr></thead>
    <tbody>
      <tr><td>foo_bar</td></tr>
      <tr><td>foo_bar_1</td></tr>
      <tr><td>foo_bar_2</td></tr>
      <tr><td>foo_bar_1_1</td></tr>
    </tbody>
  </table>
</div>

Names are made unique in column order, using DuckDB's case-insensitive comparison. A collision receives `_1`, then `_2`, and so on. The last name above starts as `foo_bar_1`, which has already been assigned to the second column, so it receives its own suffix.

The rule is deterministic, but the order matters. If downstream code depends on the generated names, keep the input column order stable or give important columns explicit names before passing the query to `inflect`.

Struct fields use the same rule, recursively:

```sql
SELECT inflect('snake', {
    'fooBar': 1,
    'foo_bar': 2,
    'nested': {'aB': 3, 'a_b': 4}
}) AS renamed;
```

<div class="query-result" role="region" aria-label="Result: renamed" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>renamed</th></tr></thead>
    <tbody>
      <tr><td>{'foo_bar': 1, 'foo_bar_1': 2, 'nested': {'a_b': 3, 'a_b_1': 4}}</td></tr>
    </tbody>
  </table>
</div>

Previously the struct path could produce duplicate field names, which are invalid in DuckDB. A name that converts to an empty string now retains its original spelling. Values pass through unchanged.

## An acronym preference belongs to one connection

Suppose one application wants `HTMLParser` and another wants `HtmlParser`. Inflector already had an acronym setting, but its implementation stored the list in a process-wide Rust variable. Setting it from one connection changed the behavior of other connections, including those using another DuckDB database in the same process.

The setting now comes from the current connection:

```sql
SET inflector_acronyms = ['HTML', 'API'];

SELECT inflector_to_pascal_case('html_api_parser') AS name;
```

<div class="query-result" role="region" aria-label="Result: name" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>name</th></tr></thead>
    <tbody>
      <tr><td>HTMLAPIParser</td></tr>
    </tbody>
  </table>
</div>

```sql
RESET inflector_acronyms;

SELECT inflector_to_pascal_case('html_api_parser') AS name;
```

<div class="query-result" role="region" aria-label="Result: name" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>name</th></tr></thead>
    <tbody>
      <tr><td>HtmlApiParser</td></tr>
    </tbody>
  </table>
</div>

A second connection keeps its own list throughout. The same preference applies to scalar transformations, struct field names, and the table function's output names.

Prepared scalar calls read the setting in effect when they execute. Schema-changing transformations resolve names when the query is bound, because DuckDB needs the output schema before execution. If an application previously relied on one connection configuring acronyms for the whole process, it now needs to set them on each connection that uses them.

## Labels, slugs, and class names

Three new functions cover common naming tasks that take more than changing case:

```sql
SELECT inflector_humanize('employee_salary') AS label,
       inflector_parameterize('Crème Brûlée: A Recipe!') AS slug,
       inflector_classify('people') AS class_name;
```

<div class="query-result" role="region" aria-label="Result: label, slug, class_name" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>label</th><th>slug</th><th>class_name</th></tr></thead>
    <tbody>
      <tr><td>Employee salary</td><td>creme-brulee-a-recipe</td><td>Person</td></tr>
    </tbody>
  </table>
</div>

`inflector_humanize` turns an identifier into a label and removes a trailing `_id`: `author_id` becomes `Author`. It also respects the acronym list, so `html_parser_id` becomes `HTML parser` when HTML is configured.

`inflector_parameterize` removes accents where supported, lowercases the text, and joins its words with hyphens. It does not promise an ASCII-only result: `東京 タワー 2026` becomes `東京-タワー-2026`. It also does not assign unique slugs. Two different titles can produce the same slug, so uniqueness still belongs in the application or table constraint.

`inflector_classify` singularizes and converts to PascalCase. The 2.0 branch also includes the earlier corrections for singularizing `people` and `children`.

## Preserve missing values

Renaming a NULL struct now leaves it NULL. A nested NULL field retains its validity rather than turning into a value during reconstruction. Scalar transformations follow NULL-in, NULL-out behavior, including a NULL format or `strip_accents` argument. The table function rejects NULL options with a specific error because it needs a naming rule to determine its schema.

The Rust boundary now passes strings with their lengths, preserving embedded NUL bytes, and catches Rust panics before they can unwind through C++. Invalid input and internal failures become ordinary errors instead of misleading allocation messages.

The [November update](https://github.com/Query-farm/inflector/commit/849d90a) includes [two-connection tests](https://github.com/Query-farm/inflector/blob/e77af8e2f7/test/sql/inflector_acronyms_session.test), [collision and helper cases](https://github.com/Query-farm/inflector/blob/e77af8e2f7/test/sql/inflector_new_functions.test), and [NULL coverage](https://github.com/Query-farm/inflector/blob/e77af8e2f7/test/sql/inflector_nulls.test). The [extension page](/products/extensions/inflector/) has the full naming reference. The main upgrade checks are the generated names after a collision and any code that expected acronym settings to leak between connections.
