// Reviewed against the descriptors. These groups describe purpose, never
// availability or quality. Unclassified new entries remain visible in All.
export const categories = [
  { id: 'connectors', name: 'Databases & services', icon: 'plugs-connected', description: 'Query databases, spreadsheets, APIs, and streams.', members: 'adbc adbc_scanner airport altertable bigquery blockduck cassandra chsql_native crawler dazzleduck delta_classic duck_delta_share duck_lk duckdb_delta_sharing duckhog ducklake_cdc elasticsearch erpl_web eurostat fire_duck_ext firebird fusion_scanner gaggle gsheets harbor hive_metastore http_client http_request huggingface keboola level_pivot livetennis mongo mooncake msolap mssql nanodbc nats_js ofquack onelake oracle_scanner paimon pbi_scanner radio redis salesforce sistat slack snowflake spxlsx sudan superhuman_docs tributary web_archive web_search' },
  { id: 'files', name: 'Files & formats', icon: 'files', description: 'Read unfamiliar file formats and reach remote storage.', members: 'arrow azure_wasm cloudfs cozip curl_httpfs cwiqduck delta_export dta duckdb_opendalfs duckdb_zarr erpl_idoc file_dialog fsquery gcs gdrive gh h5db hdf5 hdfs hostfs ion jsono lastra magic nanoarrow nsv opendal orc pbix protoduck pst qvd rawduck read_dbf read_lines read_stat rrd rusty_sheet scalarfs sheetreader shellfs sshfs storage_compat tarfs toml tsfile warc webdavfs yaml zarr zim zipfs' },
  { id: 'geospatial', name: 'Geospatial', icon: 'globe-hemisphere-west', description: 'Work with maps, coordinates, spatial grids, and rasters.', members: 'a5 cityjson cog duck_dggs duck_geoarrow duckdb_geoip_rs duckgl eeagrid fit geography geosilo geotiff gridpin_ext h3 hex9 interlis lindel maxmind osmium overture pdal pintail raster raquet se3 st_read_multi stac three_d valhalla_routing' },
  { id: 'text', name: 'Text & matching', icon: 'text-aa', description: 'Match names, parse documents, and transform text.', members: 'duck_block_utils duckdb_rphonetic fuzzycomplete html_query html_readability inflector jsonata markdown marisa minijinja netquack pdf rapidfuzz sitemap splink_udfs tera urlpattern webbed' },
  { id: 'analytics', name: 'Statistics & graphs', icon: 'chart-line', description: 'Forecast, summarize, optimize, and analyze relationships.', members: 'anofox_forecast anofox_optimize anofox_scenario anofox_statistics behavioral bitfilters clamp datasketches decimal_arithmetic duckgql duckpgq gpudb highs lttb onager petgraph_ext pivot_table quackstats rdf semantic_views stats_duck stochastic yardstick' },
  { id: 'ai', name: 'AI & machine learning', icon: 'brain', description: 'Use models, embeddings, and vector search from SQL.', members: 'acp ai anofox_similarity anofox_tabfm deferred_columns duckdb_mcp duckthink faiss flock hnsw_acorn infera llm lsh ml mlpack open_prompt pic2vec quackformers rocket title_mapper turbovec vindex whisper' },
  { id: 'quality', name: 'Data quality', icon: 'check-square', description: 'Validate data, identify types, and compare tables.', members: 'anofox_tabular dqtest duck_diff fakeit finetype json_schema title_mapper us_address_standardizer' },
  { id: 'development', name: 'Developer tools', icon: 'code', description: 'Extend SQL, embed languages, and inspect queries.', members: 'capi_quack chaos chsql dplyr duck_tails ducklink ducktinycc eenddb evalexpr_rhai events func_apply hashfuncs ldbc_data_gen lpts lua luajit parser_tools poached polyglot prql psql python_udf quickjs rusty_quack sitting_duck substrait tpch_rust trino_parity tsid ulid vgi waddle webmacro' },
  { id: 'operations', name: 'Operations & monitoring', icon: 'pulse', description: 'Query logs, monitor systems, and operate SQL services.', members: 'agent_data brew cloudwatch cronjob datadog dns duck_hunt duck_lineage duckherder ducknng duckorch duckton gcloud_observability http_stats httpd_log httpserver loki observefs otlp pcap_duckdb pcap_reader pfc prometheus pyroscope quack_flamegraph quackapi sazgar splunk system_stats table_inspector wireduck zeek' },
  { id: 'performance', name: 'Performance', icon: 'gauge', description: 'Cache data, inspect costs, and control query execution.', members: 'cache_httpfs cache_prewarm dryrun ducksync fivetran gpudb hedged_request_fs holtfs httpfs_timeout_retry latency_injection_fs quackstore query_condition_cache query_limiter rate_limit_fs robust' },
  { id: 'security', name: 'Security & networking', icon: 'shield-check', description: 'Manage authentication, privacy, encryption, and tunnels.', members: 'boilstream cloudfront crypto erpl_tunnel jwt oast pac quack_oauth quackscale table_guard' },
  { id: 'science', name: 'Science & industry', icon: 'flask', description: 'Analyze scientific, financial, and specialist data.', members: 'aixchess anndata astro bvh2sql celestial chess dbn dicom duckdb_midi duckdb_rdkit duckhts ducksmiles finance gdx gorz laterite_ags4 miint monetary motorsport_telemetry mpduck plinking_duck psyduck quackfix quackiso scrooge talib' },
  { id: 'visualization', name: 'Visualization', icon: 'chart-bar', description: 'Create charts, dashboards, and visual explorations.', members: 'anofox_visualization dash duckdbi duckgl ggsql miniplot textplot' },
].map(category => ({ ...category, members: category.members.split(' ') }));

// Search aliases supplement the developers' descriptions; they don't create
// capability badges. Each is a term a user might reasonably search for.
export const searchAliases = {
  sheetreader: ['Excel', 'XLSX', 'spreadsheet', 'read Excel', 'import workbook'],
  gsheets: ['Google Sheets', 'spreadsheet', 'read spreadsheet', 'write spreadsheet'],
  rapidfuzz: ['fuzzy matching', 'misspelled names', 'typos', 'deduplication', 'record linkage', 'edit distance'],
  a5: ['spatial indexing', 'map grid', 'coordinates'],
  h3: ['spatial indexing', 'hexagons', 'map grid', 'coordinates'],
  read_stat: ['SAS', 'Stata', 'SPSS', 'sav', 'sas7bdat'],
  rusty_sheet: ['Excel', 'XLSX', 'OpenDocument', 'spreadsheet'],
  airport: ['Arrow Flight', 'connect to database'],
  json_schema: ['validate JSON', 'JSON Schema', 'validation'],
};

export function categoryIds(name) {
  return categories.filter(category => category.members.includes(name)).map(category => category.id);
}
