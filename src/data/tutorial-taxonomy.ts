/** One primary task per tutorial. Tools/formats are a separate, reusable facet. */
export const tutorialCategories = [
  { id: 'sql-fundamentals', label: 'SQL fundamentals', description: 'Select, join, aggregate, and reshape data.' },
  { id: 'clean-match', label: 'Clean & match data', description: 'Normalize values, resolve duplicates, and check data quality.' },
  { id: 'files-formats', label: 'Files & formats', description: 'Read, compare, convert, and export files.' },
  { id: 'connect-sources', label: 'Connect data sources', description: 'Query databases, APIs, and remote storage.' },
  { id: 'analyze-data', label: 'Analyze data', description: 'Explore time series, statistics, text, and geospatial data.' },
  { id: 'performance-operations', label: 'Performance & operations', description: 'Inspect plans, tune queries, and build reliable workflows.' },
] as const;
export type TutorialCategory = typeof tutorialCategories[number]['id'];
export const tutorialCategoryIds = tutorialCategories.map(category => category.id) as [TutorialCategory, ...TutorialCategory[]];

export const tutorialTechnologies = [
  { id: 'duckdb', label: 'DuckDB' }, { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'parquet', label: 'Parquet' }, { id: 'csv', label: 'CSV' },
  { id: 'json', label: 'JSON' }, { id: 'arrow', label: 'Apache Arrow' },
  { id: 'adbc', label: 'ADBC' }, { id: 'rapidfuzz', label: 'RapidFuzz' },
  { id: 'wasm', label: 'WebAssembly' }, { id: 'vgi', label: 'VGI' },
  { id: 'json-schema', label: 'JSON Schema' }, { id: 'datasketches', label: 'DataSketches' },
  { id: 'jsonata', label: 'JSONata' }, { id: 'hashfuncs', label: 'Hashfuncs' },
] as const;
export type TutorialTechnology = typeof tutorialTechnologies[number]['id'];
export const tutorialTechnologyIds = tutorialTechnologies.map(tool => tool.id) as [TutorialTechnology, ...TutorialTechnology[]];
export const tutorialCategoryLabel = (id: string) => tutorialCategories.find(category => category.id === id)?.label ?? id;
export const tutorialTechnologyLabel = (id: string) => tutorialTechnologies.find(tool => tool.id === id)?.label ?? id;
