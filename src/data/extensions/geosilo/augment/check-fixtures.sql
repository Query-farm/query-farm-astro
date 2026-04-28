-- check-fixtures.sql for geosilo
-- spatial is needed for ST_GeomFromText, ST_AsText, etc.
INSTALL spatial;
LOAD spatial;

-- raw GEOMETRY source for INSERT INTO parcels SELECT ... FROM raw_parcels;
CREATE OR REPLACE TABLE raw_parcels AS
SELECT * FROM (VALUES
  (1, 'a', ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))')),
  (2, 'b', ST_GeomFromText('POLYGON((2 2,3 2,3 3,2 3,2 2))'))
) t(id, name, geom);

-- NOTE: raw_data intentionally not created. The tech-details snippets
-- INSERT INTO parcels SELECT id, geom FROM raw_data, but cookbook.mdx
-- runs first and creates `parcels` with 3 columns (id, name, geom),
-- so a 2-column INSERT would fail bind. Leaving raw_data missing
-- preserves the PARSE-SKIP "table fixture missing" verdict.

-- roads(geom) for ST_Length aggregate
CREATE OR REPLACE TABLE roads AS
SELECT * FROM (VALUES
  (ST_GeomFromText('LINESTRING(0 0, 1 1, 2 2)')),
  (ST_GeomFromText('LINESTRING(0 0, 0 1, 0 2)'))
) t(geom);

-- stations(id, geom) — point geometries for ST_X/ST_Y
CREATE OR REPLACE TABLE stations AS
SELECT * FROM (VALUES
  (1, ST_GeomFromText('POINT(-77.0 39.0)')),
  (2, ST_GeomFromText('POINT(-76.5 40.5)'))
) t(id, geom);

-- mixed_geom_table(geom) — mixed geometry types
CREATE OR REPLACE TABLE mixed_geom_table AS
SELECT * FROM (VALUES
  (ST_GeomFromText('POINT(0 0)')),
  (ST_GeomFromText('LINESTRING(0 0, 1 1)')),
  (ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))'))
) t(geom);

-- compact_table(silo_blob) — geosilo blobs for geosilo_metadata example
CREATE OR REPLACE TABLE compact_table AS
SELECT geosilo_encode(ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))')) AS silo_blob
UNION ALL
SELECT geosilo_encode(ST_GeomFromText('POINT(1 2)')) AS silo_blob;

-- utm_data(geom) — projected meters geometry source
CREATE OR REPLACE TABLE utm_data AS
SELECT ST_GeomFromText('POINT(500000 4500000)') AS geom;

-- mm_precision_data(geom) and millimeter_data(geom)
CREATE OR REPLACE TABLE mm_precision_data AS
SELECT ST_GeomFromText('POINT(0.001 0.002)') AS geom;
CREATE OR REPLACE TABLE millimeter_data AS
SELECT ST_GeomFromText('POINT(0.001 0.002)') AS geom;

-- parcels_geometry(id, geom) — GEOMETRY-typed parcels for export example
CREATE OR REPLACE TABLE parcels_geometry AS
SELECT id, geom FROM raw_parcels;
