// Finds the extensions an example's SQL will load, so they can be prefetched
// together. Only a hint: a statement this misses is still run, and its LOAD
// then downloads the extension itself.

export interface ExtensionRef {
  name: string;
  /** Where to install it from, when the SQL names a repository. */
  source?: string;
}

/** Other extensions a LOAD pulls in, which would otherwise download inside it. */
const LOAD_DEPENDENCIES: Record<string, string[]> = {
  iceberg: ['avro', 'parquet'],
};

/** The names to prefetch for these extensions, including what their LOADs pull in. */
export function namesToPrefetch(extensions: ExtensionRef[]): string[] {
  const names = new Set<string>();
  for (const { name } of extensions) {
    names.add(name);
    for (const dependency of LOAD_DEPENDENCIES[name.toLowerCase()] ?? []) names.add(dependency);
  }
  return [...names];
}

const STATEMENT =
  /(?:^|;)\s*(?:INSTALL|LOAD)\s+["']?([A-Za-z_][A-Za-z0-9_]*)["']?(?![\w./])(?:\s+FROM\s+(?:'([^']*)'|([A-Za-z_][A-Za-z0-9_]*)))?/gi;

/** The extensions `sql` installs or loads, other than `primary`. */
export function extensionsInSql(sql: string, primary: string): ExtensionRef[] {
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const found = new Map<string, ExtensionRef>();
  for (const [, rawName, url, repository] of code.matchAll(STATEMENT)) {
    const name = rawName.toLowerCase();
    if (name === primary.toLowerCase()) continue;
    // The browser engine gets Query.Farm's extensions from community.
    const source = url ?? (repository?.toLowerCase() === 'query_farm' ? 'community' : repository);
    found.set(name, { name, source: source ?? found.get(name)?.source });
  }
  return [...found.values()];
}
