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
//
// One engine, many shells: the engine boots once (singleton). Each on-page
// example mounts its own terminal and gets an isolated *session* — a private
// connection on its own `ATTACH ':memory:'` database — so tables/state created
// in one example never leak into another. Extensions are installed once,
// engine-wide, and are visible to every session.
//
// One exception: catalogs an *example's own SQL* attaches (`ATTACH ... AS
// foo`) live in DuckDB's engine-wide catalog namespace, not the session —
// isolation there is Session.runQuery()'s job (see attachAliasOf below),
// not something a private `:memory:` database gets for free.

import * as duckdb from "@haybarn/haybarn-wasm";

// Pin to the installed @haybarn/haybarn-wasm version so the JS API surface and
// the CDN-hosted wasm/worker artifacts stay in lockstep. Bump both together.
const HAYBARN_WASM_VERSION = "1.5.5-rc2";
// unpkg, not jsDelivr: the package's unpacked size (168 MB as of rc13) exceeds
// jsDelivr's 150 MB limit, which makes it 403 every file in the package.
const CDN = `https://unpkg.com/@haybarn/haybarn-wasm@${HAYBARN_WASM_VERSION}/dist`;

export interface QueryResult {
  ok: boolean;
  /** Arrow IPC (File format) bytes of the result set, when ok. */
  buffer?: ArrayBuffer;
  error?: string;
}

interface Engine {
  db: duckdb.AsyncDuckDB;
  version: string;
  /** A connection id used for engine-wide control statements (LOAD, INSTALL). */
  controlConnId: number;
}

/** Build the `INSTALL <name> FROM ...` clause from an extension's install source. */
export function installFromClause(source: string): string {
  if (source === "community") return "FROM community";
  if (source.toLowerCase().startsWith("from ")) return source;
  return `FROM '${source}'`;
}

let enginePromise: Promise<Engine> | null = null;

/** Idempotent engine boot. Resolves once AsyncDuckDB is instantiated and the
 *  control connection is open. Safe to await from many shells on one page. */
export function ensureEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = boot().catch((e) => {
      enginePromise = null; // allow retry after a failed boot
      throw e;
    });
  }
  return enginePromise;
}

async function boot(): Promise<Engine> {
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
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  if (import.meta.env.DEV) {
    // Dev-only: permit LOADing locally built, unsigned extension artifacts
    // (e.g. `INSTALL x FROM 'http://localhost:8787'` against a local build).
    // Production stays signed-only.
    await db.open({ allowUnsignedExtensions: true } as duckdb.DuckDBConfig);
  }

  const conn = await db.connect();
  const controlConnId = conn.useUnsafe((_db: unknown, id: number) => id);

  // Eagerly load `json`: many extensions return JSON-typed columns, whose
  // Arrow serialization needs the json extension registered.
  try {
    await db.runQuery(controlConnId, "LOAD json");
  } catch {
    try {
      await db.runQuery(controlConnId, "INSTALL json; LOAD json");
    } catch {
      /* json unavailable — JSON results will surface a friendly note */
    }
  }

  const version = await db.getVersion();
  return { db, version, controlConnId };
}

const extensionLoads = new Map<string, Promise<{ ok: boolean; error?: string }>>();

/** Install + load an extension once, engine-wide. Subsequent calls for the same
 *  name return the cached result. Extension functions become visible to every
 *  session (connection) on the engine. */
export function ensureExtension(
  name: string,
  source: string,
): Promise<{ ok: boolean; error?: string }> {
  let pending = extensionLoads.get(name);
  if (!pending) {
    pending = (async () => {
      const { db, controlConnId } = await ensureEngine();
      try {
        await db.runQuery(controlConnId, `INSTALL ${name} ${installFromClause(source)}`);
        await db.runQuery(controlConnId, `LOAD ${name}`);
        return { ok: true };
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e);
        return { ok: false, error };
      }
    })();
    extensionLoads.set(name, pending);
  }
  return pending;
}

/** Split a SQL snippet into individual statements on top-level semicolons,
 *  ignoring semicolons inside single/double-quoted strings and line comments.
 *  Shared by every consumer that runs a multi-statement example verbatim
 *  (the terminal shell, the map example) rather than each re-implementing it. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: string | null = null;
  let lineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      buf += c;
      if (c === "\n") lineComment = false;
      continue;
    }
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "-" && next === "-") {
      lineComment = true;
      buf += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      buf += c;
      continue;
    }
    if (c === ";") {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/** True if a split fragment is only SQL comments / whitespace — e.g. a trailing
 *  explanatory line after an example's last statement. Nothing to run. */
export function isCommentOnly(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  return stripped === "";
}

export interface Session {
  runQuery: (sql: string) => Promise<QueryResult>;
}

/** `ATTACH ... AS <alias>` registers the alias in the engine's catalog
 *  namespace, which is global — not scoped to the connection/session that
 *  issued it. So two independent example shells that both attach under the
 *  same alias (two tabs on the same worker, or the same example reopened,
 *  since nothing DETACHes on close) fail with "database with name already
 *  exists" even though each has its own private session. */
function attachAliasOf(sql: string): string | null {
  const m = /^\s*ATTACH\b[\s\S]*?\bAS\s+["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i.exec(sql);
  return m ? m[1] : null;
}

let sessionCounter = 0;

/** Open an isolated session: its own connection bound to a private in-memory
 *  database (`ATTACH ':memory:'` + `USE`), so DDL/state in one example shell
 *  does not bleed into another. Shares the engine and its loaded extensions. */
export async function createSession(): Promise<Session> {
  const { db } = await ensureEngine();
  const conn = await db.connect();
  const connId = conn.useUnsafe((_db: unknown, id: number) => id);
  const sandbox = `sandbox_${++sessionCounter}`;
  try {
    await db.runQuery(connId, `ATTACH ':memory:' AS ${sandbox}`);
    await db.runQuery(connId, `USE ${sandbox}`);
  } catch {
    /* fall back to the shared default catalog if ATTACH/USE is unavailable */
  }

  return {
    async runQuery(sql: string): Promise<QueryResult> {
      try {
        // Best-effort: free up the alias first so re-running an ATTACH (a
        // different tab reusing it, or the same example run twice) is
        // idempotent rather than a hard error. No-op, silently, if nothing
        // was attached under that name yet.
        const alias = attachAliasOf(sql);
        if (alias) {
          try {
            await db.runQuery(connId, `DETACH ${alias}`);
          } catch {
            /* wasn't attached — nothing to free */
          }
        }
        const bytes = await db.runQuery(connId, sql);
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        return { ok: true, buffer: ab };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
