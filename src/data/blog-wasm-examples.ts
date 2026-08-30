export interface BlogWasmExamples {
  extensionName: string;
  installSource: string;
  setupSql?: string;
  controls: 'below' | 'toolbar';
}

const BLOG_WASM_EXAMPLES: Record<string, BlogWasmExamples> = {
  'duckdb-lateral-join-api-superpower': {
    extensionName: 'VGI',
    installSource: 'community',
    setupSql:
      "ATTACH 'open_meteo' AS m (TYPE vgi, LOCATION 'https://vgi-open-meteo.rusty-bb6.workers.dev');",
    controls: 'below',
  },
};

export function blogWasmExamples(slug: string): BlogWasmExamples | undefined {
  return BLOG_WASM_EXAMPLES[slug];
}
