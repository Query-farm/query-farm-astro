"""Export the real data behind the "vector tiles in DuckDB" post's figures.

Every coordinate and number the figures draw comes from vgi-mvt itself, read through DuckDB:

  tile-cut.json      one road of the Protomaps Florence sample, as stored (raw pieces with
                     their buffers), clipped to each tile, and merged back into one row
  byte-ranges.json   the z14 tiles under a box over central Florence in the 4.6 GB Overture
                     POI archive: their Hilbert order, byte offsets, and the range requests
                     the worker actually sent
  rows-to-tiles.json one z15 tile of a 9-layer tileset written with COPY ... TO
                     (FORMAT 'mvt.pmtiles'), layer by layer, in tile coordinates
  facts.json         the counts and timings the text quotes

Run from this repository (needs network; the outputs are committed):

  uv run --project ~/Development/vgi-mvt --with duckdb==2.0.0 \\
      python scripts/vector-tiles-blog/export.py
"""

from __future__ import annotations

import gzip
import json
import platform
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import duckdb
import shapely

import mvt_worker.sources as S
from mvt_worker.meta import FIRENZE_PMTILES
from mvt_worker.mvt import decode_tile, maybe_decompress
from pmtiles.tile import zxy_to_tileid

OUT = Path(__file__).resolve().parents[2] / "src" / "data" / "blog" / "vector-tiles-in-duckdb"
WORKER_TAG = "v0.2.2"
OVERTURE = "https://r2-public.protomaps.com/protomaps-sample-datasets/overture-pois.pmtiles"
BOX = (11.24, 43.76, 11.27, 43.78)  # central Florence, as in the vgi-mvt README
ROAD = "Viale Evangelista Torricelli"
HALF = 20037508.342789244  # Web Mercator half circumference


def connect() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(config={"allow_extension_repositories": "allowed"})
    c.sql("LOAD vgi FROM query_farm")
    c.sql("LOAD spatial")
    worker = f"uvx --from git+https://github.com/Query-farm/vgi-mvt@{WORKER_TAG} vgi-mvt-worker"
    c.sql(f"ATTACH 'mvt' (TYPE vgi, LOCATION '{worker}')")
    return c


def rows(c: duckdb.DuckDBPyConnection, sql: str) -> list[tuple[Any, ...]]:
    return c.sql(sql).fetchall()


def coords(wkb: bytes, digits: int = 1) -> Any:
    """GeoJSON-like nested coordinate lists, rounded (metres in Web Mercator)."""
    g = shapely.from_wkb(bytes(wkb))
    return {"type": g.geom_type, "coordinates": _round(shapely.geometry.mapping(g)["coordinates"], digits)}


def _round(v: Any, d: int) -> Any:
    if isinstance(v, (list, tuple)):
        if v and isinstance(v[0], (int, float)):
            return [round(float(x), d) for x in v]
        return [_round(x, d) for x in v]
    return v


def tile_bounds(z: int, x: int, y: int) -> list[float]:
    """Web Mercator bounds [minx, miny, maxx, maxy] of an XYZ tile."""
    size = 2 * HALF / (1 << z)
    return [round(-HALF + x * size, 2), round(HALF - (y + 1) * size, 2), round(-HALF + (x + 1) * size, 2), round(HALF - y * size, 2)]


# --------------------------------------------------------------------------- figure 1


