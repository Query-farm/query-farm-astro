/**
 * Terminal table rendering for DuckDB query results.
 * Box-mode and line-mode output matching DuckDB CLI style.
 */
import type { Table, Field } from "apache-arrow";
import { formatCellValue, safeGetArrowValue } from "./format";

/**
 * SGR slots, resolved by the shell's xterm palette (see TERM_THEME in
 * src/components/repl/ExampleShell.tsx), which mirrors the Shiki `farmTheme`.
 *   CHROME  90  #8a7f70  rules, type row, footers, NULL — 4.6:1 on rock-900
 *   NAME  1;34  #8fc7d8  identifiers / column names
 *   NUM     93  #e0a44f  numerics
 */
const SGR_CHROME = "\x1b[90m";
const SGR_NAME = "\x1b[1;34m";
const SGR_NUM = "\x1b[93m";
const SGR_OFF = "\x1b[0m";

/** Unicode Box Drawing block (U+2500–U+257F). */
const BOX_DRAWING = /[─-╿]+/g;

/**
 * Drop the box rules back to chrome after layout. Rewriting the finished line
 * is width-neutral and keeps cell-width calculations independent of ANSI.
 */
function dimBorders(line: string): string {
  return line.replace(BOX_DRAWING, (run) => `${SGR_CHROME}${run}${SGR_OFF}`);
}

/** Minimal terminal output interface needed by the renderers. */
export interface TerminalOutput {
  /** Current terminal width in columns. */
  cols: number;
  /** Print a line to the terminal (with implicit newline). */
  println: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Escape control characters the way DuckDB's duckbox does: newlines/tabs/CR
 *  become visible \n / \t / \r so a value is always one logical line and can't
 *  break the box border, and any other control char (incl. ESC) is rendered as
 *  \xNN so cell data can't inject ANSI escapes into the terminal. */
function escapeControl(s: string): string {
  return s
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) =>
      "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"),
    );
}

/** Format a value for display, returning "NULL" for null/undefined. */
function formatVal(val: unknown, field: Field): string {
  if (val === null || val === undefined) return "NULL";
  return escapeControl(formatCellValue(val, field?.name, field));
}

/**
 * Per-codepoint terminal display width, also used as xterm's width provider,
 * so column sizing, the box border, and the rendered glyphs agree. Wide
 * ranges follow `is-fullwidth-code-point`; emoji ranges cover the common
 * blocks. Variation selectors / combining marks are 0, so base-emoji (2) +
 * VS16 (0) totals 2. NOTE: JS String.length counts UTF-16 units and is wrong
 * here (a supplementary emoji is len 2, a BMP wide char len 1) — always use
 * displayWidth() for column math.
 */
export function cellWidth(cp: number): number {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0; // C0/C1 controls
  if (
    (cp >= 0x300 && cp <= 0x36f) ||   // combining marks
    (cp >= 0x200b && cp <= 0x200f) || // zero-width spaces, ZWJ, marks
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors (incl. VS16)
    cp === 0xfeff
  ) return 0;
  const wide =
    cp === 0x3000 ||
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f200 && cp <= 0x1f251) ||
    (cp >= 0x20000 && cp <= 0x3fffd);
  const emoji =
    cp === 0x2122 || cp === 0x2139 || cp === 0x2764 ||
    (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols + dingbats
    (cp >= 0x2b00 && cp <= 0x2bff) || // misc symbols & arrows (⬜ etc.)
    (cp >= 0x1f000 && cp <= 0x1faff); // supplementary emoji
  return wide || emoji ? 2 : 1;
}

/** Terminal display width of a string (sum of cellWidth over code points). */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += cellWidth(ch.codePointAt(0) as number);
  return w;
}

/** Truncate to a display width of maxLen, appending … if needed. */
export function truncStr(s: string, maxLen: number): string {
  if (displayWidth(s) <= maxLen) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = cellWidth(ch.codePointAt(0) as number);
    if (w + cw > maxLen - 1) break;
    out += ch;
    w += cw;
  }
  return out + "…";
}

/** Check if an Arrow field represents a numeric type. */
export function isNumericField(field: Field): boolean {
  const t = field.type?.toString() || "";
  return /^(Int|Uint|Float|Decimal|float|int|uint|double)/i.test(t) ||
    t.startsWith("Duration");
}

