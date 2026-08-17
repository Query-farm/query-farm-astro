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
  cellWidth,
  type TerminalOutput,
} from "../../lib/repl/shell-table-renderer";
import {
  ensureEngine,
  ensureExtension,
  createSession,
  splitStatements,
  isCommentOnly,
  type Session,
  type QueryResult,
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

/**
 * Terminal palette — Strata Sun.
 *
 * The shell sits on rock-900 `#1a1512`, the same ground every static code block
 * uses, and the ANSI slots mirror the Shiki `farmTheme` in astro.config.mjs so a
 * rendered code block and a live result read as one system:
 *
 *   slot          hex        role                       contrast on #1a1512
 *   foreground    #e9e1d3    default text               14.0:1
 *   red    (31)   #e2725b    errors (warm terracotta)    5.9:1
 *   green  (32)   #9fc48c    strings / success           9.2:1
 *   yellow (33)   #d9a441    sun-400 — keywords, prompt  8.0:1
 *   blue   (34)   #8fc7d8    identifiers / column names  9.7:1
 *   magenta(35)   #d3a6e0    functions                   8.9:1
 *   brBlack(90)   #8a7f70    chrome: rules, types, meta  4.6:1  (AA)
 *   brYellow(93)  #e0a44f    numerics                    8.3:1
 *
 * The prototype's chrome value `#6d6357` measures 3.1:1 on this ground — fine
 * for a hairline, below AA for glyphs — so no terminal text uses it: rules are
 * rock-800 `#2a2420` and dim text is `#8a7f70`, the lightest value that still
 * reads as chrome while clearing 4.5:1.
 */
const TERM_THEME = {
  background: "#1a1512", // rock-900 — the code ground, always
  foreground: "#e9e1d3",
  cursor: "#d9a441", // sun-400
  cursorAccent: "#1a1512",
  selectionBackground: "rgba(217, 164, 65, 0.28)",

  black: "#1a1512",
  red: "#e2725b",
  green: "#9fc48c",
  yellow: "#d9a441",
  blue: "#8fc7d8",
  magenta: "#d3a6e0",
  cyan: "#7fb8c9",
  white: "#e9e1d3",

  brightBlack: "#8a7f70",
  brightRed: "#f0917c",
  brightGreen: "#b4d4a2",
  brightYellow: "#e0a44f",
  brightBlue: "#a8d8e4",
  brightMagenta: "#e3bfec",
  brightCyan: "#9fd3e0",
  brightWhite: "#f4ece0", // cream
};

const SHELL_STYLE_ID = "example-shell-surface-style";

/**
 * Surface chrome for the shell panel. Injected once; kept here (rather than in
 * global.css) so the island stays self-contained. Colours are the Strata Sun
 * tokens: rock-900 ground, rock-800 rules, sun-400 accent, JetBrains Mono.
 */
const SHELL_STYLE = `
.example-shell {
  background: #1a1512;
  border: 1px solid #2a2420;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 12px 28px -20px rgba(16, 13, 10, 0.75);
  /* Rises into place rather than popping in — the same lift language
     .hover:-translate-y-1 cards use site-wide, just entrance rather than
     hover. Runs once per mount; the shell isn't re-created on re-render. */
  animation: example-shell-in 260ms cubic-bezier(.2, .8, .3, 1);
}
/* .panel-head, on the dark side: mono, uppercase, tracked out, small. */
.example-shell-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 9px 14px;
  background: #100d0a;
  border-bottom: 1px solid #2a2420;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: #c6b8a2;
}
.example-shell-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #7a9a54;
  box-shadow: 0 0 6px rgba(122, 154, 84, 0.65);
  animation: example-shell-breathe 2.4s ease-in-out infinite;
}
.example-shell-booting { color: #8a7f70; }
.example-shell-close {
  margin-left: auto;
  font: inherit;
  line-height: 1;
  color: #8a7f70;
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 3px 6px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease;
}
.example-shell-close:hover { color: #d9a441; border-color: #2a2420; }
.example-shell-close:focus-visible { outline: 2px solid #d9a441; outline-offset: 1px; }
.example-shell-error {
  padding: 22px 18px;
  text-align: center;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
}
.example-shell-error p { font-size: 13px; color: #e2725b; }
.example-shell-error p + p { margin-top: 8px; font-size: 11.5px; color: #8a7f70; word-break: break-word; }
/* Was 300px — roughly 17 lines at this font/line-height, which a single
   query with its echoed statement, a box-drawn result table, and a fresh
   prompt can just barely exceed. Tall enough now for a typical example to
   sit fully visible without scrolling; still bounded and scrollable (real
   terminals scroll too) for anything that genuinely runs long. */
.example-shell-term { height: 460px; padding: 0.5rem 0.75rem; }
/* Terminal figures are monospaced by construction, so numeric columns line up;
   this just keeps any UA fallback font from substituting oldstyle figures. */
.example-shell .xterm { font-variant-numeric: tabular-nums lining-nums; }
.example-shell .xterm-viewport { scrollbar-width: thin; scrollbar-color: #2a2420 transparent; }
.example-shell .xterm-viewport::-webkit-scrollbar { width: 9px; }
.example-shell .xterm-viewport::-webkit-scrollbar-thumb { background: #2a2420; border-radius: 999px; }
@keyframes example-shell-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes example-shell-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .example-shell-dot { animation: none; }
  .example-shell { animation: none; }
}
`;

function ensureShellStyle(): void {
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = SHELL_STYLE_ID;
  tag.textContent = SHELL_STYLE;
  document.head.appendChild(tag);
}

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

/** The shell prompt: sun-400 mark, chrome caret. Shared by the live prompt and
 *  the echoed lines of the auto-run example so they read as the same stream. */
const PROMPT = "\x1b[33mH\x1b[0m\x1b[90m >\x1b[0m ";

const fmtMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

/** Braille spinner frames for the "still running" indicator below. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
  opts: { seedSql?: string; extError?: string; fixtures?: string; extensionName?: string },
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
    if (echo) writeln(`${PROMPT}\x1b[90m${sql};\x1b[0m`);
    const t0 = performance.now();

    // A remote/RPC-backed query (a worker call, a spatial join over a fetched
    // S3 parquet release) can run for several seconds with nothing else on
    // screen — indistinguishable from hung. There's no real percentage to
    // show (DuckDB can't estimate progress through a VGI RPC call or a
    // network scan it doesn't control), so this is a spinner + elapsed time,
    // not a progress bar — the honest version of "still working". It only
    // appears once a statement has been running a bit, so ordinary fast
    // queries never see it.
    let spinnerShown = false;
    let frame = 0;
    const tick = () => {
      spinnerShown = true;
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      rl.write(`\r\x1b[2K\x1b[90m${SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length]} running… ${secs}s\x1b[0m`);
    };
    const spinnerDelay = setTimeout(tick, 400);
    const spinnerInterval = setInterval(tick, 90);

    let r: QueryResult;
    try {
      r = await session.runQuery(sql);
    } finally {
      clearTimeout(spinnerDelay);
      clearInterval(spinnerInterval);
      if (spinnerShown) rl.write(`\r\x1b[2K`);
    }
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
        rl.println(`\x1b[90m${sql}\x1b[0m`);
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
          if (key) rl.println(`\x1b[1;34m${key}\x1b[0m`);
          for (const ln of val.split("\n")) rl.println(`\x1b[90m${ln}\x1b[0m`);
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
        writeln("Commands:", "1;34");
        writeln("  .mode box|line     output format (current: " + outputMode + ")");
        writeln("  .maxrows N         max rows to display (current: " + maxDisplayRows + ")");
        writeln("  .clear             clear the screen");
        writeln("  .help              this message");
        writeln("Anything else is run as SQL.");
        return true;
      case "mode":
        if (rest[0] === "box" || rest[0] === "line") {
          outputMode = rest[0];
          writeln(`output mode: ${outputMode}`, "90");
        } else {
          writeln("usage: .mode box|line", "31");
        }
        return true;
      case "maxrows": {
        const n = parseInt(rest[0], 10);
        if (Number.isFinite(n) && n > 0) {
          maxDisplayRows = n;
          writeln(`max display rows: ${maxDisplayRows}`, "90");
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

  // Auto-run the seeded example. Drop only INSTALL/LOAD for the page's own
  // extension — it's already loaded engine-wide by ensureExtension(), so
  // showing/running it again would be ceremony. An example that also needs a
  // second, unrelated extension (e.g. `LOAD spatial;` for a geometry join)
  // is NOT stripped — nothing has loaded that one, and it's genuinely part
  // of what the example needs, not boilerplate to skip past.
  if (opts.seedSql) {
    const primary = opts.extensionName?.toLowerCase();
    const stmts = splitStatements(opts.seedSql).filter((s) => {
      if (isCommentOnly(s)) return false;
      const m = /^\s*(INSTALL|LOAD)\s+["']?([A-Za-z_][A-Za-z0-9_]*)/i.exec(s);
      if (!m) return true; // not an INSTALL/LOAD statement
      // No known primary extension name: fall back to the old blanket drop.
      if (!primary) return false;
      return m[2].toLowerCase() !== primary;
    });
    for (const stmt of stmts) {
      // ATTACH still has to run — the query below depends on the catalog it
      // creates — but it's setup the reader already sees in the code sample
      // above, not something they typed. Echoing it back would just be a
      // second copy of the same line between the sample and the actual
      // result, so it runs quietly and the terminal goes straight to the
      // part the reader is here for.
      if (/^\s*ATTACH\b/i.test(stmt)) {
        await session.runQuery(stmt);
        continue;
      }
      await exec(stmt, true);
      // Seed the readline history so the user can press ↑ to recall and edit
      // the example, just as if they had typed it.
      rl.appendHistory(stmt);
      rl.println("");
    }
  }

  for (;;) {
    const sql = (await rl.read(PROMPT)).trim();
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
    ensureShellStyle();
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
          lineHeight: 1.35,
          fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
          theme: TERM_THEME,
          // Render every SGR colour exactly as themed. With the default (true),
          // bold + a basic colour silently promotes to the bright slot, which
          // would pull bold column headers off the identifier blue.
          drawBoldTextInBrightColors: false,
          allowProposedApi: true,
        });
        const fit = new FA.FitAddon();
        const rl = new Readline();
        term.loadAddon(fit);
        term.loadAddon(new WLA.WebLinksAddon());
        // Register our string-width-matching provider before any output so the
        // result box (laid out by cli-table3) and xterm agree on cell widths
        // for emoji/wide chars; otherwise the box border misaligns.
        try {
          term.unicode.register({ version: "farm", wcwidth: cellWidth });
          term.unicode.activeVersion = "farm";
        } catch {
          /* fall back to the default unicode provider */
        }
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
          "\x1b[90mBooting Haybarn (DuckDB) WebAssembly… (first load can take a few seconds)\x1b[0m",
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
            extensionName,
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
    <div className="example-shell mt-2">
      {/* .panel-head, dark side: mono / uppercase / tracked, on rock-950. */}
      <div className="example-shell-head">
        {/* Live-status dot — field-400, the one cool note in the palette. */}
        <span className="example-shell-dot" aria-hidden="true" />
        <span>Haybarn shell · {extensionName}</span>
        {status === "loading" && <span className="example-shell-booting">· booting…</span>}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shell"
            className="example-shell-close"
          >
            ✕
          </button>
        )}
      </div>

      {status === "error" ? (
        <div className="example-shell-error">
          <p>Failed to start the shell.</p>
          {errorMsg && <p>{errorMsg}</p>}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={status !== "error" ? "example-shell-term block" : "example-shell-term hidden"}
      />
    </div>
  );
}
