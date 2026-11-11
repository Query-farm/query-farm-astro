---
title: "Webmacro for DuckDB 2.0: load one macro, in your transaction"
description: "Webmacro now validates one CREATE MACRO statement, uses verified HTTPS, limits response size, and creates macros in the caller’s DuckDB transaction."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "SQL Macros"]
extensions: ["webmacro"]
draft: false
showDescription: false
heroImage: "/media/posts/webmacro-for-duckdb-2/social.png"
heroImageAlt: "Webmacro for DuckDB 2.0: load one macro, in your transaction. A downloaded code sheet passes through a single-statement paper stencil and becomes one checked macro card."
leadVisual:
  src: "/media/posts/webmacro-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Webmacro"
  pitch: "Load a SQL macro from a URL, with statement validation, HTTPS fetching and the calling connection\u2019s transaction and search path."
  href: "/products/extensions/webmacro/"
  cta: "Explore the extension"
  extension: "webmacro"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/webmacro"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>A URL must contain exactly one scalar or table <code>CREATE MACRO</code> statement. Extra SQL is rejected before any statement runs.</li>
      <li>Macros are created in the calling connection’s transaction and search path. Rolling back removes a macro loaded in that transaction.</li>
      <li>Native fetching uses DuckDB’s HTTP stack, requires HTTPS by default and caps responses at 1 MiB.</li>
    </ul>
  </div>
</aside>

A function named `load_macro_from_url` makes a fairly specific promise. Give it a URL containing a macro definition and that macro should become available in your session. It shouldn't run an unrelated statement that happened to arrive in the same response.

The DuckDB 2.0 update to [Webmacro](/products/extensions/webmacro/) makes that contract explicit. It parses the complete response with DuckDB's SQL parser, accepts exactly one macro definition, and creates it in the caller's own transaction. Native downloads now use DuckDB's HTTP client with certificate verification and a response-size limit.

## A small macro you can actually load

This example uses a fixture pinned to a commit in the extension repository. With Webmacro and `httpfs` available:

```sql
SELECT load_macro_from_url(
    'https://raw.githubusercontent.com/Query-farm/webmacro/f3af7a02a40cbfcd4faff636361a5865291f5ed6/test/fixtures/commented_macro.sql'
) AS status;
```

<div class="query-result" role="region" aria-label="Result: status" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>status</th></tr></thead>
    <tbody>
      <tr><td>Successfully loaded macro: commented_macro</td></tr>
    </tbody>
  </table>
</div>

```sql
SELECT commented_macro(1) AS value;
```

<div class="query-result" role="region" aria-label="Result: value" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>value</th></tr></thead>
    <tbody>
      <tr><td>2</td></tr>
    </tbody>
  </table>
</div>

The file contains a scalar macro with a comment. Comments are fine; the parser identifies the actual statement and name. Table macros, temporary macros and several overloads defined in one `CREATE MACRO` statement are supported too.

The important distinction is between one statement and one line. A macro body can span lines, contain Unicode, or include blank lines inside a string. Those bytes are preserved. A comment mentioning `CREATE MACRO` doesn't turn a `CREATE TABLE` into a macro definition.

## Reject the whole response before running it

Suppose a URL returns this:

```sql
CREATE MACRO add_one(x) AS x + 1;
CREATE TABLE unexpected_side_effect (value INTEGER);
```

Webmacro rejects it as two statements. It doesn't create `add_one` and then complain about the table. Neither statement runs. Empty responses, invalid SQL and single statements that create something other than a macro are rejected too.

The [validation tests](https://github.com/Query-farm/webmacro/blob/0e0c015a631eb2daa6da344b47e9847386eab462/test/sql/webmacro_validation.test) check that the rejected macro and table are both absent afterward. They also include strings containing command-like words, so validation doesn't depend on searching for suspicious substrings.

This narrows what the loader will accept. It doesn't establish that the macro's body is suitable for your workload. A macro is still SQL which will run when called. Keep using reviewed definitions, and pin the URL when the definition needs to stay reproducible.

## The macro belongs to your transaction

The loader previously used a separate connection to create a macro. That can be surprising when a caller has set a search path or opened a transaction. A successful load should behave like executing `CREATE MACRO` in that connection.

The new implementation binds and creates the definition in the caller's context. For example, in a fresh session:

```sql
BEGIN;

SELECT load_macro_from_url(
    'https://raw.githubusercontent.com/Query-farm/webmacro/f3af7a02a40cbfcd4faff636361a5865291f5ed6/test/fixtures/table_macro.sql'
);

SELECT count(*) AS count FROM table_macro(3);
```

<div class="query-result" role="region" aria-label="Result: count" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>count</th></tr></thead>
    <tbody>
      <tr><td>3</td></tr>
    </tbody>
  </table>
</div>

```sql
ROLLBACK;
```

After the rollback, `table_macro` is gone. Committing instead keeps it. A `TEMP` macro is visible to the calling connection, and an unqualified macro name follows that connection's `search_path`. Read-only databases and transactions reject the write as they would an ordinary macro creation.

Those behaviors matter when a migration or setup script loads several definitions inside a transaction. A failed setup can now roll its loaded macros back with the rest of its changes.

## Download through DuckDB's HTTP settings

On native DuckDB, Webmacro now uses `HTTPUtil`; `httpfs` supplies HTTPS support. That brings the usual proxy, timeout, retry, CA and HTTP-secret configuration into the fetch. The implementation checks each redirect again, so an HTTPS request cannot quietly become a plain HTTP request under the default policy.

The default maximum response is 1,048,576 bytes. It is enforced while reading, as well as against `Content-Length` when present. Set a different bound if a reviewed macro needs it:

```sql
SET webmacro_max_response_size = 2097152;
```

The limit is for the downloaded definition, not the rows a table macro might later return. Native fetching also checks for query interruption and refuses external access when DuckDB has disabled it.

Plain HTTP requires an explicit `SET webmacro_allow_http = true`. That can be useful for a local fixture server. It is an upgrade consideration for existing HTTP URLs; changing the source to HTTPS avoids relaxing the default.

The [statement-validation change](https://github.com/Query-farm/webmacro/commit/4acef9d) and [HTTP/transaction change](https://github.com/Query-farm/webmacro/commit/953624b) are both on the 2.0 branch. The [fixture tests](https://github.com/Query-farm/webmacro/blob/0e0c015a631eb2daa6da344b47e9847386eab462/test/sql/webmacro_fixture_behaviour.test) cover redirects, response limits, rollback, temporary macros and search paths. See the [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) for installing on DuckDB 2.0; the [Webmacro page](/products/extensions/webmacro/) has the complete reference.
