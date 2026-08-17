/**
 * A bespoke "Show on map" example — the other tour tabs render their result
 * as a table in a terminal (ExampleShell), which doesn't make sense for a
 * few hundred lat/lon points. This one runs the same shared WASM engine
 * (src/lib/repl/duckdb-boot.ts — the exact singleton every other example
 * shares) but renders the result as Leaflet markers instead of terminal
 * output. Not folded into ExampleShellMounter's generic pre-scanning
 * mechanism: that mechanism is built around "inject a button, mount a
 * terminal," and teaching it a second rendering mode for one example would
 * be more machinery than the one-off it's serving.
 *
 * Leaflet (CSS + JS) loads from jsDelivr on demand, same as xterm/Arrow in
 * ExampleShell — kept out of the page bundle until someone actually clicks.
 */
import { useEffect, useRef, useState } from "react";
import {
  ensureEngine,
  ensureExtension,
  createSession,
  splitStatements,
  isCommentOnly,
} from "../../lib/repl/duckdb-boot";

const LEAFLET_CSS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
const ARROW_CDN = "https://cdn.jsdelivr.net/npm/apache-arrow@18.1.0/+esm";

// One color per real categories.primary value this query can return (see
// vgi/index.astro's mapExample doc comment) — chosen for mutual contrast
// against each other and against OSM's tan/white/green basemap, not tied to
// any color already meaningful elsewhere on this page (sun-400 gold,
// field green). Anything unexpected falls back to a neutral gray rather
// than silently vanishing or throwing.
const CATEGORY_COLORS: Record<string, string> = {
  church_cathedral: "#7c3aed",
  catholic_church: "#dc2626",
  baptist_church: "#2563eb",
  pentecostal_church: "#ea580c",
  evangelical_church: "#0d9488",
  episcopal_church: "#db2777",
  anglican_church: "#ca8a04",
};
const CATEGORY_LABELS: Record<string, string> = {
  church_cathedral: "Church / cathedral",
  catholic_church: "Catholic",
  baptist_church: "Baptist",
  pentecostal_church: "Pentecostal",
  evangelical_church: "Evangelical",
  episcopal_church: "Episcopal",
  anglican_church: "Anglican",
};
const FALLBACK_COLOR = "#8a7f70";
function colorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLOR;
}
function labelFor(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const STYLE_ID = "overture-map-example-style";

// Same visual language as ExampleShellMounter's .example-try-button (rounded
// pill, field-700/field-600 fill, icon chip) but scoped under its own class
// names rather than reaching into that component's injected stylesheet —
// each REPL-adjacent component owns its own styles (ExampleShell does the
// same with its own ensureShellStyle()), so nothing here depends on mount
// order between islands.
const STYLE = `
.overture-map-run-bar {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.overture-map-button {
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
.overture-map-button:hover:not(:disabled) {
  background: #7a9a54;
  border-color: #7a9a54;
  color: #1a1512;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35), 0 14px 26px -12px rgba(122, 154, 84, 0.6);
  transform: translateY(-1px);
}
.overture-map-button:disabled {
  cursor: default;
  opacity: 0.75;
  transform: none;
}
.overture-map-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(26, 21, 18, 0.16);
}
.overture-map-icon svg { display: block; }
.overture-map-icon.is-spinning svg { animation: overture-map-spin 900ms linear infinite; }
@keyframes overture-map-spin { to { transform: rotate(360deg); } }

.overture-map-frame {
  margin-top: 14px;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #2a2420;
  box-shadow: 0 12px 28px -20px rgba(16, 13, 10, 0.75);
}
.overture-map-canvas { height: 420px; width: 100%; background: #1a1512; }
.overture-map-placeholder {
  height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a7f70;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  font-size: 12.5px;
  text-align: center;
  padding: 0 24px;
}
.overture-map-error {
  padding: 22px 18px;
  text-align: center;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
}
.overture-map-error p { font-size: 13px; color: #e2725b; }
.overture-map-error p + p { margin-top: 8px; font-size: 11.5px; color: #8a7f70; word-break: break-word; }

.overture-map-legend {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  font-size: 12.5px;
  color: #e9e1d3;
}
.overture-map-legend span { display: inline-flex; align-items: center; gap: 7px; }
.overture-map-legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: none;
}
@media (prefers-reduced-motion: reduce) {
  .overture-map-button, .overture-map-icon.is-spinning svg { transition: none; animation: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

let scriptsLoading: Promise<void> | null = null;

/** Load the Leaflet CSS + classic script once, shared across mounts. */
function loadLeaflet(): Promise<void> {
  if (scriptsLoading) return scriptsLoading;
  scriptsLoading = (async () => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if ((window as any).L) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = LEAFLET_JS;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Leaflet"));
      document.head.appendChild(s);
    });
  })();
  return scriptsLoading;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLAY_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2"></polygon></svg>';
const SPINNER_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-opacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';
const CHECK_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';

interface Props {
  /** Full SQL — including ATTACH — exactly as shown in the CodeBlock above
   *  this component. One source of truth: what's displayed is what runs. */
  sql: string;
  /** Plumbing that runs before `sql` but isn't shown in the CodeBlock (S3
   *  region + httpfs install/load) — pure access setup, not something that
   *  helps explain what the example demonstrates. Unlike ATTACH (which
   *  stays visible in `sql`), there's no reason for a reader to see this. */
  setupSql?: string;
}

export default function OvertureMapExample({ sql, setupSql }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // Booting the engine (one-time, cached after the first shell on the page)
  // and running the query are different kinds of wait, same distinction
  // ExampleShell.tsx's terminal draws between its transient boot line and
  // its per-statement "running…" spinner. This button collapsed both into
  // one blended label; splitting it back out is what makes the elapsed
  // clock below mean something (a fresh, honest number for the part that's
  // actually variable — a remote scan — not padded by one-time boot cost).
  const [phase, setPhase] = useState<"booting" | "querying">("booting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<
    Array<{ category: string; count: number }> | null
  >(null);
  // Elapsed time in the current phase — the terminal-based examples got a
  // "still running" spinner (ExampleShell.tsx) after a silent multi-second
  // query read as hung; this component makes the same real network+WASM-
  // bound call (attach, install httpfs, scan a bbox of Overture's public
  // parquet) but never got the same treatment since it doesn't run through
  // ExampleShell's exec(). Same idea, adapted to a button label instead of
  // a terminal line: no fake percentage (DuckDB can't estimate progress
  // through a remote scan it doesn't control), just proof it's still alive.
  const [elapsedMs, setElapsedMs] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    ensureStyle();
  }, []);

  async function run(): Promise<void> {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg(null);
    setPhase("booting");
    setElapsedMs(0);
    let phaseStart = performance.now();
    let timer = window.setInterval(() => setElapsedMs(performance.now() - phaseStart), 1000);
    try {
      await loadLeaflet();
      const [arrowModule] = await Promise.all([
        import(/* @vite-ignore */ ARROW_CDN),
        ensureEngine(),
      ]);
      const [ext, session] = await Promise.all([
        ensureExtension("VGI", "community"),
        createSession(),
      ]);
      if (!ext.ok) {
        throw new Error(
          `VGI may not have a WebAssembly build yet — this query may not run in-browser. (${ext.error ?? "unknown"})`,
        );
      }

      // Boot's done — restart the clock for the part that's actually
      // variable, matching the terminal's own per-statement spinner reset.
      window.clearInterval(timer);
      setPhase("querying");
      setElapsedMs(0);
      phaseStart = performance.now();
      timer = window.setInterval(() => setElapsedMs(performance.now() - phaseStart), 1000);

      if (setupSql) {
        const setupStmts = splitStatements(setupSql).filter((s) => !isCommentOnly(s));
        for (const stmt of setupStmts) {
          const r = await session.runQuery(stmt);
          if (!r.ok) throw new Error(r.error ?? "Setup statement failed");
        }
      }

      const stmts = splitStatements(sql).filter((s) => !isCommentOnly(s));
      let buffer: ArrayBuffer | undefined;
      for (const stmt of stmts) {
        const r = await session.runQuery(stmt);
        if (!r.ok) throw new Error(r.error ?? "Query failed");
        if (r.buffer) buffer = r.buffer;
      }
      if (!buffer) throw new Error("The query returned no result set.");

      const {
        tableFromIPC: origTableFromIPC,
        RecordBatchFileReader,
        Table: ArrowTable,
      } = arrowModule as any;
      let table: any;
      try {
        const reader = RecordBatchFileReader.from(new Uint8Array(buffer));
        const batches = [...reader];
        table = batches.length ? new ArrowTable(batches) : origTableFromIPC(buffer);
      } catch {
        table = origTableFromIPC(buffer);
      }

      const L = (window as any).L;
      if (!containerRef.current) throw new Error("Map container not ready.");
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const nameCol = table.getChild("name");
      const categoryCol = table.getChild("category");
      const lonCol = table.getChild("lon");
      const latCol = table.getChild("lat");
      const bounds: [number, number][] = [];
      const tally = new Map<string, number>();
      for (let i = 0; i < table.numRows; i++) {
        const name = String(nameCol?.get(i) ?? "");
        const category = String(categoryCol?.get(i) ?? "");
        const lon = Number(lonCol?.get(i));
        const lat = Number(latCol?.get(i));
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const color = colorFor(category);
        L.circleMarker([lat, lon], {
          radius: 5,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.85,
        })
          .bindPopup(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(labelFor(category))}`)
          .addTo(mapRef.current);
        bounds.push([lat, lon]);
        tally.set(category, (tally.get(category) ?? 0) + 1);
      }
      if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
      requestAnimationFrame(() => mapRef.current?.invalidateSize());

      setCategoryCounts(
        Array.from(tally, ([category, count]) => ({ category, count })).sort(
          (a, b) => b.count - a.count,
        ),
      );
      setStatus("ready");
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      window.clearInterval(timer);
    }
  }

  return (
    <div className="overture-map-example">
      <div className="overture-map-run-bar">
        <button
          type="button"
          className="overture-map-button"
          disabled={status === "loading" || status === "ready"}
          onClick={run}
          aria-label={
            status === "ready"
              ? "Map loaded"
              : "Run this example and render the results on a map"
          }
        >
          <span
            className={`overture-map-icon${status === "loading" ? " is-spinning" : ""}`}
            dangerouslySetInnerHTML={{
              __html:
                status === "loading" ? SPINNER_ICON : status === "ready" ? CHECK_ICON : PLAY_ICON,
            }}
          />
          <span>
            {status === "loading"
              ? phase === "booting"
                ? "Booting Haybarn (DuckDB) WebAssembly…"
                : `Running query… ${Math.round(elapsedMs / 1000)}s`
              : status === "ready"
                ? "Map loaded — data doesn't change"
                : "Show on map using WASM"}
          </span>
        </button>
      </div>

      {status === "error" && (
        <div className="overture-map-frame">
          <div className="overture-map-error">
            <p>Failed to load the map.</p>
            {errorMsg && <p>{errorMsg}</p>}
          </div>
        </div>
      )}

      <div
        className="overture-map-frame"
        style={{ display: status === "loading" || status === "ready" ? "block" : "none" }}
      >
        <div ref={containerRef} className="overture-map-canvas" />
      </div>

      {categoryCounts && (
        <div className="overture-map-legend">
          {categoryCounts.map(({ category, count }) => (
            <span key={category}>
              <i style={{ background: colorFor(category) }} />
              {labelFor(category)} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
