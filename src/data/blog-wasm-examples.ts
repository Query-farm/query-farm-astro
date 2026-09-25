export interface BlogWasmExamples {
  extensionName: string;
  installSource: string;
  setupSql?: string;
  controls: 'below' | 'toolbar';
  codeBlockSelector?: string;
}

const BLOG_WASM_EXAMPLES: Record<string, BlogWasmExamples> = {
  'http-caching-duckdb-vgi': {
    extensionName: 'VGI',
    installSource: 'community',
    controls: 'below',
    codeBlockSelector: '#yfinance-cache-example pre[data-language="sql"]',
  },
  'call-an-api-from-every-row-in-duckdb': {
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