/** Map Arrow field to a short DuckDB type name for the type row. */
export function fieldToDuckDBType(field: Field): string {
  const t = field.type?.toString() || "?";
  const map: Record<string, string> = {
    "Utf8": "varchar", "LargeUtf8": "varchar",
    "Int8": "tinyint", "Int16": "smallint", "Int32": "int32", "Int64": "int64",
    "Uint8": "utinyint", "Uint16": "usmallint", "Uint32": "uint32", "Uint64": "uint64",
    "Float16": "float", "Float32": "float", "Float64": "double",
    "Bool": "boolean", "Binary": "blob", "LargeBinary": "blob",
  };
  if (map[t]) return map[t];
  if (t.startsWith("Dictionary<")) {
    const inner = t.match(/,\s*(.+)>$/)?.[1];
    return inner && map[inner] ? map[inner] : "varchar";
  }
  if (t.startsWith("Timestamp")) return "timestamp";
  if (t.startsWith("Date")) return "date";
  if (t.startsWith("Time")) return "time";
  if (t.startsWith("Decimal")) return "decimal";
  if (t.startsWith("Struct")) return "struct";
  if (t.includes("List")) return "list";
  const ext = field.metadata?.get?.("ARROW:extension:name");
  if (ext?.startsWith("geoarrow.")) return "geometry";
  return t.toLowerCase();
}

