export interface Extension {
  id: string;
  name: string;
  description: string;
  category: 'connectors' | 'transformation' | 'analytics' | 'performance' | 'devtools' | 'quality';
  status: 'stable' | 'beta' | 'experimental';
  icon?: string;
  githubUrl?: string;
  docsUrl?: string;
  features?: string[];
}

export const extensions: Extension[] = [
  // Data Connectors (5)
  {
    id: 'postgres-connector',
    name: 'PostgreSQL Connect',
    description: 'Seamless bidirectional integration with PostgreSQL databases. Read and write data with optimized connection pooling and schema inference.',
    category: 'connectors',
    status: 'stable',
    icon: '🐘',
    githubUrl: 'https://github.com/queryfarm/duckdb-postgres',
    docsUrl: 'https://docs.query.farm/extensions/postgres',
    features: [
      'Bidirectional data sync',
      'Automatic schema inference',
      'Connection pooling',
      'Transaction support'
    ]
  },
  {
    id: 'mysql-connector',
    name: 'MySQL Connect',
    description: 'High-performance MySQL integration with support for complex queries and data migrations.',
    category: 'connectors',
    status: 'stable',
    icon: '🐬',
    githubUrl: 'https://github.com/queryfarm/duckdb-mysql',
    features: [
      'Fast bulk imports',
      'Incremental sync',
      'Custom type mappings'
    ]
  },
  {
    id: 's3-connector',
    name: 'S3 Data Lake',
    description: 'Direct querying of S3 data lakes with support for Parquet, CSV, and JSON formats.',
    category: 'connectors',
    status: 'stable',
    icon: '☁️',
    githubUrl: 'https://github.com/queryfarm/duckdb-s3',
    features: [
      'Zero-copy reads',
      'Partition pruning',
      'Multi-format support'
    ]
  },
  {
    id: 'kafka-connector',
    name: 'Kafka Streams',
    description: 'Real-time data ingestion from Apache Kafka topics with schema registry support.',
    category: 'connectors',
    status: 'beta',
    icon: '📨',
    githubUrl: 'https://github.com/queryfarm/duckdb-kafka',
    features: [
      'Real-time ingestion',
      'Schema registry integration',
      'Offset management'
    ]
  },
  {
    id: 'api-connector',
    name: 'REST API Connect',
    description: 'Query REST APIs directly as tables with automatic pagination and authentication.',
    category: 'connectors',
    status: 'beta',
    icon: '🌐',
    githubUrl: 'https://github.com/queryfarm/duckdb-api',
    features: [
      'Auto pagination',
      'OAuth support',
      'Rate limiting'
    ]
  },

  // Data Transformation (4)
  {
    id: 'json-transformer',
    name: 'JSON Transform Pro',
    description: 'Advanced JSON processing with path queries, flattening, and nested array handling.',
    category: 'transformation',
    status: 'stable',
    icon: '📋',
    githubUrl: 'https://github.com/queryfarm/duckdb-json',
    features: [
      'JSONPath queries',
      'Auto-flattening',
      'Schema validation'
    ]
  },
  {
    id: 'geo-transformer',
    name: 'GeoSpatial Tools',
    description: 'Comprehensive geospatial functions for location data analysis and transformation.',
    category: 'transformation',
    status: 'stable',
    icon: '🗺️',
    githubUrl: 'https://github.com/queryfarm/duckdb-geo',
    features: [
      'Distance calculations',
      'Polygon operations',
      'Coordinate transformations'
    ]
  },
  {
    id: 'time-series',
    name: 'Time Series Toolkit',
    description: 'Specialized functions for time series analysis, windowing, and forecasting.',
    category: 'transformation',
    status: 'stable',
    icon: '📈',
    githubUrl: 'https://github.com/queryfarm/duckdb-timeseries',
    features: [
      'Rolling windows',
      'Resampling',
      'Trend detection'
    ]
  },
  {
    id: 'text-processor',
    name: 'Text Analytics',
    description: 'Natural language processing functions including tokenization, stemming, and sentiment analysis.',
    category: 'transformation',
    status: 'beta',
    icon: '📝',
    githubUrl: 'https://github.com/queryfarm/duckdb-text',
    features: [
      'NLP tokenization',
      'Sentiment scoring',
      'Entity extraction'
    ]
  },

  // Analytics & ML (4)
  {
    id: 'ml-models',
    name: 'ML Model Runner',
    description: 'Execute machine learning models directly in SQL with support for scikit-learn and TensorFlow.',
    category: 'analytics',
    status: 'beta',
    icon: '🤖',
    githubUrl: 'https://github.com/queryfarm/duckdb-ml',
    features: [
      'In-database predictions',
      'Model versioning',
      'Batch inference'
    ]
  },
  {
    id: 'stats-advanced',
    name: 'Advanced Statistics',
    description: 'Statistical functions beyond standard SQL including hypothesis testing and distributions.',
    category: 'analytics',
    status: 'stable',
    icon: '📊',
    githubUrl: 'https://github.com/queryfarm/duckdb-stats',
    features: [
      'Hypothesis testing',
      'Distribution fitting',
      'Correlation analysis'
    ]
  },
  {
    id: 'graph-analytics',
    name: 'Graph Analytics',
    description: 'Graph algorithms and relationship analysis for connected data.',
    category: 'analytics',
    status: 'experimental',
    icon: '🕸️',
    githubUrl: 'https://github.com/queryfarm/duckdb-graph',
    features: [
      'Shortest path',
      'Community detection',
      'Centrality metrics'
    ]
  },
  {
    id: 'forecasting',
    name: 'Forecasting Engine',
    description: 'Time series forecasting with multiple algorithms including ARIMA and Prophet.',
    category: 'analytics',
    status: 'beta',
    icon: '🔮',
    githubUrl: 'https://github.com/queryfarm/duckdb-forecast',
    features: [
      'Multiple algorithms',
      'Confidence intervals',
      'Seasonality detection'
    ]
  },

  // Performance & Optimization (3)
  {
    id: 'query-cache',
    name: 'Smart Query Cache',
    description: 'Intelligent query result caching with automatic invalidation and memory management.',
    category: 'performance',
    status: 'stable',
    icon: '⚡',
    githubUrl: 'https://github.com/queryfarm/duckdb-cache',
    features: [
      'Auto-invalidation',
      'Memory limits',
      'Hit rate tracking'
    ]
  },
  {
    id: 'parallel-processor',
    name: 'Parallel Processing',
    description: 'Enhanced parallel query execution with custom thread pool management.',
    category: 'performance',
    status: 'stable',
    icon: '🚀',
    githubUrl: 'https://github.com/queryfarm/duckdb-parallel',
    features: [
      'Thread pool control',
      'Work stealing',
      'NUMA awareness'
    ]
  },
  {
    id: 'compression-plus',
    name: 'Compression Plus',
    description: 'Advanced compression algorithms for reduced storage and faster I/O.',
    category: 'performance',
    status: 'beta',
    icon: '🗜️',
    githubUrl: 'https://github.com/queryfarm/duckdb-compression',
    features: [
      'Multiple algorithms',
      'Auto-selection',
      'Streaming compression'
    ]
  },

  // Developer Tools (2)
  {
    id: 'query-debugger',
    name: 'Query Debugger',
    description: 'Interactive query debugging with execution plan visualization and profiling.',
    category: 'devtools',
    status: 'stable',
    icon: '🔍',
    githubUrl: 'https://github.com/queryfarm/duckdb-debugger',
    features: [
      'Plan visualization',
      'Step-by-step execution',
      'Performance profiling'
    ]
  },
  {
    id: 'data-validator',
    name: 'Schema Validator',
    description: 'Comprehensive data validation and schema enforcement with custom rules.',
    category: 'devtools',
    status: 'stable',
    icon: '✅',
    githubUrl: 'https://github.com/queryfarm/duckdb-validator',
    features: [
      'Custom validation rules',
      'Type checking',
      'Constraint enforcement'
    ]
  },

  // Data Quality (2)
  {
    id: 'data-profiler',
    name: 'Data Profiler',
    description: 'Automated data profiling with statistics, patterns, and quality metrics.',
    category: 'quality',
    status: 'stable',
    icon: '📏',
    githubUrl: 'https://github.com/queryfarm/duckdb-profiler',
    features: [
      'Auto-profiling',
      'Quality scoring',
      'Anomaly detection'
    ]
  },
  {
    id: 'dedup-engine',
    name: 'Deduplication Engine',
    description: 'Intelligent duplicate detection and resolution with fuzzy matching.',
    category: 'quality',
    status: 'beta',
    icon: '🔗',
    githubUrl: 'https://github.com/queryfarm/duckdb-dedup',
    features: [
      'Fuzzy matching',
      'Similarity scoring',
      'Merge strategies'
    ]
  },

  // Example Extension (testbed for all features)
  {
    id: 'example',
    name: 'Example Extension',
    description: 'Example extension demonstrating all available extension features and documentation patterns.',
    category: 'devtools',
    status: 'stable',
    icon: '📦',
    githubUrl: 'https://github.com/queryfarm/duckdb-example',
    docsUrl: 'https://docs.query.farm/extensions/example',
    features: [
      'Functions documentation',
      'Macros documentation',
      'Pragmas/Settings',
      'Secrets management',
      'Filesystems',
      'Cookbook examples'
    ]
  },
  {
    id: 'bitfilters',
    name: 'Bit Filters & Bloom',
    description: 'High-performance probabilistic data structures including Bloom filters, HyperLogLog, and Count-Min Sketch for approximate computations.',
    category: 'performance',
    status: 'stable',
    icon: '🎯',
    githubUrl: 'https://github.com/queryfarm/duckdb-bitfilters',
    docsUrl: 'https://docs.query.farm/extensions/bitfilters',
    features: [
      'Bloom filters for membership testing',
      'HyperLogLog for cardinality estimation',
      'Count-Min Sketch for frequency estimation',
      'Bit arrays and operations',
      'Space-efficient with tunable accuracy'
    ]
  },
  {
    id: 'minijinja',
    name: 'MiniJinja Templates',
    description: 'Powerful Jinja2-style templating engine for DuckDB. Generate dynamic SQL, format output, and transform data with expressive templates.',
    category: 'transformation',
    status: 'beta',
    icon: '📝',
    githubUrl: 'https://github.com/queryfarm/duckdb-minijinja',
    docsUrl: 'https://docs.query.farm/extensions/minijinja',
    features: [
      'Jinja2-compatible syntax',
      'Control flow (if/for/while)',
      'Filters and functions',
      'Template inheritance',
      'Macro support',
      'Auto-escaping for security'
    ]
  },
  {
    id: 'hashfunctions',
    name: 'Hash Functions',
    description: 'High-performance hashing functions including MurmurHash, CityHash, and xxHash for fast non-cryptographic hashing operations.',
    category: 'performance',
    status: 'stable',
    icon: '#️⃣',
    githubUrl: 'https://github.com/queryfarm/duckdb-hashfunctions',
    docsUrl: 'https://docs.query.farm/extensions/hashfunctions',
    features: [
      'MurmurHash3 (32-bit and 128-bit)',
      'CityHash family (64-bit and 128-bit)',
      'xxHash (32-bit and 64-bit)',
      'Optimized for hash table operations',
      'Non-cryptographic but very fast',
      'Collision-resistant hashing'
    ]
  }
];

