/**
 * Per-example in-browser DuckDB shell.
 *
 * Mounted on demand beneath a SQL example when the user clicks "Try" (see
 * scripts/example-shells.ts). Each instance:
 *   - shares the one Haybarn-Wasm engine (booted once across the whole page),
 *   - installs/loads the extension once, engine-wide,
 *   - runs in its own isolated session (private in-memory database), so state
 *     never leaks between examples,
 *   - auto-runs the example it was seeded with, then stays interactive.
 *
 * xterm.js + addons load from jsDelivr (kept out of the bundle). Scope is the
 * "core terminal": query editor + Arrow result rendering + a few dot-commands.
 */
import { useEffect, useRef, useState } from "react";
import {
  printBoxTable,
  printLineTable,
  type TerminalOutput,
} from "../../lib/repl/shell-table-renderer";
import {
  ensureEngine,
  ensureExtension,
  createSession,
  type Session,
} from "../../lib/repl/duckdb-boot";

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
  // Distinct from the static example blocks' green gradient: a darker, flatter
  // "device screen" with an amber cursor — the live shell reads as its own
  // interactive surface (see header chrome below).
  background: "#0f1714",
  foreground: "#e8f5e9",
  cursor: "#fbbf24",
  selectionBackground: "rgba(251, 191, 36, 0.30)",
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

/** True if a split fragment is only SQL comments / whitespace — e.g. a trailing
 *  explanatory line after the example's last statement. Nothing to run. */
function isCommentOnly(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  return stripped === "";
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
  session: Session;
  tableFromIPC: (buf: ArrayBuffer) => any;
}

/** Run the interactive read-eval-print loop on an isolated session. Auto-runs
 *  the seeded example first, then loops on user input until the terminal is
 *  disposed (which rejects the pending rl.read()). */
async function runRepl(
  deps: ReplDeps,
  opts: { seedSql?: string; extError?: string; fixtures?: string },
): Promise<void> {
  const { term, rl, session, tableFromIPC } = deps;
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
    if (echo) writeln(`\x1b[32mH\x1b[0m > \x1b[2m${sql};\x1b[0m`);
    const t0 = performance.now();
    const r = await session.runQuery(sql);
    const elapsed = performance.now() - t0;
    if (!r.ok) {
      const { message, position } = parseError(r.error || "unknown");
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
        writeln("Anything else is run as SQL.");
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

  if (opts.extError) {
    writeln(`Note: ${opts.extError}`, "33");
    rl.println("");
  }

  // Seed sample tables the examples query (e.g. `contacts`). Run silently in
  // this session before the example — no announcement; just make them exist.
  if (opts.fixtures) {
    const fixtureStmts = splitStatements(opts.fixtures).filter((s) => !isCommentOnly(s));
    for (const stmt of fixtureStmts) {
      await session.runQuery(stmt);
    }
  }

  // Auto-run the seeded example. Skip any leading INSTALL/LOAD — the extension
  // is already loaded engine-wide by ensureExtension().
  if (opts.seedSql) {
    const stmts = splitStatements(opts.seedSql).filter(
      // Drop INSTALL/LOAD (already done engine-wide) and comment-only fragments
      // such as a trailing explanatory line after the example's last statement.
      (s) => !/^\s*(INSTALL|LOAD)\s/i.test(s) && !isCommentOnly(s),
    );
    for (const stmt of stmts) {
      await exec(stmt, true);
      // Seed the readline history so the user can press ↑ to recall and edit
      // the example, just as if they had typed it.
      rl.appendHistory(stmt);
      rl.println("");
    }
  }

  for (;;) {
    const sql = (await rl.read("\x1b[32mH\x1b[0m > ")).trim();
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
  /** The example SQL this shell was opened from; auto-run on start. */
  sql: string;
  /** Raw check-fixtures.sql, run silently at session start so examples that
   *  reference sample tables (e.g. `contacts`) resolve. Null when none exist. */
  fixtures?: string | null;
  /** Called when the user closes the shell (host unmounts + removes it). */
  onClose?: () => void;
}

export default function ExampleShell({ extensionName, installSource, sql, fixtures, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
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

        // Transient boot line (no trailing newline) — erased once ready below,
        // so it doesn't linger above the example output.
        rl.write(
          "\x1b[2mBooting Haybarn (DuckDB) WebAssembly… (first load can take a few seconds)\x1b[0m",
        );
        await ensureEngine();
        if (disposed) return;

        // Load the extension once, engine-wide; open an isolated session.
        const [ext, session] = await Promise.all([
          ensureExtension(extensionName, installSource),
          createSession(),
        ]);
        if (disposed) return;

        setStatus("ready");
        // Clear the booting line (carriage return + erase line) now that the
        // engine, extension, and session are ready.
        rl.write("\r\x1b[2K");

        await runRepl(
          { term, rl, session, tableFromIPC },
          {
            seedSql: sql,
            fixtures: ext.ok ? fixtures ?? undefined : undefined,
            extError: ext.ok
              ? undefined
              : `${extensionName} may not have a WebAssembly build yet — the SQL below may not run in-browser.`,
          },
        );
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
  }, [extensionName, installSource, sql, fixtures]);

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden"
      style={{
        background: "#0f1714",
        border: "1.5px solid rgba(251, 191, 36, 0.45)",
        boxShadow:
          "0 0 0 1px rgba(245, 158, 11, 0.15), 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 20px rgba(251, 191, 36, 0.08)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-[#fbbf24]/20"
        style={{ background: "#1a1410" }}
      >
        <div className="flex items-center gap-2 text-[#fcd34d] text-xs font-mono">
          {/* Live-status dot (green = online), replacing the OS-specific
              traffic-light chrome; amber elsewhere signals the live surface. */}
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#4ade80", boxShadow: "0 0 6px rgba(74, 222, 128, 0.7)" }}
            aria-hidden="true"
          />
          <span>Haybarn shell · {extensionName}</span>
          {status === "loading" && (
            <span className="text-[#fcd34d]/60 animate-pulse">· booting…</span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shell"
            className="text-[#fbbf24] hover:text-[#fcd34d] text-xs font-mono px-1.5 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {status === "error" ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[#fca5a5] text-sm font-mono">Failed to start the shell.</p>
          {errorMsg && (
            <p className="mt-2 text-[#86efac]/60 text-xs font-mono break-words">{errorMsg}</p>
          )}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={status !== "error" ? "block" : "hidden"}
        style={{ height: "300px", padding: "0.5rem 0.75rem" }}
      />
    </div>
  );
}
