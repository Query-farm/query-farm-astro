// Boot Haybarn-Wasm (a derived distribution of DuckDB-Wasm) on the page.
//
// Slimmed for query.farm's static site: no SharedArrayBuffer cancel channel and
// no OAuth bridge (both require cross-origin isolation, which we deliberately do
// not enable). Because the page is NOT cross-origin isolated, selectBundle()
// never picks the threaded `coi` variant — it lands on the single-threaded `eh`
// build (or `mvp` on browsers without WebAssembly exception handling). That is
// exactly the lightweight, few-threads behavior we want for an embedded demo
// shell.
//
// The wasm binary and worker script are loaded from jsDelivr rather than bundled
// or committed (they are ~32 MB each). createWorker() fetches the cross-origin
// worker script and wraps it in a same-origin blob URL so `new Worker(...)` is
// allowed; the wasm module is fetched with permissive CORS.

import * as duckdb from "@haybarn/haybarn-wasm";

// Pin to the installed @haybarn/haybarn-wasm version so the JS API surface and
// the CDN-hosted wasm/worker artifacts stay in lockstep. Bump both together.
const HAYBARN_WASM_VERSION = "1.5.3-rc7";
const CDN = `https://cdn.jsdelivr.net/npm/@haybarn/haybarn-wasm@${HAYBARN_WASM_VERSION}/dist`;

export interface QueryResult {
  ok: boolean;
  /** Arrow IPC (File format) bytes of the result set, when ok. */
  buffer?: ArrayBuffer;
  error?: string;
}

export interface DuckDBHandle {
  runQuery: (sql: string) => Promise<QueryResult>;
  /** Haybarn/DuckDB engine version string. */
  version: string;
}

let bootPromise: Promise<DuckDBHandle> | null = null;

/** Idempotent boot. Resolves once AsyncDuckDB is instantiated and a connection
 *  is open. Safe to await from multiple shells on the same page. */
export function ensureDuckDB(onProgress?: (pct: number) => void): Promise<DuckDBHandle> {
  if (!bootPromise) {
    bootPromise = boot(onProgress).catch((e) => {
      bootPromise = null; // allow retry after a failed boot
      throw e;
    });
  }
  return bootPromise;
}

async function boot(onProgress?: (pct: number) => void): Promise<DuckDBHandle> {
  const BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: `${CDN}/duckdb-mvp.wasm`,
      mainWorker: `${CDN}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${CDN}/duckdb-eh.wasm`,
      mainWorker: `${CDN}/duckdb-browser-eh.worker.js`,
    },
    // Intentionally no `coi` bundle: the page is not cross-origin isolated, so
    // selectBundle() would never choose it anyway. Omitting it keeps the shell
    // strictly single-threaded.
  };

  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker, (p) => {
    const pct = Number((p as { percentage?: number }).percentage);
    if (Number.isFinite(pct)) onProgress?.(pct);
  });

  const conn = await db.connect();
  const connId = conn.useUnsafe((_db: unknown, id: number) => id);

  // Turn off implicit extension resolution. Without this, referencing a
  // function from an unloaded extension makes the engine try to autoinstall it
  // from the default repository (and, in this wasm build, an autoload during
  // result serialization can throw an opaque "c is not a function"). We instead
  // install every extension explicitly with `INSTALL <name> FROM community`, so
  // the Haybarn community channel is always the source.
  // Eagerly load `json`: many extensions return JSON-typed columns
  // (e.g. UNION(ok JSON, ...)), whose Arrow serialization needs the json
  // extension registered.
  try {
    await db.runQuery(connId, "LOAD json");
  } catch {
    try {
      await db.runQuery(connId, "INSTALL json; LOAD json");
    } catch {
      /* json unavailable — JSON results will surface a friendly note */
    }
  }

  const version = await db.getVersion();

  const runQuery = async (sql: string): Promise<QueryResult> => {
    try {
      const bytes = await db.runQuery(connId, sql);
      // Copy out the result range so the returned ArrayBuffer is independent of
      // any larger arena the worker may have handed back.
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return { ok: true, buffer: ab };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  return { runQuery, version };
}