def tile_cut(c: duckdb.DuckDBPyConnection, facts: dict[str, Any]) -> None:
    z = 15
    base = f"mvt.main.read_tiles('{FIRENZE_PMTILES}', zoom := {z}, layer := 'roads', coordinates := 'web_mercator', max_tiles := 100000"
    fid = rows(c, f"SELECT DISTINCT feature_id FROM {base}, tile_edges := 'raw') WHERE name = '{ROAD}'")
    assert len(fid) == 1, fid
    fid = fid[0][0]
    raw = rows(c, f"SELECT x, y, ST_AsWKB(geometry) FROM {base}, tile_edges := 'raw') WHERE feature_id = {fid} ORDER BY x, y")
    clip = rows(c, f"SELECT x, y, ST_AsWKB(geometry) FROM {base}, tile_edges := 'clip') WHERE feature_id = {fid} ORDER BY x, y")
    merged = rows(c, f"SELECT ST_AsWKB(geometry), ST_Length(geometry) FROM {base}, tile_edges := 'merge') WHERE feature_id = {fid}")
    assert len(merged) == 1
    tiles = sorted({(x, y) for x, y, _ in raw})
    xs, ys = [t[0] for t in tiles], [t[1] for t in tiles]
    # Context: the other roads of those tiles, clipped to them, simplified for drawing.
    ctx = rows(
        c,
        f"""SELECT "pmap:kind", ST_AsWKB(ST_SimplifyPreserveTopology(geometry, 1.5)) FROM {base}, tile_edges := 'clip')
            WHERE x BETWEEN {min(xs)} AND {max(xs)} AND y BETWEEN {min(ys)} AND {max(ys)} AND feature_id IS DISTINCT FROM {fid}
              AND "pmap:kind" IN ('highway', 'major_road', 'medium_road', 'minor_road')""",
    )
    data = {
        "source": FIRENZE_PMTILES,
        "zoom": z,
        "road": ROAD,
        "feature_id": fid,
        "tiles": [{"x": x, "y": y, "bounds": tile_bounds(z, x, y)} for x, y in tiles],
        "raw": [{"x": x, "y": y, "geometry": coords(w)} for x, y, w in raw],
        "clip": [{"x": x, "y": y, "geometry": coords(w)} for x, y, w in clip],
        "merged": coords(merged[0][0]),
        "context": [{"kind": k, "geometry": coords(w)} for k, w in ctx],
    }
    (OUT / "tile-cut.json").write_text(json.dumps(data, separators=(",", ":")))
    facts["tile_cut"] = {"road": ROAD, "pieces_raw": len(raw), "pieces_clip": len(clip), "length_m": round(merged[0][1])}

    # The whole roads layer: what merge does to row counts, and where the "missing" ids went.
    for zz in (14, 15):
        counts = {}
        for mode in ("raw", "clip", "merge"):
            n, ids = rows(
                c,
                f"SELECT count(*), count(DISTINCT feature_id) FROM mvt.main.read_tiles('{FIRENZE_PMTILES}', zoom := {zz}, "
                f"layer := 'roads', tile_edges := '{mode}', max_tiles := 100000)",
            )[0]
            counts[mode] = {"rows": n, "ids": ids}
        facts[f"roads_z{zz}"] = counts
    # ids present raw but absent after merge: are they only in buffers outside the archive's tiles?
    gone = rows(
        c,
        f"""WITH r AS (SELECT DISTINCT feature_id FROM mvt.main.read_tiles('{FIRENZE_PMTILES}', zoom := 14, layer := 'roads', tile_edges := 'raw', max_tiles := 100000)),
                 m AS (SELECT DISTINCT feature_id FROM mvt.main.read_tiles('{FIRENZE_PMTILES}', zoom := 14, layer := 'roads', tile_edges := 'merge', max_tiles := 100000))
            SELECT count(*) FROM r WHERE feature_id NOT IN (SELECT feature_id FROM m)""",
    )[0][0]
    facts["roads_z14"]["ids_only_in_buffers"] = gone


# --------------------------------------------------------------------------- figure 2


class Counter:
    """Count the HTTP range requests and bytes the worker's PMTiles reader sends."""

    def __init__(self) -> None:
        self.requests: list[tuple[int, int]] = []
        self._real = S.http_get

    def __enter__(self) -> Counter:
        def counted(url: str, byte_range: tuple[int, int] | None = None) -> bytes | None:
            data = self._real(url, byte_range)
            if byte_range is not None:
                self.requests.append((byte_range[0], len(data or b"")))
            return data

        S.http_get = counted
        return self

    def __exit__(self, *exc: object) -> None:
        S.http_get = self._real


