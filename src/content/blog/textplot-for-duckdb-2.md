---
title: "Textplot for DuckDB 2.0: a sparkline for each group"
description: "Textplot adds tp_sparkline_agg for grouped and windowed SQL charts in DuckDB 2.0, native named options, and reliable scaling across extreme numeric ranges."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Visualization"]
extensions: ["textplot"]
draft: false
showDescription: false
heroImage: "/media/posts/textplot-for-duckdb-2/social.png"
heroImageAlt: "Textplot for DuckDB 2.0: a sparkline for each group. Rows of observations collect into three small paper-backed sparklines, one line for each group."
leadVisual:
  src: "/media/posts/textplot-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Textplot"
  pitch: "Put sparklines, bars and density plots directly in DuckDB query results."
  href: "/products/extensions/textplot/"
  cta: "Explore Textplot"
  extension: "textplot"
  installNote: "These changes are in the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/textplot"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Use <code>tp_sparkline_agg(value ORDER BY time)</code> to plot each SQL group without building a list in the query.</li>
      <li>The aggregate supports the same width, mode and theme options as <code>tp_sparkline</code>, and works in windows.</li>
      <li>Plots now retain their shape when the numeric range overflows a double. Options are declared as native named parameters.</li>
    </ul>
  </div>
</aside>

A table of averages hides the shape of a series. Two services can have the same average latency while one is steady and the other has spent the last hour getting worse. A small chart beside each row makes that difference visible without leaving the query result.

[Textplot](/products/extensions/textplot/) already rendered lists as sparklines. The DuckDB 2.0 build adds `tp_sparkline_agg`, so a group of rows can produce the chart directly. It also fixes scaling at the extremes of floating-point numbers and declares plotting options through DuckDB's native named-parameter interface.

## Plot the rows in their intended order

The aggregate takes a numeric column. Put the ordering inside the aggregate call, just as you would with `list` or `string_agg`:

```sql
CREATE TEMP TABLE readings AS
SELECT * FROM (VALUES ('api', 1, 12.0), ('api', 2, 15.0),
           ('api', 3, 21.0), ('api', 4, 34.0),
           ('worker', 1, 31.0), ('worker', 2, 23.0),
           ('worker', 3, 17.0), ('worker', 4, 13.0)
) AS r(service, minute, latency_ms);

SELECT service,
       round(avg(latency_ms), 1) AS average_ms,
       tp_sparkline_agg(latency_ms, width := 12 ORDER BY minute) AS history
FROM readings
GROUP BY service
ORDER BY service;
```

<div class="query-result" role="region" aria-label="Result: average latency and actual Textplot sparklines for each service" tabindex="0">
  <div class="query-result__label">result · 2 rows</div>
  <table>
    <thead><tr><th>service</th><th>average_ms</th><th>history</th></tr></thead>
    <tbody>
      <tr><td>api</td><td>20.5</td><td><samp style="white-space: pre; font: inherit">   ▁▁▁▃▃▃███</samp></td></tr>
      <tr><td>worker</td><td>21.0</td><td><samp style="white-space: pre; font: inherit">███▄▄▄▂▂▂   </samp></td></tr>
    </tbody>
  </table>
</div>

The averages are close, but the API's latency is rising while the worker's is falling. These are the actual strings returned by Textplot. The lowest value uses a space, so the API's chart begins with three blank cells and the worker's ends with three. Each chart is twelve characters wide.

An outer `ORDER BY service` orders the result rows. It does not order the observations within a sparkline. Without the inner `ORDER BY minute`, the chart follows the order in which values reach the aggregate, which is not a time-order guarantee.

The new call is equivalent to the existing form:

```sql
SELECT service,
       tp_sparkline(list(latency_ms ORDER BY minute), width := 12) AS history
FROM readings
GROUP BY service
ORDER BY service;
```

