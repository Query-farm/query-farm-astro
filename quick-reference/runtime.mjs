import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Optional locally built extensions allow testing fixes before community
// packages are published, without changing the user's installed extensions.
export function extensionRuntime(directory) {
  const base = directory && resolve(directory);
  if (base && !existsSync(base)) throw new Error(`Extension directory does not exist: ${base}`);
  return slug => {
    const candidate = base && join(base, `${slug}.duckdb_extension`);
    const local = candidate && existsSync(candidate);
    return {
      args: local ? ['-unsigned'] : [],
      load: local ? `LOAD '${candidate.replaceAll("'", "''")}';` : `LOAD ${slug};`,
      provenance: local ? {
        source: 'local-build',
        binarySha256: createHash('sha256').update(readFileSync(candidate)).digest('hex'),
      } : { source: 'installed' },
    };
  };
}