def byte_ranges(c: duckdb.DuckDBPyConnection, facts: dict[str, Any]) -> None:
    S._OPEN.clear()
    with Counter() as counter:
        src = S.open_source(OVERTURE)
        info = src.info()
        z = info.maxzoom
        keys = src.tiles(z, BOX, 10_000)
        head_requests = list(counter.requests)
        counter.requests.clear()
        # The locations of those tiles in the archive (directory lookups already cached).
        locs = {k: src._lookup(zxy_to_tileid(*k)) for k in keys}  # type: ignore[attr-defined]
        got = dict(src.fetch(keys))
    tile_requests = list(counter.requests)
    # A wider neighbourhood for drawing the Hilbert order around the box.
    x0, y0 = min(k[1] for k in keys), min(k[2] for k in keys)
    x1, y1 = max(k[1] for k in keys), max(k[2] for k in keys)
    pad = 3
    hood = [(z, x, y) for x in range(x0 - pad, x1 + pad + 1) for y in range(y0 - pad, y1 + pad + 1)]
    hood_locs = {}
    for k in hood:
        loc = src._lookup(zxy_to_tileid(*k))  # type: ignore[attr-defined]
        if loc is not None:
            hood_locs[k] = loc
    data = {
        "archive": OVERTURE,
        "zoom": z,
        "box": BOX,
        "box_tiles": [
            {"x": k[1], "y": k[2], "tile_id": zxy_to_tileid(*k), "offset": locs[k][0], "length": locs[k][1],
             "features": len(decode_tile(maybe_decompress(got[k]))[0].features) if got.get(k) else 0}
            for k in sorted(keys, key=lambda k: zxy_to_tileid(*k))
            if locs.get(k)
        ],
        "neighbourhood": [
            {"x": k[1], "y": k[2], "tile_id": zxy_to_tileid(*k), "offset": v[0], "length": v[1]}
            for k, v in sorted(hood_locs.items(), key=lambda kv: zxy_to_tileid(*kv[0]))
        ],
        "tile_requests": [{"offset": o, "length": n} for o, n in tile_requests],
        "directory_requests": [{"offset": o, "length": n} for o, n in head_requests],
    }
    (OUT / "byte-ranges.json").write_text(json.dumps(data, separators=(",", ":")))
    archive_size = int(
        subprocess.run(["curl", "-sI", OVERTURE], capture_output=True, text=True).stdout.lower().split("content-length:")[1].split()[0]
    )
    facts["byte_ranges"] = {
        "archive_bytes": archive_size,
        "zoom": z,
        "tiles_in_box": len(keys),
        "tile_requests": len(tile_requests),
        "tile_bytes": sum(n for _, n in tile_requests),
        "directory_requests": len(head_requests),
        "directory_bytes": sum(n for _, n in head_requests),
    }
    # The query as the post shows it, timed through DuckDB (fresh worker each run: a cold read).
    sql = f"""SELECT category_main, count(*) AS n
FROM mvt.main.read_tiles('{OVERTURE}', layer := 'pois')
WHERE ST_Intersects(geometry, ST_MakeEnvelope({BOX[0]}, {BOX[1]}, {BOX[2]}, {BOX[3]}))
GROUP BY ALL ORDER BY n DESC LIMIT 5"""
    times = []
    for _ in range(5):
        cc = connect()
        t = time.perf_counter()
        result = cc.sql(sql).fetchall()
        times.append(time.perf_counter() - t)
        cc.close()
    facts["byte_ranges"]["query"] = sql
    facts["byte_ranges"]["result"] = result
    facts["byte_ranges"]["seconds_median_of_5"] = round(statistics.median(times), 2)
    facts["byte_ranges"]["seconds_all"] = [round(t, 2) for t in times]


# --------------------------------------------------------------------------- figure 3

COPY_SQL = """COPY (
    SELECT layer, feature_id, properties, geometry,
           CASE layer WHEN 'buildings' THEN 13 WHEN 'pois' THEN 14 END AS minz
    FROM mvt.main.read_tiles('{src}', zoom := 15)
    WHERE list_contains(['earth', 'landuse', 'natural', 'water', 'roads',
                         'transit', 'buildings', 'pois', 'places'], layer)
    ORDER BY list_position(['earth', 'landuse', 'natural', 'water', 'roads',
                            'transit', 'buildings', 'pois', 'places'], layer)
) TO '{out}' (FORMAT 'mvt.pmtiles', minzoom 10, maxzoom 15, minzoom_column 'minz',
     name 'Florence', attribution '© OpenStreetMap contributors, Protomaps')"""

