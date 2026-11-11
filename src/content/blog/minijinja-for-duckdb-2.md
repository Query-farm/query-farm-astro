---
title: "MiniJinja for DuckDB 2.0: a budget for rendering templates"
description: "MiniJinja’s DuckDB 2.0 branch adds per-render instruction budgets, correct undefined modes, reusable templates, and file loading through DuckDB’s access controls."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Templates", "SQL"]
extensions: ["minijinja"]
draft: false
showDescription: false
heroImage: "/media/posts/minijinja-for-duckdb-2/social.png"
heroImageAlt: "MiniJinja for DuckDB 2.0: a budget for rendering templates. A template sheet with empty slots combines with colored context pieces to make filled documents inside a bounded rendering area."
leadVisual:
  src: "/media/posts/minijinja-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "MiniJinja"
  pitch: "Render Jinja-style templates from JSON objects and DuckDB rows."
  href: "/products/extensions/minijinja/"
  cta: "Explore MiniJinja"
  extension: "minijinja"
  installNote: "This article covers the November 7 v2.0 source update; verify the repository build includes it before trying the new fuel option."
  repo: "https://github.com/Query-farm/minijinja"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>A new <code>fuel</code> option caps the instructions spent rendering one template. It is opt-in; zero means unlimited.</li>
      <li>Template files are loaded through DuckDB's filesystem, and the four undefined-value modes now have their documented behavior.</li>
      <li>Parsed templates are reused across rows. Malformed input, excessive nesting, and NUL bytes no longer follow the old process-aborting paths.</li>
    </ul>
  </div>
</aside>

A template can do more work than its output suggests. Two nested loops can run for a long time without printing a character. A report template can include itself. A missing field can quietly disappear from a rendered message.

The new work on [MiniJinja's DuckDB 2.0 branch](/products/extensions/minijinja/) makes those cases explicit. It adds an instruction budget, fixes undefined-value modes, moves file loading under DuckDB's access controls, and reuses compiled templates across rows. The normal use remains the same: pass a template and the row you want it to render.

## Pass the context explicitly

Use `minijinja_render_with_context` when the template needs values:

```sql
SELECT minijinja_render_with_context(
    '{{ name }}: {{ tags | join(",") }}', t
) AS rendered
FROM (VALUES ('Ada', ['x', 'y'])) t(name, tags);
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>Ada: x,y</td></tr>
    </tbody>
  </table>
</div>

A DuckDB struct, including a whole row, is cast to JSON for the context. The context must be an object. Arrays, numbers, and JSON null now raise clear errors rather than being accepted as something a template cannot use as named variables. SQL NULL still produces SQL NULL.

The 2.0 API declares options such as `autoescape`, `template_path`, and `undefined_behavior` as native named parameters. DuckDB checks the names and types, supplies the defaults, and exposes them in `duckdb_functions()`.

## Spend a fixed number of instructions

The new `fuel` option limits the work of one render:

```sql
SELECT minijinja_render(
    '{% for i in range(10) %}{{ i }}{% endfor %}',
    fuel := 10000
) AS rendered;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">expected result · November 7 build</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>0123456789</td></tr>
    </tbody>
  </table>
</div>

When a template spends that allowance, rendering fails with `OutOfFuel`. The allowance starts again for the next render; it is not a shared budget for the whole column.

The default is `fuel := 0`, which disables the instruction limit. Set a nonzero budget when you want a limit. Fuel is an evaluator instruction count, not milliseconds or output bytes, so choose it against the templates you expect to run.

Other checks apply independently. `range()` is capped at 100,000 elements. Deeply nested templates hit parser or runtime recursion limits, and tags containing more than 10,000 operators are rejected before the resulting expression tree can exhaust the stack. These checks still matter when fuel is unlimited.

## Choose what a missing value means

`semi_strict` previously behaved like `lenient`. That is a significant difference for a report: a missing optional field should be testable, but printing it by accident should fail.

The modes now differ as follows:

| Mode | Missing-value behavior |
| --- | --- |
| `lenient` | Can render a missing value as empty text; accessing its attributes can still fail |
| `strict` | Rejects use of an undefined value, including a conditional test |
| `semi_strict` | Allows testing a missing value, but rejects printing it |
| `chainable` | Allows chains such as `missing.a.b` to remain undefined and render empty |

For example:

```sql
SELECT minijinja_render(
    '[{% if missing %}x{% endif %}]',
    undefined_behavior := 'semi_strict'
) AS rendered;
```

<div class="query-result" role="region" aria-label="Result: rendered" tabindex="0">
  <div class="query-result__label">expected result · November 7 build</div>
  <table>
    <thead><tr><th>rendered</th></tr></thead>
    <tbody>
      <tr><td>[]</td></tr>
    </tbody>
  </table>
</div>

Changing the template to `'[{{ missing }}]'` with the same mode raises `UndefinedError`. A misspelled mode is rejected instead of silently selecting another behavior. If an old template relied on `semi_strict` dropping missing printed values, this update will expose it.

## Load files through the database

`template_path` now reads templates through DuckDB's filesystem. That puts file access under `enable_external_access`, `allowed_directories`, and `allowed_paths`. Inline templates still render with external access disabled; they cannot use an include to read an arbitrary host file.

A path can identify a directory, file, or glob. The matching templates are read when the query is bound and named relative to the selected directory. Includes and inheritance then resolve against that loaded set. There are also limits on the number and total size of loaded files.

This changes the old arrangement in which the Rust library opened files itself. Applications that restrict DuckDB's filesystem access should expect those restrictions to apply to template loading too.

## Reuse the template, keep each row's context

The extension now retains rendering environments in thread-local query state. An inline template used for a whole column can be compiled once; a varying template column uses a bounded cache of 64 distinct texts. The context is supplied separately for every render.

The update also enables `tojson` and `urlencode`, supports the configured MiniJinja convenience filters and string methods, and fixes embedded NUL handling. NUL characters in rendered text are dropped rather than reaching a Rust string conversion that aborts the process. That is deliberate output behavior, so do not use this renderer to preserve binary text byte-for-byte.

## Build covered here

This article covers [the November 7 source update](https://github.com/Query-farm/minijinja/commit/af79fe3) and its [hardening tests](https://github.com/Query-farm/minijinja/blob/b1f521f0d3/test/sql/minijinja_hardening.test). While preparing it on November 11, the extension repository served build `5241d1f9d5`, which predates this work. The new fuel and hardening behavior therefore needs a refreshed build before the examples can be followed from a normal install. The [extension page](/products/extensions/minijinja/) remains the installation and API reference.
