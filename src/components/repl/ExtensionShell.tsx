/**
 * In-browser DuckDB REPL for extension pages.
 *
 * Runs Haybarn-Wasm (DuckDB) entirely in the browser — no link-out to an
 * external shell. xterm.js + addons are loaded from jsDelivr (kept out of the
 * bundle); the engine is booted lazily on first launch so pages stay light.
 *
 * Scope is deliberately the "core terminal": query editor + Arrow result
 * rendering + a handful of dot-commands. No AI mode, perspective, or map.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  printBoxTable,
  printLineTable,
  type TerminalOutput,
} from "../../lib/repl/shell-table-renderer";
import { ensureDuckDB, type DuckDBHandle } from "../../lib/repl/duckdb-boot";

// xterm and its addons are classic <script> globals (no ESM build we want to
// bundle). apache-arrow and xterm-readline load as ESM. Versions match the
// proven set used by the VGI web shell.
const CDN_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js",
  "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js",
  "https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js",
  "https://cdn.jsdelivr.net/npm/xterm-addon-webgl@0.16.0/lib/xterm-addon-webgl.min.js",
];
const CDN_CSS = "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css";
const ARROW_CDN = "https://cdn.jsdelivr.net/npm/apache-arrow@18.1.0/+esm";
const READLINE_CDN = "https://cdn.jsdelivr.net/npm/xterm-readline@1.1.2/+esm";

const TERM_THEME = {
  background: "#0d2818",
  foreground: "#e8f5e9",
  cursor: "#66bb6a",
  selectionBackground: "rgba(102, 187, 106, 0.35)",
};

let scriptsLoading: Promise<void> | null = null;

/** Load xterm CSS + classic scripts once (idempotent across shell instances). */
function loadScripts(): Promise<void> {
  if (scriptsLoading) return scriptsLoading;
  scriptsLoading = (async () => {
    if (!document.querySelector(`link[href="${CDN_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CDN_CSS;
      document.head.appendChild(link);
    }
    for (const src of CDN_SCRIPTS) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    }
  })();
  return scriptsLoading;
}

/** Build the `INSTALL <name> FROM ...` clause from the extension's install source. */
function installFromClause(source: string): string {
  if (source === "community") return "FROM community";
  if (source.toLowerCase().startsWith("from ")) return source;
  return `FROM '${source}'`;
}

/** Split a SQL snippet into individual statements on top-level semicolons,
 *  ignoring semicolons inside single/double-quoted strings and line comments. */
function splitStatements(sql: string): string[] {
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

/** Parse a DuckDB error string into a message + optional 1-based position. */
function parseError(err: string): { message: string; position: number } {
  try {
    const parsed = JSON.parse(err);
    if (parsed.exception_message) {
      return {
        message: parsed.exception_message,
        position: parsed.position ? parseInt(parsed.position, 10) : -1,
      };
    }
  } catch {
    /* not JSON */
  }
  return { message: err, position: -1 };
}

const fmtMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

interface ReplDeps {
  term: any;
  rl: any;
  db: DuckDBHandle;
  tableFromIPC: (buf: ArrayBuffer) => any;
}

/** Run the interactive read-eval-print loop. Never resolves (loops forever)
 *  until the terminal is disposed, which rejects the pending rl.read(). */
async function runRepl(
  deps: ReplDeps,
  opts: { extensionName: string; installSource: string; initialSql?: string },
): Promise<void> {
  const { term, rl, db, tableFromIPC } = deps;
  let maxDisplayRows = 40;
  let outputMode: "box" | "line" = "box";

  const out: TerminalOutput = {
    get cols() {
      return term.cols || 80;
    },
    println: (line: string) => rl.println(line),
  };
  const writeln = (msg: string, color?: string) =>
    rl.println(color ? `\x1b[${color}m${msg}\x1b[0m` : msg);

  /** Execute one statement and render its result. Returns false on error. */
  async function exec(sql: string, echo = false): Promise<boolean> {
    if (echo) writeln(`\x1b[32mD\x1b[0m > \x1b[2m${sql};\x1b[0m`);
    const t0 = performance.now();
    const r = await db.runQuery(sql);
    const elapsed = performance.now() - t0;
    if (!r.ok) {
      const { message, position } = parseError(r.error || "unknown");
      // Some extension functions hit an internal error when executed in this
      // wasm build (surfaces as an opaque "... is not a function" from the
      // engine worker). It's engine-side, not a query mistake — translate it.
      if (/is not a function/.test(message)) {
        writeln(
          "This hit an internal error in the in-browser engine — this " +
            "extension's function may not be fully WebAssembly-compatible yet. " +
            "It should work in the native (CLI/Python) engine.",
          "33",
        );
        return false;
      }
      writeln(`Error: ${message}`, "31");
      if (position >= 0) {
        rl.println(`\x1b[2m${sql}\x1b[0m`);
        rl.println(`\x1b[31m${" ".repeat(Math.max(0, position - 1))}^\x1b[0m`);
      }
      return false;
    }
    if (!r.buffer) {
      writeln("OK", "32");
      return true;
    }
    try {
      const table = tableFromIPC(r.buffer);
      const names = table.schema.fields.map((f: any) => f.name);
      // DDL (CREATE/DROP/...) returns a single "Count" column — just show OK.
      if (names.length === 1 && names[0] === "Count" && table.numRows <= 1) {
        writeln(`OK (${fmtMs(elapsed)})`, "32");
      } else if (
        names.includes("explain_key") &&
        names.includes("explain_value")
      ) {
        const ki = names.indexOf("explain_key");
        const vi = names.indexOf("explain_value");
        for (let row = 0; row < table.numRows; row++) {
          const key = String(table.getChildAt(ki)?.get(row) ?? "");
          const val = String(table.getChildAt(vi)?.get(row) ?? "");
          if (key) rl.println(`\x1b[1m${key}\x1b[0m`);
          for (const ln of val.split("\n")) rl.println(`\x1b[2m${ln}\x1b[0m`);
        }
      } else if (outputMode === "line") {
        printLineTable(table, out, maxDisplayRows, elapsed);
      } else {
        await printBoxTable(table, out, maxDisplayRows, elapsed);
      }
    } catch (e: any) {
      writeln(`Failed to render result: ${e?.message ?? e}`, "31");
      return false;
    }
    return true;
  }

  /** Minimal dot-command set. Returns true if the input was a dot-command. */
  function handleDot(input: string): boolean {
    const [cmd, ...rest] = input.slice(1).trim().split(/\s+/);
    switch (cmd) {
      case "help":
        writeln("Commands:", "1");
        writeln("  .mode box|line     output format (current: " + outputMode + ")");
        writeln("  .maxrows N         max rows to display (current: " + maxDisplayRows + ")");
        writeln("  .clear             clear the screen");
        writeln("  .help              this message");
        writeln("Anything else is run as SQL. Try: SELECT 'hello' AS greeting;");
        return true;
      case "mode":
        if (rest[0] === "box" || rest[0] === "line") {
          outputMode = rest[0];
          writeln(`output mode: ${outputMode}`, "2");
        } else {
          writeln("usage: .mode box|line", "31");
        }
        return true;
      case "maxrows": {
        const n = parseInt(rest[0], 10);
        if (Number.isFinite(n) && n > 0) {
          maxDisplayRows = n;
          writeln(`max display rows: ${maxDisplayRows}`, "2");
        } else {
          writeln("usage: .maxrows N", "31");
        }
        return true;
      }
      case "clear":
        term.clear();
        return true;
      default:
        writeln(`unknown command: .${cmd} (try .help)`, "31");
        return true;
    }
  }

  /** Run a setup statement quietly: echo it, but report a one-line status
   *  rather than rendering its (boolean "Success") result table. */
  async function runSetup(sql: string): Promise<boolean> {
    writeln(`\x1b[32mD\x1b[0m > \x1b[2m${sql};\x1b[0m`);
    const r = await db.runQuery(sql);
    if (!r.ok) {
      writeln(`  ✗ ${parseError(r.error || "unknown").message}`, "31");
      return false;
    }
    writeln("  ✓ ok", "32");
    return true;
  }

  // Install + load the extension explicitly from the Haybarn community channel
  // so the shell is ready for the extension's own SQL.
  const fromClause = installFromClause(opts.installSource);
  const installOk = await runSetup(`INSTALL ${opts.extensionName} ${fromClause}`);
  const loadOk = installOk && (await runSetup(`LOAD ${opts.extensionName}`));
  if (!installOk || !loadOk) {
    writeln(
      `Note: ${opts.extensionName} may not have a WebAssembly build yet — ` +
        `the SQL below may not work in-browser.`,
      "33",
    );
  }
  rl.println("");

  // Auto-run the quick-start snippet as a live demo, then hand off to the user.
  if (opts.initialSql) {
    for (const stmt of splitStatements(opts.initialSql)) {
      // Skip a redundant INSTALL/LOAD already handled above.
      if (/^\s*(INSTALL|LOAD)\s/i.test(stmt)) continue;
      await exec(stmt, true);
      rl.println("");
    }
  }

  writeln("Ready. Type SQL and press Enter — or .help for commands.", "2");

  // Interactive loop.
  for (;;) {
    const sql = (await rl.read("\x1b[32mD\x1b[0m > ")).trim();
    if (!sql) {
      if (rl.history?.length) rl.history.pop();
      continue;
    }
    if (sql.startsWith(".")) {
      if (handleDot(sql)) continue;
    }
    await exec(sql);
  }
}

interface Props {
  extensionName: string;
  installSource: string;
  /** Quick-start SQL snippet auto-run after INSTALL/LOAD. */
  initialSql?: string;
}

export default function ExtensionShell({ extensionName, installSource, initialSql }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [launched, setLaunched] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  const launch = useCallback(() => setLaunched(true), []);

  useEffect(() => {
    if (!launched || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        setStatus("loading");
        await loadScripts();
        const [arrowModule, readlineModule] = await Promise.all([
          import(/* @vite-ignore */ ARROW_CDN),
          import(/* @vite-ignore */ READLINE_CDN),
        ]);
        if (disposed || !containerRef.current) return;

        // RecordBatchFileReader populates dictionary batches that the plain
        // tableFromIPC() helper misses for File-format IPC buffers.
        const {
          tableFromIPC: origTableFromIPC,
          RecordBatchFileReader,
          Table: ArrowTable,
        } = arrowModule as any;
        const tableFromIPC = (buf: ArrayBuffer) => {
          try {
            const reader = RecordBatchFileReader.from(new Uint8Array(buf));
            const batches = [...reader];
            if (batches.length === 0) return origTableFromIPC(buf);
            return new ArrowTable(batches);
          } catch {
            return origTableFromIPC(buf);
          }
        };
        const Readline = (readlineModule as any).Readline;

        const T = (window as any).Terminal;
        const FA = (window as any).FitAddon;
        const WLA = (window as any).WebLinksAddon;
        const WGA = (window as any).WebglAddon;

        const term = new T({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
          theme: TERM_THEME,
          allowProposedApi: true,
        });
        const fit = new FA.FitAddon();
        const rl = new Readline();
        term.loadAddon(fit);
        term.loadAddon(new WLA.WebLinksAddon());
        term.loadAddon(rl);
        term.open(containerRef.current);
        try {
          term.loadAddon(new WGA.WebglAddon());
        } catch {
          /* canvas fallback */
        }

        // Batch writes within a microtask so xterm-readline's clear+redraw
        // pair renders in a single frame (prevents prompt flicker).
        const origWrite = term.write.bind(term);
        let writeBuf = "";
        let flushScheduled = false;
        term.write = (data: any) => {
          writeBuf += data;
          if (!flushScheduled) {
            flushScheduled = true;
            queueMicrotask(() => {
              origWrite(writeBuf);
              writeBuf = "";
              flushScheduled = false;
            });
          }
        };

        const safeFit = () => {
          try {
            if (containerRef.current && containerRef.current.offsetWidth > 0) fit.fit();
          } catch {
            /* ignore */
          }
        };
        const ro = new ResizeObserver(safeFit);
        if (containerRef.current) ro.observe(containerRef.current);
        safeFit();
        requestAnimationFrame(safeFit);

        cleanup = () => {
          ro.disconnect();
          try {
            term.dispose();
          } catch {
            /* ignore */
          }
        };

        rl.println("\x1b[2mBooting Haybarn (DuckDB) WebAssembly…\x1b[0m");
        const db = await ensureDuckDB();
        if (disposed) return;
        setStatus("ready");
        rl.println(
          `\x1b[2mHaybarn ${db.version} — running in your browser, single-threaded.\x1b[0m`,
        );
        rl.println("");

        await runRepl({ term, rl, db, tableFromIPC }, {
          extensionName,
          installSource,
          initialSql,
        });
      } catch (e: unknown) {
        if (disposed) return;
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [launched, extensionName, installSource, initialSql]);

  return (
    <div className="rounded-lg border border-soil-700/40 bg-[#0d2818] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-soil-700/40 bg-[#0a1f12]">
        <div className="flex items-center gap-2 text-[#86efac] text-sm font-mono">
          <span className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/70" />
          </span>
          <span className="ml-2">Haybarn shell</span>
          {status === "ready" && (
            <span className="text-[#86efac]/60">· {extensionName}</span>
          )}
        </div>
        {status === "loading" && (
          <span className="text-[#86efac]/70 text-xs font-mono animate-pulse">
            loading…
          </span>
        )}
      </div>

      {!launched ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[#c8e6c9] text-sm mb-1">
            Run <span className="font-mono">{extensionName}</span> right here, in your browser.
          </p>
          <p className="text-[#86efac]/60 text-xs mb-5">
            Powered by Haybarn-Wasm — nothing leaves your machine. Downloads ~30&nbsp;MB on first launch.
          </p>
          <button
            type="button"
            onClick={launch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1b4d2e] text-[#dcfce7] text-sm font-medium border border-[#66bb6a]/40 hover:bg-[#236339] hover:border-[#66bb6a]/70 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Launch in-browser shell
          </button>
        </div>
      ) : status === "error" ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[#fca5a5] text-sm font-mono">Failed to start the shell.</p>
          {errorMsg && (
            <p className="mt-2 text-[#86efac]/60 text-xs font-mono break-words">{errorMsg}</p>
          )}
        </div>
      ) : null}

      {/* Terminal host — kept mounted whenever launched. */}
      <div
        ref={containerRef}
        className={launched && status !== "error" ? "block" : "hidden"}
        style={{ height: "420px", padding: "0.5rem 0.75rem" }}
      />
    </div>
  );
}