LAYER_ORDER = ["earth", "landuse", "natural", "water", "roads", "transit", "buildings", "pois", "places"]


def rows_to_tiles(c: duckdb.DuckDBPyConnection, facts: dict[str, Any]) -> Path:
    out = Path(tempfile.mkdtemp()) / "florence.pmtiles"
    t = time.perf_counter()
    copied = rows(c, COPY_SQL.format(src=FIRENZE_PMTILES, out=out))[0][0]
    seconds = time.perf_counter() - t
    src = S.open_source(str(out))
    header = src.header  # type: ignore[attr-defined]
    per_zoom = {zz: len(src.tiles(zz, None, 10**6)) for zz in range(10, 16)}
    # One z15 tile: Ponte Vecchio and the Arno.
    z, lon, lat = 15, 11.2531, 43.7680
    import math

    n = 1 << z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    (key, blob), = src.fetch([(z, x, y)])  # fetch returns the decompressed tile
    stored = src._lookup(zxy_to_tileid(z, x, y))[1]  # type: ignore[attr-defined]  # gzip bytes in the archive
    layers = decode_tile(blob)
    from mvt_worker.mvt import Projector, feature_wkb

    out_layers = []
    for name in LAYER_ORDER:
        lay = next((l for l in layers if l.name == name), None)
        if lay is None:
            continue
        project = Projector(z, x, y, lay.extent, "tile")
        feats = []
        for f in lay.features:
            gtype, wkb = feature_wkb(f, project, lay.version)
            if wkb is None:
                continue
            g = coords(wkb, 0)
            kind = f.properties.get("pmap:kind")
            feats.append({"kind": kind, "name": f.properties.get("name") if name in ("places", "pois") else None, "geometry": g})
        out_layers.append({"name": name, "extent": lay.extent, "features": feats})
    data = {
        "tile": {"z": z, "x": x, "y": y, "bounds": tile_bounds(z, x, y)},
        "compressed_bytes": stored,
        "raw_bytes": len(blob),
        "layers": out_layers,
        "sql": COPY_SQL.format(src="…/protomaps(vector)ODbL_firenze.pmtiles", out="florence.pmtiles"),
    }
    (OUT / "rows-to-tiles.json").write_text(json.dumps(data, separators=(",", ":")))
    facts["rows_to_tiles"] = {
        "rows": copied,
        "seconds": round(seconds, 1),
        "archive_bytes": out.stat().st_size,
        "tiles_per_zoom": per_zoom,
        "addressed_tiles": header["addressed_tiles_count"],
        "distinct_tile_contents": header["tile_contents_count"],
        "tile": [z, x, y],
        "tile_features": {l["name"]: len(l["features"]) for l in out_layers},
        "tile_compressed_bytes": stored,
        "tile_raw_bytes": len(blob),
    }
    return out


def main() -> None:
    facts: dict[str, Any] = {
        "worker": f"vgi-mvt {WORKER_TAG}",
        "duckdb": duckdb.__version__,
        "machine": f"{platform.machine()} {subprocess.run(['sysctl', '-n', 'machdep.cpu.brand_string'], capture_output=True, text=True).stdout.strip()}",
        "exported": time.strftime("%Y-%m-%d"),
    }
    c = connect()
    tile_cut(c, facts)
    print("tile-cut done", flush=True)
    byte_ranges(c, facts)
    print("byte-ranges done", flush=True)
    archive = rows_to_tiles(c, facts)
    print("rows-to-tiles done", flush=True)
    (OUT / "facts.json").write_text(json.dumps(facts, indent=2, default=str))
    print(json.dumps(facts, indent=2, default=str))
    print("archive kept at", archive)


if __name__ == "__main__":
    main()