export const getExtensionById = (id: string): Extension | undefined => {
  return extensions.find(ext => ext.id === id);
};

export const getExtensionsByIds = (ids: string[]): Extension[] => {
  return ids.map(id => getExtensionById(id)).filter(Boolean) as Extension[];
};

export const extensionsByCategory = () => {
  return extensions.reduce((acc, ext) => {
    if (!acc[ext.category]) acc[ext.category] = [];
    acc[ext.category].push(ext);
    return acc;
  }, {} as Record<string, Extension[]>);
};

export const categoryInfo = {
  connectors: {
    title: 'Data Connectors',
    description: 'Connect DuckDB to various data sources and destinations',
    icon: '🔌'
  },
  transformation: {
    title: 'Data Transformation',
    description: 'Transform and process data with specialized functions',
    icon: '🔄'
  },
  analytics: {
    title: 'Analytics & ML',
    description: 'Advanced analytics and machine learning capabilities',
    icon: '🧠'
  },
  performance: {
    title: 'Performance & Optimization',
    description: 'Enhance query performance and resource utilization',
    icon: '⚡'
  },
  devtools: {
    title: 'Developer Tools',
    description: 'Tools for debugging, validation, and development',
    icon: '🛠️'
  },
  quality: {
    title: 'Data Quality',
    description: 'Ensure data quality and consistency',
    icon: '✨'
  }
};
