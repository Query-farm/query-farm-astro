import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Optional locally built extensions allow testing fixes before community
// packages are published, without changing the user's installed extensions.
// A repository name loads installed extensions from that user-provided
// repository (e.g. query_farm on DuckDB 2.0), which a plain LOAD refuses.
export function extensionRuntime(directory, repository) {
  if (repository && !/^\w+$/.test(repository)) throw new Error(`Invalid repository name: ${repository}`);
  const base = directory && resolve(directory);
  if (base && !existsSync(base)) throw new Error(`Extension directory does not exist: ${base}`);
  return slug => {
    const candidate = base && join(base, `${slug}.duckdb_extension`);
    const local = candidate && existsSync(candidate);
    return {
      args: local ? ['-unsigned'] : [],
      load: local ? `LOAD '${candidate.replaceAll("'", "''")}';`
        : repository ? `LOAD ${slug} FROM ${repository};` : `LOAD ${slug};`,
      provenance: local ? {
        source: 'local-build',
        binarySha256: createHash('sha256').update(readFileSync(candidate)).digest('hex'),
      } : { source: 'installed', ...(repository ? { repository } : {}) },
    };
  };
}
