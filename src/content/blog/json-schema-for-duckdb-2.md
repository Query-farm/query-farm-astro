---
title: "JSON Schema for DuckDB 2.0: validate a column without losing the bad rows"
description: "JSON Schema for DuckDB 2.0 adds boolean validation, structured errors, and support through draft 2020-12, with explicit format checks and safer regular expressions."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "JSON", "Data Quality"]
extensions: ["json_schema"]
draft: false
showDescription: false
heroImage: "/media/posts/json-schema-for-duckdb-2/social.png"
heroImageAlt: "JSON Schema for DuckDB 2.0: validate a column without losing the bad rows. Rows of different paper shapes meet a schema stencil, producing accepted records and one record with a marked validation error."
leadVisual:
  src: "/media/posts/json-schema-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "JSON Schema"
  pitch: "Validate JSON columns, inspect failures, and apply schema defaults inside DuckDB."
  href: "/products/extensions/json_schema/"
  cta: "Explore JSON Schema"
  extension: "json_schema"
  repo: "https://github.com/Query-farm/json_schema"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li><code>json_schema_is_valid</code> returns a boolean; <code>json_schema_errors</code> returns the failing paths, keywords, and messages.</li>
      <li>The validator now understands drafts 4, 6, 7, 2019-09, and 2020-12. Without <code>$schema</code>, it uses 2020-12.</li>
      <li>Formats are checked, remote references are refused, and regular expressions use RE2. Existing schemas need a compatibility check when upgrading.</li>
    </ul>
  </div>
</aside>

Finding the first bad document is useful when a query should stop. It is less useful when the job is to tell someone which thousand documents need fixing.

The [JSON Schema extension](/products/extensions/json_schema/) already had `json_schema_validate`, which raises an error when a document fails validation. That behavior is still there. The DuckDB 2.0 update adds two functions for the other job: keeping validation failures in the result so you can count them, route them, or inspect them alongside the original record.

We also replaced the draft-07 validator with jsoncons. That changes which schema keywords are enforced, so this is an update to check against existing schemas before putting it into an ingestion job.

## Keep the invalid rows

`json_schema_is_valid(schema, document)` answers the question its name asks:

```sql
WITH incoming(id, document) AS (
    VALUES (1, '{"quantity": 3}'::JSON),
           (2, '{"quantity": -1}'::JSON),
           (3, '{"quantity": "three"}'::JSON)
)
SELECT id, json_schema_is_valid(
    '{"type": "object", "required": ["quantity"],
      "properties": {"quantity": {"type": "integer", "minimum": 0}}}',
    document
) AS valid
FROM incoming
ORDER BY id;
```

<div class="query-result" role="region" aria-label="Result: id, valid" tabindex="0">
  <div class="query-result__label">result · 3 rows</div>
  <table>
    <thead><tr><th>id</th><th>valid</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>true</td></tr>
      <tr><td>2</td><td>false</td></tr>
      <tr><td>3</td><td>false</td></tr>
    </tbody>
  </table>
</div>

You can use that boolean in a `WHERE` clause or an aggregate's `FILTER`. A document that does not meet the schema returns `false`. A malformed schema is still an error: it would be misleading to classify every document as invalid because the rule itself cannot be read. Malformed JSON text can also fail DuckDB's JSON cast before validation starts. SQL `NULL` inputs produce SQL `NULL`, rather than `false`.

## Ask what failed

`json_schema_errors` returns a list of structs with `path`, `keyword`, and `message` fields. An empty list means the document passed. Unnest the list to get one row per problem:

```sql
SELECT e.path, e.keyword, e.message
FROM (
    SELECT unnest(json_schema_errors(
        '{"type": "array", "items": {"type": "integer"}}',
        '[1, "two", 3, true]'
    )) AS e
)
ORDER BY e.path;
```

<div class="query-result" role="region" aria-label="Result: path, keyword, message" tabindex="0">
  <div class="query-result__label">result · 2 rows</div>
  <table>
    <thead><tr><th>path</th><th>keyword</th><th>message</th></tr></thead>
    <tbody>
      <tr><td>/1</td><td>type</td><td>Expected integer, found string</td></tr>
      <tr><td>/3</td><td>type</td><td>Expected integer, found boolean</td></tr>
    </tbody>
  </table>
</div>

These paths are JSON Pointers, so the array positions are zero-based. They identify the failing values without copying the whole document into an error message.

The throwing `json_schema_validate` now includes up to five validation failures in its message and points to `json_schema_errors` for the full list. Use the throwing form when failure should stop the statement; use the list when failure is part of the data you want to query.

## The schema version now matters

The old validator only supported draft 7. A newer keyword could appear in a schema without doing what its author expected. The new implementation selects the draft from `$schema` and supports drafts 4, 6, 7, 2019-09, and 2020-12.

For example, 2020-12's `prefixItems` checks tuple positions:

```sql
SELECT json_schema_is_valid(
    '{"$schema": "https://json-schema.org/draft/2020-12/schema",
      "prefixItems": [{"type": "string"}, {"type": "integer"}]}',
    '[1, "a"]'
) AS valid;
```

<div class="query-result" role="region" aria-label="Result: valid" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>valid</th></tr></thead>
    <tbody>
      <tr><td>false</td></tr>
    </tbody>
  </table>
</div>

`unevaluatedProperties`, `dependentRequired`, and local `$defs` references are supported too. An unknown schema version raises an error rather than silently falling back.

When `$schema` is absent, the default is **2020-12**. If an existing schema relies on draft-07 tuple rules, declare draft 7 explicitly. Its array-form `items` and `additionalItems` have different meanings from the newer tuple vocabulary.

## Formats and patterns have explicit rules

The extension now validates `format`, including email addresses, date-times, and IPv4 addresses:

```sql
SELECT json_schema_is_valid('{"format": "email"}', '"not an email"') AS valid;
```

<div class="query-result" role="region" aria-label="Result: valid" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>valid</th></tr></thead>
    <tbody>
      <tr><td>false</td></tr>
    </tbody>
  </table>
</div>

Formats apply to strings. Add `"type": "string"` if a non-string value should fail too.

Patterns run through RE2, which avoids recursive matching and catastrophic backtracking. This comes with a compatibility cost: lookaround and backreferences are not supported. A schema containing those constructs is rejected. `pattern` remains an unanchored search unless you write anchors.

Validation does not fetch remote schemas or read `$ref` targets from disk. Put shared definitions inside the schema and use local references. Depth checks and a native stack guard also stop excessively nested inputs before they exhaust the process stack.

## Existing functions are still useful

`json_schema_patch` and `json_schema_update` remain available for applying defaults. They validate the document; they do not turn an invalid value into a valid one by replacing it with a default. Compiled schemas are now cached per execution thread, so using the same schema over a column does not require compiling it for every document.

The [implementation change](https://github.com/Query-farm/json_schema/commit/bd1e545) and [validation tests](https://github.com/Query-farm/json_schema/blob/837f39dcd9/test/sql/json_schema_validation.test) cover the draft selection, error lists, formats, and compatibility boundaries described here. The [extension documentation](/products/extensions/json_schema/) has the installation instructions and full function reference. Before upgrading an existing validation pipeline, make its schema version explicit and check its patterns. Those are the two places where an old schema can mean something different in this build.