This returns the same two `history` strings shown above. The [aggregate tests](https://github.com/Query-farm/textplot/blob/960a15d/test/sql/textplot_sparkline_agg.test) compare both forms across options, groups and parallel execution. The new aggregate is a shorter expression for the same chart.

## Sometimes the direction matters more than the height

The default `absolute` mode scales values to the sparkline's height. For a quick view of change, use `delta`:

```sql
SELECT tp_sparkline_agg(v, mode := 'delta', width := 3 ORDER BY t) AS changes
FROM (VALUES (1, 1.0), (2, 2.0), (3, 2.0), (4, 1.0)) AS d(t, v);
```

<div class="query-result" role="region" aria-label="Result: Textplot arrows showing a rise, no change, and a fall" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>changes</th></tr></thead>
    <tbody><tr><td><samp style="white-space: pre; font: inherit">↑→↓</samp></td></tr></tbody>
  </table>
</div>

The series rises, stays level and falls. Themes and width use the same options as the list function. An ASCII theme is available when the destination does not render the Unicode characters well.

It also works as a window aggregate:

```sql
SELECT t,
       tp_sparkline_agg(v, width := 3) OVER (
           ORDER BY t ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
       ) AS recent
FROM (VALUES (1, 1.0), (2, 2.0), (3, 3.0), (4, 1.0)) AS d(t, v)
ORDER BY t;
```

<div class="query-result" role="region" aria-label="Result: a three-character sparkline for each rolling window" tabindex="0">
  <div class="query-result__label">result · 4 rows</div>
  <table>
    <thead><tr><th>t</th><th>recent</th></tr></thead>
    <tbody>
      <tr><td>1</td><td><samp style="white-space: pre; font: inherit">▄▄▄</samp></td></tr>
      <tr><td>2</td><td><samp style="white-space: pre; font: inherit">  █</samp></td></tr>
      <tr><td>3</td><td><samp style="white-space: pre; font: inherit"> ▄█</samp></td></tr>
      <tr><td>4</td><td><samp style="white-space: pre; font: inherit">▄█ </samp></td></tr>
    </tbody>
  </table>
</div>

Each row now carries a chart of up to three observations ending at that row. The window's ordering supplies their sequence.

## Missing values do not become zeroes

NULLs, NaNs and infinities are skipped when plotting the series. A group with no rows or only NULLs returns NULL, like other aggregates. A group containing only non-finite values returns an empty string because there is nothing finite to plot. Delta and trend modes also need at least two values.

Skipping a value closes the gap. If a missing interval has a meaning in your data, account for that before rendering; the chart does not preserve an empty time slot for it.

Each sparkline is scaled independently. Two equally tall charts can represent very different ranges, so keep an average, minimum, maximum or unit alongside them when comparing groups. The small chart tells you the shape. The numeric columns tell you its scale.

## Extreme values should not flatten the chart

The plotting functions used `(value - min) / (max - min)` to locate values. Both endpoints can be finite while their difference overflows. For values near −1.7 × 10³⁰⁸ and +1.7 × 10³⁰⁸, that calculation could collapse everything into one bin or produce NaN before an integer conversion.

Scaling now falls back to halved values when the full range overflows. Bucket averages avoid an overflowing intermediate sum too:

```sql
SELECT '[' || tp_sparkline([-1.7e308, 1.7e308, 0.0], width := 3) || ']' AS plot;
```

<div class="query-result" role="region" aria-label="Result: extreme negative, positive, and zero values retain their relative heights" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>plot</th></tr></thead>
    <tbody><tr><td><samp style="white-space: pre; font: inherit">[ █▄]</samp></td></tr></tbody>
  </table>
</div>

The zero is still halfway between the endpoints. The same [scaling fix](https://github.com/Query-farm/textplot/commit/ce0f0eef216ca726ffefb34f4758301b477be6a7) applies to bars and density plots.

## Options belong in the function signature

Width, theme and other plotting options are now native named parameters. DuckDB can report their names and types in `duckdb_functions()`, reject unknown options when binding the query, and accept them in a different order. They remain keyword-only and must be constant expressions for the query; a column cannot choose a different width for each row.

There is one limit the compact output does not remove. The sparkline aggregate keeps the group's finite values before rendering them. A chart that is 20 characters wide is not a constant-memory summary of an arbitrarily large group. Aggregate the observations to an appropriate interval first if you are plotting a long history.

The [Textplot documentation](/products/extensions/textplot/) covers the modes and themes. The new aggregate is in the DuckDB 2.0 build from the [Query Farm repository](/blog/duckdb-2-query-farm-repository/).

The results shown here were produced with DuckDB 2.0.0 and [Textplot build `32f0ce80ee`](https://github.com/Query-farm/textplot/commit/32f0ce80ee8973466ccc7b0e9a7fc78d3adbe460).
