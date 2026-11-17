// The worker list the console may deploy, read from the static
// /products/orchard/hosted/workers.json (built from the Orchard catalog).
// Reading it through env.ASSETS keeps the 48 MB catalog out of the Functions
// bundle.

import type { OrchardEnv } from './http';

export const HOSTED_WORKERS_PATH = '/products/orchard/hosted/workers.json';

export interface HostedWorker {
  slug: string;
  name: string;
  catalog: string;
  pricing: 'open' | 'paid';
  /** Latest release tag. */
  version: string | null;
  /** Recent published release tags, newest first; a deployment must use one of them. */
  versions?: string[];
}

/** The releases a customer may deploy: the recent list, or just the latest. */
export const deployableVersions = (w: HostedWorker): string[] =>
  w.versions?.length ? w.versions : w.version ? [w.version] : [];

let cached: { at: number; workers: Map<string, HostedWorker> } | null = null;

export async function hostedWorkers(env: OrchardEnv, request: Request): Promise<Map<string, HostedWorker>> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.workers;
  if (!env.ASSETS) throw new Error('ASSETS binding missing');
  const response = await env.ASSETS.fetch(new URL(HOSTED_WORKERS_PATH, request.url));
  if (!response.ok) throw new Error(`Worker list answered ${response.status}`);
  const body = await response.json() as { workers?: HostedWorker[] };
  const workers = new Map((body.workers ?? []).map(w => [w.slug, w]));
  cached = { at: Date.now(), workers };
  return workers;
}

/** Tests swap catalogs between cases. */
export const resetWorkerCache = () => { cached = null; };
