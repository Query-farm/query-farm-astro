/**
 * A second, bespoke "WASM" button for the trains tab, sharing a row with
 * the terminal-based one — ExampleShellMounter's auto-injected button runs
 * the query once and shows a static result; this one keeps the same shared
 * engine session open and re-runs just the SELECT on an interval, so the
 * board updates itself the way a real station display does. Same reasoning
 * as OvertureMapExample.tsx for being its own component rather than a mode
 * bolted onto ExampleShellMounter: "inject a button, mount a terminal" and
 * "keep a live polling session open" are different enough machinery that
 * folding both into one generic mechanism would cost more than it saves for
 * what's still just two one-off examples. It still ends up sharing
 * ExampleShellMounter's own button row visually — see the effect below that
 * locates `.example-run-bar` and portals this component's button into it.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ensureEngine,
  ensureExtension,
  createSession,
  splitStatements,
  isCommentOnly,
  type Session,
} from "../../lib/repl/duckdb-boot";

const ARROW_CDN = "https://cdn.jsdelivr.net/npm/apache-arrow@18.1.0/+esm";

// The worker advertises a 30s freshness TTL on trip data (vgi-trains-ts
// CLAUDE.md: TRIP_CACHE_TTL_SECONDS) — VGI's client-side result cache serves
// repeats of the same query from that cache rather than re-fetching NS
// within the window. Refreshing every 20s means most refreshes land inside
// that window and can legitimately show identical data; it's not a bug,
// it's the cache doing what it advertises. Chosen a bit shorter than 30s
// so the board still visibly ticks over within a couple of refreshes.
const REFRESH_MS = 20_000;

const STYLE_ID = "live-train-board-style";

const STYLE = `
.train-board-run-bar {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.train-board-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 9px 20px 9px 10px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  border-radius: 999px;
  cursor: pointer;
  color: #fff;
  background: #5f7a3c;
  border: 1px solid #5f7a3c;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 22px -12px rgba(95, 122, 60, 0.55);
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.train-board-button:hover:not(:disabled) {
  background: #7a9a54;
  border-color: #7a9a54;
  color: #1a1512;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35), 0 14px 26px -12px rgba(122, 154, 84, 0.6);
  transform: translateY(-1px);
}
.train-board-button:disabled { cursor: default; opacity: 0.75; transform: none; }
.train-board-button.is-stop {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: none;
}
.train-board-button.is-stop:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
  box-shadow: none;
  transform: none;
}
.train-board-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(26, 21, 18, 0.16);
}
.train-board-icon svg { display: block; }
.train-board-icon.is-spinning svg { animation: train-board-spin 900ms linear infinite; }
@keyframes train-board-spin { to { transform: rotate(360deg); } }

.train-board-frame {
  margin-top: 14px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #2a2420;
  background: #1a1512;
  box-shadow: 0 12px 28px -20px rgba(16, 13, 10, 0.75);
}
.train-board-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: #100d0a;
  border-bottom: 1px solid #2a2420;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c6b8a2;
}
.train-board-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #7a9a54;
  box-shadow: 0 0 6px rgba(122, 154, 84, 0.65);
  animation: train-board-breathe 2.4s ease-in-out infinite;
}
.train-board-updated { margin-left: auto; color: #8a7f70; text-transform: none; letter-spacing: normal; }
@keyframes train-board-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

.train-board-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace; font-size: 13px; }
.train-board-table th {
  text-align: left;
  padding: 8px 14px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a7f70;
  border-bottom: 1px solid #2a2420;
}
.train-board-table td { padding: 9px 14px; border-top: 1px solid #221d19; color: #e9e1d3; }
.train-board-table tr:first-child td { border-top: none; }
.train-board-table td.is-time { color: #d9a441; font-weight: 600; }
.train-board-table td.is-status.is-late { color: #e2725b; }
.train-board-table td.is-status.is-ontime { color: #9fc48c; }
.train-board-empty, .train-board-error {
  padding: 22px 18px;
  text-align: center;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  font-size: 12.5px;
  color: #8a7f70;
}
.train-board-error p:first-child { color: #e2725b; font-size: 13px; }
@media (prefers-reduced-motion: reduce) {
  .train-board-button, .train-board-icon.is-spinning svg, .train-board-dot { transition: none; animation: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

const PLAY_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2"></polygon></svg>';
const SPINNER_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-opacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';
const STOP_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>';

interface Row {
  time: string;
  destination: string;
  category: string;
  track: string;
  delayMinutes: number;
}

interface Props {
  /** Same SQL as the CodeBlock above (ATTACH + the departures SELECT) — one
   *  source of truth. The board re-runs only the final SELECT on each
   *  refresh; ATTACH runs once, at the start, same as any other session. */
  sql: string;
}

