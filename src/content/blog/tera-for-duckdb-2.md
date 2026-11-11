---
title: "Tera for DuckDB 2.0: template files follow the database’s rules"
description: "Tera for DuckDB 2.0 checks template file access, disables environment reads by default, catches recursive templates, and reuses parsed templates across rows."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Templates", "SQL"]
extensions: ["tera"]
draft: false
showDescription: false
heroImage: "/media/posts/tera-for-duckdb-2/social.png"
heroImageAlt: "Tera for DuckDB 2.0: template files follow the database’s rules. Layered template sheets pass through a paper stencil, filling one output document within a rendering boundary."
leadVisual:
  src: "/media/posts/tera-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Tera"
  pitch: "Render Tera templates from DuckDB rows, with reusable layouts, macros, and explicit escaping."
  href: "/products/extensions/tera/"
  cta: "Explore Tera"
  extension: "tera"
  repo: "https://github.com/Query-farm/tera"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li><code>template_path</code> now loads files through DuckDB's filesystem, so the database's access restrictions apply.</li>
      <li><code>get_env()</code> is disabled by default. Recursive includes and macros, excessive nesting, and invalid contexts produce errors.</li>
      <li>Templates are parsed and reused across rows, and file-backed templates now follow the same default escaping rule as inline ones.</li>
    </ul>
  </div>
</aside>

The [Tera extension](/products/extensions/tera/) lets a query render text from a row. That is useful for a report or a generated configuration file, but it also makes the template engine part of the database's execution environment. Reading a template file should follow the same access rules as reading any other file from SQL.

Previously, Tera loaded files through its own Rust code. It also exposed a built-in `get_env()` function that could read the host process's environment. The DuckDB 2.0 update moves file access through DuckDB and disables environment reads by default. It also fixes escaping for loaded templates and catches several kinds of recursion before they can exhaust the process stack.

## Render a row directly

The context can be a JSON object or a DuckDB struct. A whole row works too:

```sql
SELECT tera_render('{{ id }}:{{ name }}', r) AS rendered
FROM (SELECT 7 AS id, 'duck' AS name) r;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>7:duck</td></tr>
    </tbody>
  </table>
</div>

Nested objects and lists keep their structure:

```sql
SELECT tera_render(
    '{{ a.b }} {{ c | join(sep="-") }}',
    {'a': {'b': 1}, 'c': [1, 2]}
) AS rendered;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>1 1-2</td></tr>
    </tbody>
  </table>
</div>

Contexts must now be JSON objects. The old implementation could silently ignore an array or scalar context. The new one says what is wrong, such as `Invalid context: expected a JSON object, got an array`. SQL NULL returns SQL NULL; a missing variable used by a template remains a rendering error.

Options are native DuckDB named parameters in this build. They are checked by the binder and appear alongside the positional arguments in `duckdb_functions()`.

## Make escaping consistent

Inline templates already escaped values by default:

```sql
SELECT tera_render('{{ company }}', '{"company": "B&O"}') AS rendered;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>B&amp;amp;O</td></tr>
    </tbody>
  </table>
</div>

Earlier file-backed rendering did not consistently honor that same default. The 2.0 branch fixes it: with `autoescape := true` and the default empty `autoescape_extensions` list, every template is escaped. Supply a suffix list if only some named templates should be escaped.

For plain text where escaping is unwanted, make that choice explicit:

```sql
SELECT tera_render(
    '{{ company }}', '{"company": "B&O"}',
    autoescape := false
) AS rendered;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>B&amp;O</td></tr>
    </tbody>
  </table>
</div>

Existing file-based reports can therefore change output after upgrading. Check rendered ampersands, angle brackets, and quotes rather than assuming a successful query means identical text.

## Give the loader the files it needs

With `template_path`, the first argument names a template from the loaded set. For a directory containing `page.html`, `base.html`, and a `partials` directory, a call can look like this:

```sql
SELECT tera_render(
    'page.html', {'title': 'Weekly report'},
    template_path := './report-templates/**/*.html'
);
```

This example needs those template files on disk. Their names are relative to the directory before the glob, so an include can refer to `partials/header.html`.

The extension reads matching files through DuckDB's filesystem when binding the query. `enable_external_access`, `allowed_directories`, and `allowed_paths` now govern those reads. A file larger than 64 MiB is rejected. Includes and inheritance operate on the loaded templates; they do not provide a second path around the database's file checks.

Inline rendering still works when external access is disabled. It does not need to open a template file.

## Environment access is a separate choice

`get_env()` can reveal more than a convenient configuration value. The database process may have credentials in its environment, and a SQL caller should not gain access just by writing a template.

The new `tera_allow_get_env` setting defaults to false. Enabling it permits Tera's environment function only while DuckDB external access is also enabled. Setting `enable_external_access = false` keeps it disabled even if `tera_allow_get_env` is true.

For ordinary rendering, pass required values in the context instead. The template then declares its inputs through the row it receives, and the query does not depend on the environment of the process that happens to run it.

## Reject cycles before rendering them

Tera can include templates and import macro files. A cycle in either graph used to recurse without a useful stopping point. The extension now rejects cycles and include chains deeper than 32. Recursive macros are rejected too, including indirect recursion through other macros.

Before parsing, it also checks for more than 64 nested blocks or brackets, or more than 256 operators in one tag. String literals and raw blocks do not count as template structure. These are checks on pathological template shapes; they are not a general wall-clock or output-size limit for every possible render.

The implementation keeps parsed templates in query-local execution state, with a bounded cache for varying inline template text. It can reuse the template while supplying a different context for each row. NUL bytes in the rendered output are dropped instead of causing a panic at the Rust boundary.

The [hardening update](https://github.com/Query-farm/tera/commit/209f280), [escaping fix](https://github.com/Query-farm/tera/commit/fb773e8), and [security tests](https://github.com/Query-farm/tera/blob/265a8b426b/test/sql/tera_security.test) document the changes. The [Tera page](/products/extensions/tera/) has the full function reference. The main upgrade checks are file permissions, environment-dependent templates, recursive macros, and the escaping of file-backed output.