/** Format a row/column/time footer string. */
function formatFooter(numRows: number, displayRows: number, truncated: boolean, totalCols: number, shownCols: number, elapsedMs?: number): string {
  const rowText = truncated
    ? `${numRows} row${numRows !== 1 ? "s" : ""} (${displayRows} shown)`
    : `${numRows} row${numRows !== 1 ? "s" : ""}`;
  const colText = shownCols < totalCols
    ? `${totalCols} columns (${shownCols} shown)`
    : `${totalCols} column${totalCols !== 1 ? "s" : ""}`;
  const timeText = elapsedMs != null
    ? (elapsedMs < 1000 ? `${Math.round(elapsedMs)}ms` : `${(elapsedMs / 1000).toFixed(2)}s`)
    : "";
  return `${SGR_CHROME}${[rowText, totalCols > 1 ? colText : "", timeText].filter(Boolean).join("    ")}${SGR_OFF}`;
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

/** Build the display indices (head + tail with gap) for a result set. */
function getDisplayIndices(numRows: number, maxDisplayRows: number): { indices: number[]; truncated: boolean; half: number } {
  const half = Math.floor(maxDisplayRows / 2);
  const truncated = numRows > maxDisplayRows;
  const indices: number[] = [];
  if (!truncated) {
    for (let r = 0; r < numRows; r++) indices.push(r);
  } else {
    for (let r = 0; r < half; r++) indices.push(r);
    for (let r = numRows - half; r < numRows; r++) indices.push(r);
  }
  return { indices, truncated, half };
}

/** Extract a formatted string grid from an Arrow table for the given row indices. */
function buildGrid(table: Table, fields: Field[], displayIndices: number[]): string[][] {
  const totalCols = fields.length;
  const grid: string[][] = [];
  for (const r of displayIndices) {
    const row: string[] = [];
    for (let c = 0; c < totalCols; c++) {
      row.push(formatVal(safeGetArrowValue(table.getChildAt(c), r, fields[c]), fields[c]));
    }
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Box-mode rendering
// ---------------------------------------------------------------------------

const MAX_COL_WIDTH = 20;

/** Compute ideal column widths (capped at MAX_COL_WIDTH). */
function computeIdealWidths(names: string[], types: string[], grid: string[][], totalCols: number): number[] {
  const widths: number[] = [];
  for (let c = 0; c < totalCols; c++) {
    let w = Math.max(displayWidth(names[c]), displayWidth(types[c]));
    for (const row of grid) w = Math.max(w, displayWidth(row[c]));
    widths.push(Math.min(w, MAX_COL_WIDTH));
  }
  return widths;
}

/** Determine which columns are visible given terminal width, pruning from the middle. */
function pruneColumns(idealWidths: number[], termW: number): { visibleIndices: number[]; ellipsisPos: number | null } {
  const calcTotal = (widths: number[]) => 1 + widths.reduce((s, w) => s + w + 3, 0);
  const totalCols = idealWidths.length;

  if (calcTotal(idealWidths) <= termW) {
    return { visibleIndices: idealWidths.map((_, i) => i), ellipsisPos: null };
  }

  const ELLIPSIS_COST = 4;
  const hidden = new Set<number>();
  const mid = Math.floor(totalCols / 2);
  const order: number[] = [mid];
  for (let d = 1; d < totalCols; d++) {
    if (mid - d >= 0) order.push(mid - d);
    if (mid + d < totalCols) order.push(mid + d);
  }
  for (const idx of order) {
    hidden.add(idx);
    const remaining = idealWidths.filter((_, i) => !hidden.has(i));
    if (calcTotal(remaining) + ELLIPSIS_COST <= termW) break;
  }

  const visibleIndices: number[] = [];
  let ellipsisPos: number | null = null;
  let insertedEllipsis = false;
  for (let i = 0; i < totalCols; i++) {
    if (hidden.has(i)) {
      if (!insertedEllipsis) {
        ellipsisPos = visibleIndices.length;
        insertedEllipsis = true;
      }
    } else {
      visibleIndices.push(i);
    }
  }
  if (hidden.size > 0 && ellipsisPos === null) {
    ellipsisPos = visibleIndices.length;
  }
  return { visibleIndices, ellipsisPos };
}

/** Distribute leftover terminal width to columns that were capped. */
function distributeSlack(
  idealWidths: number[], visibleIndices: number[], ellipsisPos: number | null,
  termW: number, names: string[], grid: string[][]
): void {
  const ellipsisCost = ellipsisPos != null ? 4 : 0;
  const usedWidth = 1 + ellipsisCost + visibleIndices.reduce((s, ci) => s + idealWidths[ci] + 3, 0);
  let slack = termW - usedWidth;
  if (slack <= 0) return;

  const naturalWidths = visibleIndices.map(ci => {
    let w = displayWidth(names[ci]);
    for (const row of grid) w = Math.max(w, displayWidth(row[ci]));
    return w;
  });
  const expandable = visibleIndices
    .map((ci, vi) => naturalWidths[vi] > idealWidths[ci] ? vi : -1)
    .filter(i => i >= 0);

  while (slack > 0 && expandable.length > 0) {
    const share = Math.max(1, Math.floor(slack / expandable.length));
    let expanded = false;
    for (let i = expandable.length - 1; i >= 0; i--) {
      const vi = expandable[i];
      const ci = visibleIndices[vi];
      const need = naturalWidths[vi] - idealWidths[ci];
      if (need <= 0) { expandable.splice(i, 1); continue; }
      const give = Math.min(need, share, slack);
      idealWidths[ci] += give;
      slack -= give;
      expanded = true;
      if (idealWidths[ci] >= naturalWidths[vi]) expandable.splice(i, 1);
      if (slack <= 0) break;
    }
    if (!expanded) break;
  }
}

/**
 * Render an Arrow table in DuckDB box-drawing style without Node-oriented
 * formatting dependencies in the browser bundle.
 */
export async function printBoxTable(table: Table, out: TerminalOutput, maxDisplayRows: number, elapsedMs?: number): Promise<void> {
  const fields = table.schema.fields;
  const numRows = table.numRows;
  const totalCols = fields.length;
  if (totalCols === 0) { out.println("(empty)"); return; }

  const { indices, truncated, half } = getDisplayIndices(numRows, maxDisplayRows);
  const grid = buildGrid(table, fields, indices);
  const displayRows = indices.length;

  const names = fields.map((f) => f.name);
  const types = fields.map((f) => fieldToDuckDBType(f));
  const isNumeric = fields.map((f) => isNumericField(f));
  const idealWidths = computeIdealWidths(names, types, grid, totalCols);

  const { visibleIndices, ellipsisPos } = pruneColumns(idealWidths, out.cols);
  const shownCount = visibleIndices.length;
  distributeSlack(idealWidths, visibleIndices, ellipsisPos, out.cols, names, grid);

  type Align = "left" | "right" | "center";
  type Cell = { text: string; width: number; align: Align; color?: string };
  const columns: { source: number | null; width: number; align: Align }[] = [];
  for (let vi = 0; vi < shownCount; vi++) {
    if (ellipsisPos === vi) columns.push({ source: null, width: 1, align: "center" });
    const ci = visibleIndices[vi];
    columns.push({ source: ci, width: idealWidths[ci], align: isNumeric[ci] ? "right" : "left" });
  }
  if (ellipsisPos === shownCount) columns.push({ source: null, width: 1, align: "center" });

  const split = (text: string, width: number): string[] => {
    if (!text) return [""];
    const lines: string[] = [];
    let line = "";
    let used = 0;
    for (const ch of text) {
      const w = cellWidth(ch.codePointAt(0) as number);
      if (used + w > width && line) { lines.push(line); line = ""; used = 0; }
      line += ch;
      used += w;
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  };
  const pad = (text: string, width: number, align: Align): string => {
    const gap = Math.max(0, width - displayWidth(text));
    const left = align === "right" ? gap : align === "center" ? Math.floor(gap / 2) : 0;
    return `${" ".repeat(left)}${text}${" ".repeat(gap - left)}`;
  };
  const rule = (left: string, join: string, right: string) =>
    dimBorders(left + columns.map((c) => "─".repeat(c.width + 2)).join(join) + right);
  const render = (cells: Cell[]) => {
    const parts = cells.map((cell) => split(cell.text, cell.width));
    const height = Math.max(...parts.map((p) => p.length));
    for (let line = 0; line < height; line++) {
      const body = cells.map((cell, i) => {
        const raw = parts[i][line] ?? "";
        const value = pad(raw, cell.width, cell.align);
        return ` ${cell.color && raw ? cell.color : ""}${value}${cell.color && raw ? SGR_OFF : ""} `;
      }).join("│");
      out.println(dimBorders(`│${body}│`));
    }
  };
  const makeRow = (values: string[], header: "name" | "type" | null = null): Cell[] => columns.map((column) => {
    if (column.source === null) return { text: header === "type" ? "" : "…", width: column.width, align: "center" };
    const text = values[column.source];
    const color = header === "name" ? SGR_NAME : header === "type" || text === "NULL"
      ? SGR_CHROME : isNumeric[column.source] && displayWidth(text) <= column.width ? SGR_NUM : undefined;
    return { text, width: column.width, align: header ? "center" : column.align, color };
  });

  out.println(rule("┌", "┬", "┐"));
  render(makeRow(names.map((name, i) => truncStr(name, idealWidths[i])), "name"));
  render(makeRow(types.map((type, i) => truncStr(type, idealWidths[i])), "type"));
  out.println(rule(displayRows ? "├" : "└", displayRows ? "┼" : "┴", displayRows ? "┤" : "┘"));
  for (let r = 0; r < displayRows; r++) {
    if (truncated && r === half) {
      for (let g = 0; g < 3; g++) render(columns.map((c) => ({ text: "·", width: c.width, align: "center" })));
    }
    render(makeRow(grid[r]));
  }
  if (displayRows) out.println(rule("└", "┴", "┘"));
  out.println(formatFooter(numRows, displayRows, truncated, totalCols, shownCount, elapsedMs));
}

/**
 * Render an Arrow table in line mode — one field per line, vertically.
 */
export function printLineTable(table: Table, out: TerminalOutput, maxDisplayRows: number, elapsedMs?: number): void {
  const fields = table.schema.fields;
  const numRows = table.numRows;
  const totalCols = fields.length;
  if (totalCols === 0) { out.println("(empty)"); return; }

  const { indices, truncated, half } = getDisplayIndices(numRows, maxDisplayRows);
  const names = fields.map((f) => f.name);
  const maxNameLen = Math.max(...names.map((n: string) => n.length));
  const lineWidth = Math.min(out.cols, maxNameLen + 30);

  for (let i = 0; i < indices.length; i++) {
    if (truncated && i === half) {
      const gapLabel = ` · · · ${numRows - maxDisplayRows} records omitted · · · `;
      const gapDashes = Math.max(0, lineWidth - gapLabel.length - 1);
      out.println(`${SGR_CHROME}─${gapLabel}${"─".repeat(gapDashes)}${SGR_OFF}`);
    }
    const r = indices[i];
    const label = ` RECORD ${r + 1} `;
    const dashCount = Math.max(0, lineWidth - label.length - 1);
    out.println(`${SGR_CHROME}─${label}${"─".repeat(dashCount)}${SGR_OFF}`);
    for (let c = 0; c < totalCols; c++) {
      const val = formatVal(safeGetArrowValue(table.getChildAt(c), r, fields[c]), fields[c]);
      const name = names[c].padStart(maxNameLen);
      const numeric = isNumericField(fields[c]);
      const display =
        val === "NULL"
          ? `${SGR_CHROME}NULL${SGR_OFF}`
          : numeric
            ? `${SGR_NUM}${val}${SGR_OFF}`
            : val;
      out.println(`${SGR_NAME}${name}${SGR_OFF}${SGR_CHROME} = ${SGR_OFF}${display}`);
    }
  }

  out.println(formatFooter(numRows, indices.length, truncated, totalCols, totalCols, elapsedMs));
}