export default function LiveTrainBoard({ sql }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const selectStmtRef = useRef<string>("");
  const tableFromIPCRef = useRef<((buf: ArrayBuffer) => any) | null>(null);
  const intervalRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The terminal button's bar (ExampleShellMounter's .example-run-bar) is a
  // plain DOM node created imperatively, not JSX — so it's safe to portal
  // this component's own button into it, landing both buttons in one flex
  // row instead of two stacked bars. It may not exist yet on first render
  // (island hydration order between this component and ExampleShellMounter
  // isn't guaranteed), so this polls briefly rather than assuming; the
  // fallback bar below covers the case where it's never found at all.
  const [runBarEl, setRunBarEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    ensureStyle();
    const panel = rootRef.current?.closest(".tour-tab-panel");
    let attempts = 0;
    let pollId: number | null = null;
    const tryFind = () => {
      const bar = panel?.querySelector<HTMLElement>(".example-run-bar");
      if (bar) {
        setRunBarEl(bar);
        return;
      }
      if (++attempts < 40) pollId = window.setTimeout(tryFind, 50);
    };
    tryFind();
    return () => {
      if (pollId != null) window.clearTimeout(pollId);
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    };
  }, []);

  async function refresh(session: Session, tableFromIPC: (buf: ArrayBuffer) => any) {
    const r = await session.runQuery(selectStmtRef.current);
    if (!r.ok) throw new Error(r.error ?? "Query failed");
    if (!r.buffer) {
      setRows([]);
      setUpdatedAt(new Date());
      return;
    }
    const table = tableFromIPC(r.buffer);
    const timeCol = table.getChild("time");
    const destCol = table.getChild("destination");
    const catCol = table.getChild("category");
    const trackCol = table.getChild("track");
    const delayCol = table.getChild("delay_minutes");
    const next: Row[] = [];
    for (let i = 0; i < table.numRows; i++) {
      next.push({
        time: String(timeCol?.get(i) ?? ""),
        destination: String(destCol?.get(i) ?? ""),
        category: String(catCol?.get(i) ?? ""),
        track: String(trackCol?.get(i) ?? "—"),
        delayMinutes: Number(delayCol?.get(i) ?? 0),
      });
    }
    setRows(next);
    setUpdatedAt(new Date());
  }

  async function start(): Promise<void> {
    if (status === "loading" || status === "live") return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const arrowModule = await import(/* @vite-ignore */ ARROW_CDN);
      const { tableFromIPC } = arrowModule as any;
      tableFromIPCRef.current = tableFromIPC;

      await ensureEngine();
      const [ext, session] = await Promise.all([
        ensureExtension("VGI", "community"),
        createSession(),
      ]);
      if (!ext.ok) {
        throw new Error(
          `VGI may not have a WebAssembly build yet — this query may not run in-browser. (${ext.error ?? "unknown"})`,
        );
      }
      sessionRef.current = session;

      const stmts = splitStatements(sql).filter((s) => !isCommentOnly(s));
      const selectStmt = stmts.pop();
      if (!selectStmt) throw new Error("No SELECT statement found.");
      selectStmtRef.current = selectStmt;
      for (const stmt of stmts) {
        const r = await session.runQuery(stmt);
        if (!r.ok) throw new Error(r.error ?? "Setup statement failed");
      }

      await refresh(session, tableFromIPC);
      setStatus("live");

      intervalRef.current = window.setInterval(() => {
        refresh(session, tableFromIPC).catch((e) => {
          setStatus("error");
          setErrorMsg(e instanceof Error ? e.message : String(e));
          if (intervalRef.current != null) window.clearInterval(intervalRef.current);
        });
      }, REFRESH_MS);
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  function stop(): void {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus("idle");
  }

  const showFrame = status === "live" || (status === "loading" && rows.length > 0);

  const button =
    status !== "live" ? (
      <button
        type="button"
        className="train-board-button"
        disabled={status === "loading"}
        onClick={start}
        aria-label="Start a self-refreshing live departure board"
      >
        <span
          className={`train-board-icon${status === "loading" ? " is-spinning" : ""}`}
          dangerouslySetInnerHTML={{ __html: status === "loading" ? SPINNER_ICON : PLAY_ICON }}
        />
        <span>{status === "loading" ? "Starting live board…" : "Show live board (auto-refreshing)"}</span>
      </button>
    ) : (
      <button
        type="button"
        className="train-board-button is-stop"
        onClick={stop}
        aria-label="Stop the live departure board"
      >
        <span className="train-board-icon" dangerouslySetInnerHTML={{ __html: STOP_ICON }} />
        <span>Stop live board</span>
      </button>
    );

  return (
    <div className="train-board-example" ref={rootRef}>
      {runBarEl ? createPortal(button, runBarEl) : <div className="train-board-run-bar">{button}</div>}

      {status === "error" && (
        <div className="train-board-frame">
          <div className="train-board-error">
            <p>Failed to load the live board.</p>
            {errorMsg && <p>{errorMsg}</p>}
          </div>
        </div>
      )}

      {showFrame && (
        <div className="train-board-frame">
          <div className="train-board-head">
            <span className="train-board-dot" aria-hidden="true" />
            <span>Amsterdam Centraal · Departures</span>
            <span className="train-board-updated">
              {updatedAt
                ? `updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · refreshes every ${REFRESH_MS / 1000}s`
                : ""}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="train-board-empty">No departures in range right now.</div>
          ) : (
            <table className="train-board-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Destination</th>
                  <th>Type</th>
                  <th>Track</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.time}-${row.destination}-${i}`}>
                    <td className="is-time">{row.time}</td>
                    <td>{row.destination}</td>
                    <td>{row.category}</td>
                    <td>{row.track}</td>
                    <td className={`is-status ${row.delayMinutes > 0 ? "is-late" : "is-ontime"}`}>
                      {row.delayMinutes > 0 ? `+${row.delayMinutes}m` : "On time"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
