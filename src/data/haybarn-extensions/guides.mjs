// Editorial guidance complements the release catalog; it never asserts that
// an extension is available. Example links are filtered against that catalog.
export const categoryGuides = {
  connectors: {
    intro: 'Connect a Haybarn SQL session to another database, an API, or a stream. Start with the system you need to reach, then check how its extension handles authentication and moves data into your query.',
    considerations: ['Check whether the connector supports ATTACH, a table function, or both.', 'Review credentials, external drivers, and whether filters run remotely before choosing a connector.'],
    examples: ['adbc', 'snowflake', 'mssql', 'airport'],
  },
  files: {
    intro: 'Read specialist file formats or add a filesystem that existing DuckDB readers can use. A format reader determines the columns you query; a filesystem extension determines where those files can live.',
    considerations: ['Match the reader to your format and version, such as XLSX workbooks or Zarr v2 and v3 stores.', 'For remote storage, check authentication, supported URI schemes, and whether reads, writes, or both are supported.'],
    examples: ['sheetreader', 'zarr', 'gdrive', 'zipfs'],
  },
  geospatial: {
    intro: 'Add spatial indexing, coordinate transformations, routing, or specialist geographic formats to Haybarn. Choose an extension around the representation your data already uses and the analysis you need to perform.',
    considerations: ['Check coordinate reference systems, coordinate order, and spatial index resolution before joining datasets.', 'Distinguish readers and raster tools from cell indexes and routing engines; they solve different parts of a spatial workflow.'],
    examples: ['a5', 'lindel', 'pdal', 'valhalla_routing'],
  },
  text: {
    intro: 'Compare names, extract text from documents, or transform strings inside a SQL query. These extensions cover tasks beyond exact equality, from fuzzy matching to HTML parsing and template rendering.',
    considerations: ['Choose matching behavior that fits your language, normalization rules, and tolerance for false matches.', 'For document extraction, check the input format and whether markup, metadata, or plain text is returned.'],
    examples: ['rapidfuzz', 'html_readability', 'markdown', 'jsonata'],
  },
  analytics: {
    intro: 'Bring statistical methods, forecasting, graph analysis, and optimization into Haybarn. Compare the method an extension implements with your assumptions about the data before building it into a report or model.',
    considerations: ['Check the required input shape, treatment of missing values, and interpretation of results.', 'For graph queries or forecasting, review setup steps and the amount of state the extension holds in memory.'],
    examples: ['stochastic', 'datasketches', 'duckpgq', 'anofox_forecast'],
  },
  ai: {
    intro: 'Use models, embeddings, vector indexes, and AI service connections from SQL. Some extensions run models locally; others connect Haybarn to a service that has its own credentials and deployment requirements.',
    considerations: ['Identify where inference runs and which model files, services, or credentials are required.', 'Check hardware and platform requirements separately from binary availability, especially for GPU and browser use.'],
    examples: ['faiss', 'flock', 'duckdb_mcp', 'whisper'],
  },
  quality: {
    intro: 'Inspect unfamiliar data, validate its structure, and compare tables before using them downstream. Choose tools that express your actual data contract, including types, missing values, and matching rules.',
    considerations: ['Decide whether failures should stop a query or become rows you can review.', 'Use representative data to check inferred types, validation rules, and comparison keys before applying them to an entire dataset.'],
    examples: ['finetype', 'json_schema', 'duck_diff', 'fakeit'],
  },
  development: {
    intro: 'Extend the SQL environment with embedded languages, alternative syntax, developer utilities, and extension templates. These tools help move custom logic into a query or inspect how it behaves.',
    considerations: ['Check whether code runs inside the database process or through an external runtime.', 'Review language dependencies and supported platforms; native process access and browser execution have different constraints.'],
    examples: ['rusty_quack', 'python_udf', 'lua', 'vgi'],
  },
  operations: {
    intro: 'Query operational data and expose database services from Haybarn. This group includes log readers, monitoring integrations, HTTP services, and tools for inspecting a running system.',
    considerations: ['Check access to the host, network, and external services needed by the extension.', 'Review the cost of collection and queries, and distinguish point-in-time snapshots from continuous monitoring.'],
    examples: ['prometheus', 'loki', 'system_stats', 'httpserver'],
  },
  performance: {
    intro: 'Control query execution and remote reads with caching, request limits, and diagnostic tools. Choose a tool after identifying whether your workload is limited by storage, network latency, or query processing.',
    considerations: ['Measure a representative workload before and after enabling a cache or changing request behavior.', 'Check cache invalidation, memory and disk use, and how limits interact with concurrent queries.'],
    examples: ['cache_httpfs', 'query_condition_cache', 'query_limiter', 'rate_limit_fs'],
  },
  security: {
    intro: 'Add authentication, encryption, privacy tools, and network tunnels to a Haybarn workflow. Select extensions according to the data and connections they protect, and review their configuration with the upstream documentation.',
    considerations: ['Identify where secrets are stored and which connections or data the extension protects.', 'Check required services, key management, and operating-system support before deployment.'],
    examples: ['crypto', 'quack_oauth', 'erpl_tunnel', 'boilstream'],
  },
  science: {
    intro: 'Work with scientific, financial, and other specialist data using domain-specific readers and calculations. These extensions make industry formats and methods accessible alongside ordinary SQL tables.',
    considerations: ['Check units, conventions, and format versions before combining datasets.', 'Review external datasets and libraries, and validate calculations against a known result from your field.'],
    examples: ['dicom', 'finance', 'talib', 'ducksmiles'],
  },
  visualization: {
    intro: 'Create charts, plots, and other visual output from SQL results. Compare where the result is rendered and how it can be saved or shared with the people who need to use it.',
    considerations: ['Check whether output is terminal text, an image, or an interactive browser view.', 'Review font, rendering, and display requirements when running on a server or in WebAssembly.'],
    examples: ['miniplot', 'textplot', 'anofox_visualization', 'duckgl'],
  },
};
