// Boot Haybarn-Wasm (a derived distribution of DuckDB-Wasm) on the page.
//
// Slimmed for query.farm's static site: no SharedArrayBuffer cancel channel and
// no OAuth bridge (both require cross-origin isolation, which we deliberately do
// not enable). The single-threaded `base` bundle requires WebAssembly exception
// handling. Haybarn 2.0 no longer publishes the legacy `mvp` bundle.
//
// The wasm binary and worker script use the shared, version-pinned CDN bundle
// configuration. createHaybarnWorker() fetches the cross-origin
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
import { haybarnBundles } from './haybarn-bundles';
import { createHaybarnWorker } from './haybarn-worker';
import { namesToPrefetch, type ExtensionRef } from './extension-scan';

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
 *  control connection is open. Safe to await from many shells on one page.
 *  The first caller can name the extensions it's about to load, so they're
 *  downloaded in parallel with the one the boot itself needs. */
export function ensureEngine(extensions: ExtensionRef[] = []): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = boot(extensions).catch((e) => {
      enginePromise = null; // allow retry after a failed boot
      throw e;
    });
  }
  return enginePromise;
}

async function boot(extensions: ExtensionRef[]): Promise<Engine> {
  const bundle = await duckdb.selectBundle(haybarnBundles);
  const worker = await createHaybarnWorker(bundle.mainWorker!);
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

  await prefetchExtensions(db, controlConnId, [{ name: "json" }, ...extensions]);

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
// Extensions load one at a time: requests sent during a prefetch wait for it,
// and a second prefetch sent while they wait can run them out of order.
let extensionQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = extensionQueue.then(task);
  extensionQueue = run;
  return run;
}

/** Install + load an extension once, engine-wide. Subsequent calls for the same
 *  name return the cached result. Extension functions become visible to every
 *  session (connection) on the engine. `alsoNeeded` names extensions the caller
 *  will load itself afterward; they're only prefetched here. */
export function ensureExtension(
  name: string,
  source: string,
  alsoNeeded: ExtensionRef[] = [],
): Promise<{ ok: boolean; error?: string }> {
  let pending = extensionLoads.get(name);
  if (!pending) {
    pending = enqueue(async () => {
      const { db, controlConnId } = await ensureEngine();
      try {
        // INSTALL downloads nothing in the browser, but its `FROM` sets the
        // repository LOAD's URL is built from, so it must precede the prefetch.
        await db.runQuery(controlConnId, `INSTALL ${name} ${installFromClause(source)}`);
        await prefetchExtensions(db, controlConnId, [{ name }, ...alsoNeeded]);
        await db.runQuery(controlConnId, `LOAD ${name}`);
        return { ok: true };
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e);
        return { ok: false, error };
      }
    });
    extensionLoads.set(name, pending);
  } else if (alsoNeeded.length) {
    // An earlier shell loaded this one, but this example needs more.
    const loaded = pending;
    return enqueue(async () => {
      const { db, controlConnId } = await ensureEngine();
      await prefetchExtensions(db, controlConnId, alsoNeeded);
    }).then(() => loaded);
  }
  return pending;
}

/** Download, hash (WebCrypto) and compile extensions in parallel in the worker,
 *  so each LOAD only checks the signature and links. A failed prefetch leaves
 *  the download to LOAD, which reports any real error. */
async function prefetchExtensions(
  db: duckdb.AsyncDuckDB,
  connId: number,
  extensions: ExtensionRef[],
): Promise<void> {
  try {
    for (const { name, source } of extensions) {
      // INSTALL downloads nothing in the browser, but its `FROM` sets the
      // repository the prefetch builds its URL from.
      if (source) await db.runQuery(connId, `INSTALL ${name} ${installFromClause(source)}`);
    }
    await db.prefetchExtensions(namesToPrefetch(extensions));
  } catch (error) {
    console.warn(`[repl] prefetch failed; LOAD will download the extensions`, error);
  }
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

// Tables belong to each example's private database, but the WASM filesystem
// belongs to the shared engine. Create immutable sample files once per page:
// overwriting an already-read file can fail or invalidate cached file handles.
// Only fixture COPY statements are shared; example SQL always executes.
const fixtureCopies = new Map<string, Promise<QueryResult>>();
export async function runFixtureStatement(session: Session, sql: string): Promise<QueryResult> {
  const statement = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  if (!/^COPY\b/i.test(statement)) return session.runQuery(sql);
  let pending = fixtureCopies.get(sql);
  if (!pending) {
    pending = session.runQuery(sql);
    fixtureCopies.set(sql, pending);
  }
  const result = await pending;
  if (!result.ok) fixtureCopies.delete(sql); // preserve errors and allow retry
  return result;
}

/** `ATTACH ... AS <alias>` registers the alias in the engine's catalog
 *  namespace, which is global — not scoped to the connection/session that
 *  issued it. So two independent example shells that both attach under the
 *  same alias (two tabs on the same worker, or the same example reopened,
 *  since nothing DETACHes on close) fail with "database with name already
 *  exists" even though each has its own private session. */
function attachAliasOf(sql: string): string | null {
  // Documentation often introduces ATTACH with a comment. Ignore that prefix
  // when identifying the alias, while executing the original statement.
  sql = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  // Some examples intentionally share a remote catalog. Honor DuckDB's
  // idempotent attach instead of detaching it under another running shell.
  if (/^\s*ATTACH\s+(?:DATABASE\s+)?IF\s+NOT\s+EXISTS\b/i.test(sql)) return null;
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
        // idempotent rather than a hard error.
        //
        // `IF EXISTS` matters even though the failure is caught here: a bare
        // `DETACH` on an alias that was never attached still *runs*, and
        // duckdb-wasm's ConsoleLogger prints the resulting binder error before
        // the promise rejects. Every first run therefore logged
        // `Failed to detach database with name "eq": database not found` to the
        // console — harmless, but indistinguishable from a real failure, and it
        // cost an afternoon of debugging exactly once.
        const alias = attachAliasOf(sql);
        if (alias) {
          try {
            await db.runQuery(connId, `DETACH DATABASE IF EXISTS ${alias}`);
          } catch {
            // Older engines have no `IF EXISTS` on DETACH. Fall back to the
            // bare form so the alias still gets freed (noisily) rather than
            // leaving a re-run to fail with "database already exists".
            try {
              await db.runQuery(connId, `DETACH ${alias}`);
            } catch {
              /* wasn't attached — nothing to free */
            }
          }
        }
        const bytes = await db.runQuery(connId, sql);
        const ab = Uint8Array.from(bytes).buffer;
        return { ok: true, buffer: ab };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
