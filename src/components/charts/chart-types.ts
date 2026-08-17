/** Shared shapes for the chart components. Kept in a .ts module so data files
 *  can import them — Astro components don't export types. */
export interface BarSeries {
  label: string;
  color: string;
  /** Appended to values in hover titles, e.g. " min". */
  unit?: string;
}

export interface BarRow {
  label: string;
  values: number[];
  /** Right-hand annotation column (a ratio, a share) — plain text. */
  note?: string;
  /** Overrides the series colour for this row. */
  color?: string;
}
