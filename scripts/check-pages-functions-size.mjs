// Fail before deploy when the Pages Functions bundle approaches Cloudflare's
// 25 MiB uncompressed limit. Cloudflare only reports the overflow after every
// asset has uploaded, at the end of a full CI run.
//
// Usage: node scripts/check-pages-functions-size.mjs <wrangler outdir>
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 25 * 1024 * 1024;
// Wrangler bundles again on deploy, so keep a margin below the hard limit.
const BUDGET = 20 * 1024 * 1024;
const dir = process.argv[2] ?? '.wrangler-dist';

function total(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + total(join(path, name)), 0);
}

const bytes = total(dir);
const mib = n => `${(n / 1024 / 1024).toFixed(1)} MiB`;
if (bytes > BUDGET) {
  console.error(`[pages-functions] Bundle is ${mib(bytes)}, over the ${mib(BUDGET)} budget (Cloudflare rejects anything over ${mib(LIMIT)}).`);
  console.error('Large data belongs in static files fetched through env.ASSETS: see src/haybarn-functions/data/function-data-paths.mjs.');
  process.exit(1);
}
console.log(`[pages-functions] Bundle is ${mib(bytes)} (budget ${mib(BUDGET)}, limit ${mib(LIMIT)}).`);
