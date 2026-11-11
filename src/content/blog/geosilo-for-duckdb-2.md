---
title: "GeoSilo for DuckDB 2.0: validate the bytes, preserve the geometry"
description: "GeoSilo adds full BLOB validation and safer decoding in DuckDB 2.0, repairs Z and M geometry round trips, and makes area, length and perimeter match Spatial."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Geospatial"]
extensions: ["geosilo"]
draft: false
showDescription: false
heroImage: "/media/posts/geosilo-for-duckdb-2/social.png"
heroImageAlt: "GeoSilo for DuckDB 2.0: validate the bytes, preserve the geometry. A polygon with marked vertices folds into a compact stack, then emerges inside a checked boundary as a polygon with a hole."
leadVisual:
  src: "/media/posts/geosilo-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "GeoSilo"
  pitch: "Store compact geometries, validate incoming blobs, and query their coordinates and measurements."
  href: "/products/extensions/geosilo/"
  cta: "Explore GeoSilo"
  extension: "geosilo"
  installNote: "These changes are in the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/geosilo"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>New validation functions distinguish malformed storage from usable geometry without aborting a query.</li>
      <li>Z and M round trips, nested multipoints, large coordinate differences and polygon holes now keep their intended meaning.</li>
      <li>The direct <code>ST_*</code> functions follow Spatial: polygon length is zero, perimeter counts rings, and empty coordinates return NULL.</li>
    </ul>
  </div>
</aside>

Compact geometry is useful only if decoding it produces the geometry you stored. A correct byte count is not enough: a polygon hole must still be a hole, an empty point must still be empty, and a coordinate carrying a Z or M value must keep that dimension.

The [GeoSilo extension](/products/extensions/geosilo/) stores scaled coordinates in a compact binary format and evaluates several spatial functions directly over it. Its DuckDB 2.0 update fixes both sides of that contract: malformed bytes are checked before they are read, and valid geometries produce the same measurements their `GEOMETRY` counterparts should.

## Validate an incoming blob before using it

Previously, a short blob could claim to contain billions of points. The decoder trusted the count and read beyond the available bytes. Deeply nested collections could exhaust the stack. Even inspecting metadata on an empty blob could read past the buffer.

All readers now share a bounds-checked cursor. Counts are compared with the remaining bytes before loops or allocations begin, headers are validated, and nesting is capped at DuckDB's geometry limit, currently 16 levels.

There are three new functions for dealing with questionable input:

| Function | Valid input | Malformed input |
| --- | --- | --- |
| `geosilo_is_valid(blob)` | `true` | `false` |
| `geosilo_validate(blob)` | NULL | A description of the problem |
| `try_geosilo_decode(blob)` | A `GEOMETRY` | NULL |

For example:

```sql
SELECT geosilo_is_valid(''::BLOB) AS valid,
       geosilo_validate(''::BLOB) AS problem,
       try_geosilo_decode(''::BLOB) AS geometry;
```

<div class="query-result" role="region" aria-label="Result: valid, problem, geometry" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>valid</th><th>problem</th><th>geometry</th></tr></thead>
    <tbody>
      <tr><td>false</td><td>GeoSilo: blob is empty</td><td class="query-result__null">NULL</td></tr>
    </tbody>
  </table>
</div>

The explicit `BLOB` to `GEOSILO` cast now validates the entire structure too. `TRY_CAST(payload AS GEOSILO)` is a convenient way to reject a bad value while retaining the rest of a table.

There is a small distinction worth preserving. The decoder tolerates trailing bytes after a complete geometry. Validation, including the `GEOSILO` cast, rejects them. Use validation when you need the blob to contain exactly one complete encoding.

## Length and perimeter mean different things

GeoSilo exposes familiar names such as `ST_Area` and `ST_Length`, so their answers need to agree with Spatial's semantics. Several did not.

The corrected rules are straightforward: area counts polygonal parts, length counts linear parts, and perimeter counts polygon rings, including holes. Collections contribute only the parts relevant to that measurement.

```sql
WITH shape AS (
    SELECT geosilo_encode(
        'POLYGON ((0 0, 4 0, 4 3, 0 3, 0 0))'::GEOMETRY
    )::GEOSILO AS g
)
SELECT ST_Area(g) AS area,
       ST_Length(g) AS length,
       ST_Perimeter(g) AS perimeter
FROM shape;
```

<div class="query-result" role="region" aria-label="Result: area, length, perimeter" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>area</th><th>length</th><th>perimeter</th></tr></thead>
    <tbody>
      <tr><td>12.0</td><td>0.0</td><td>14.0</td></tr>
    </tbody>
  </table>
</div>

If an existing query used `ST_Length` to measure a polygon's boundary, change it to `ST_Perimeter`. Polygon area subtracts holes regardless of ring orientation. `ST_NPoints` now walks multiparts and collections correctly and excludes empty points while counting ring-closing vertices.

These are planar measurements in the geometry's coordinate units. Encoding longitude and latitude does not turn a length into metres. In the regression tests, the line from −179 to 179 has length 358, not the shorter path around the globe.

## Keep empty geometry separate from a coordinate

`ST_X` and `ST_Y` now return NULL for an empty point and raise an error for a non-point geometry, matching Spatial. Bounding-box functions also return NULL for empty geometry; earlier versions returned NaN.

That is a useful distinction in a table. A missing coordinate can propagate through SQL as NULL. A line passed to a function expecting a point is a type-of-geometry mistake that deserves an error.

The [semantics tests](https://github.com/Query-farm/geosilo/blob/fdf40a0e7a65fa081e82493212567e0a77fdc467/test/sql/geosilo_st_semantics.test) cover these cases alongside polygons with holes, nested collections, empty geometries and coordinate extremes.

## Preserve dimensions and choose the scale

DuckDB 2.0 uses ISO WKB type codes for Z, M and ZM geometries. GeoSilo had been reading and writing the older EWKB flag convention in places where those codes were expected. The update accepts both conventions on input and writes ISO WKB, restoring the extra dimensions through a round trip.

It also fixes nested `MULTIPOINT` values: they were stored as coordinate deltas inside a collection but decoded as absolute values. The corrected reader repairs those older encodings, and new collections use a version-2 header.

GeoSilo still quantizes coordinates according to its scale. The default is 10,000,000, suitable for longitude and latitude, while larger projected coordinates need a smaller scale. The scaled coordinate must fit in a signed 32-bit integer:

```sql
SELECT geosilo_encode(
    'LINESTRING (500000.25 4649776.75, 500010.5 4649780)'::GEOMETRY,
    100
) AS projected_line;
```

A scale of 100 stores hundredths of the coordinate unit. Zero and negative scales now raise an error rather than producing misleading geometry.

The [November change](https://github.com/Query-farm/geosilo/commit/fdf40a0e7a65fa081e82493212567e0a77fdc467) includes [malformed-input tests](https://github.com/Query-farm/geosilo/blob/fdf40a0e7a65fa081e82493212567e0a77fdc467/test/sql/geosilo_malformed.test) built from truncations, altered bytes and the original crash cases. Upgrade the readers of stored GeoSilo data as well as its writers: accepting a compact format is a promise to interpret every byte carefully.
