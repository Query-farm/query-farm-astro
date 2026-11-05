// The Query.Farm extension repository, where the DuckDB 2.0 builds of our
// extensions are published and signed. DuckDB 1.4 and 1.5 still install them
// from the community repository.
export const QUERY_FARM_REPOSITORY_PREFIX = 'https://duckdb-extensions.query.farm';

// Page slug -> the name DuckDB installs and loads, for every extension
// published to the repository. Most are the same; openprompt is not.
const repositoryExtensionNames: Record<string, string> = {
  a5: 'a5',
  adbc_scanner: 'adbc_scanner',
  airport: 'airport',
  bitfilters: 'bitfilters',
  cronjob: 'cronjob',
  crypto: 'crypto',
  datasketches: 'datasketches',
  evalexpr_rhai: 'evalexpr_rhai',
  fuzzycomplete: 'fuzzycomplete',
  geosilo: 'geosilo',
  hashfuncs: 'hashfuncs',
  http_client: 'http_client',
  httpserver: 'httpserver',
  inflector: 'inflector',
  json_schema: 'json_schema',
  jsonata: 'jsonata',
  lindel: 'lindel',
  marisa: 'marisa',
  minijinja: 'minijinja',
  openprompt: 'open_prompt',
  quickjs: 'quickjs',
  radio: 'radio',
  rapidfuzz: 'rapidfuzz',
  redis: 'redis',
  shellfs: 'shellfs',
  stochastic: 'stochastic',
  tera: 'tera',
  textplot: 'textplot',
  tributary: 'tributary',
  tsid: 'tsid',
  webmacro: 'webmacro',
};

export function queryFarmRepositoryName(slug: string): string | undefined {
  return repositoryExtensionNames[slug];
}

// Run once per machine: allow custom repositories, add ours, download the extension.
export function queryFarmInstallSql(name: string): string {
  return [
    "SET allow_extension_repositories = 'allowed';",
    'CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm',
    `  WITH PREFIX '${QUERY_FARM_REPOSITORY_PREFIX}';`,
    `INSTALL ${name} FROM query_farm;`,
  ].join('\n');
}

// Run in every session that uses the extension.
export function queryFarmLoadSql(name: string): string {
  return `LOAD ${name} FROM query_farm;`;
}

// The Install tabs for an extension published to the repository: DuckDB 2.0
// from query_farm, DuckDB 1.5 from community. Shared by the extension pages
// and the blog's "Try it" card, so the two never disagree. Pass the tabs to a
// CodeTabs with group="duckdb-version" so a reader's choice follows them.
export function queryFarmInstallTabs(repositoryName: string) {
  return [
    {
      id: 'v2.0',
      label: 'DuckDB 2.0',
      icon: 'simple-icons:duckdb',
      lang: 'sql',
      steps: [
        {
          title: '1. Install once',
          description: 'Adds the Query.Farm extension repository and downloads the signed extension. Run it once on each machine; it is safe to run again.',
          code: queryFarmInstallSql(repositoryName),
        },
        {
          title: '2. Load in every session',
          description: 'Loads the installed extension. Run it at the start of each DuckDB session.',
          code: queryFarmLoadSql(repositoryName),
        },
      ],
    },
    {
      id: 'v1.5',
      label: 'DuckDB 1.5',
      icon: 'simple-icons:duckdb',
      lang: 'sql',
      steps: [
        {
          title: '1. Install once',
          description: 'Downloads the extension from the DuckDB community repository. The same steps work on DuckDB 1.4.',
          code: `INSTALL ${repositoryName} FROM community;`,
        },
        {
          title: '2. Load in every session',
          description: 'Loads the installed extension. Run it at the start of each DuckDB session.',
          code: `LOAD ${repositoryName};`,
        },
      ],
    },
  ];
}
