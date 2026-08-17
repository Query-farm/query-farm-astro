import type { BarRow, BarSeries } from '../components/charts/chart-types';

/**
 * Lead figures for blog posts.
 *
 * A post's hero is its own measured data, drawn — not a social share card
 * cropped into a thumbnail. Every number here is transcribed from a table that
 * already appears in the post body, so the figure and the prose can never drift;
 * the table below the figure remains the source of truth and the accessible
 * view. Posts with no quantitative data get no entry and fall back to the topic
 * panel — we do not invent a chart to fill a slot.
 *
 * Colours are validated with the data-viz skill's checker against the #f7f3ea
 * surface, never picked by eye. The two-series pair (sun-500 #c08e2f, and
 * #446f22 — field-700 nudged over the chroma floor) clears CVD separation at
 * ΔE 14.3 protan. Re-run the validator before adding a new pair.
 */
export interface BlogFigure {
  title: string;
  subtitle?: string;
  rowHeader: string;
  series: BarSeries[];
  rows: BarRow[];
  noteLabel?: string;
  source?: string;
  precision?: number;
  /** Short label under the card sparkline. */
  sparkLabel: string;
  /** How many rows the card sparkline shows. */
  sparkRows?: number;
}

const HAYBARN = '#c08e2f';
const REFERENCE = '#446f22';

export const BLOG_FIGURES: Record<string, BlogFigure> = {
  'duckdb-community-extensions-distribution': {
    title: 'One extension, built nine ways',
    subtitle:
      'Median wall-clock build time per platform, in minutes. Lower is better. Sorted by the gap between the two.',
    rowHeader: 'Platform',
    series: [
      { label: 'Haybarn', color: HAYBARN, unit: ' min' },
      { label: 'DuckDB community-extensions', color: REFERENCE, unit: ' min' },
    ],
    noteLabel: 'Ratio',
    precision: 1,
    rows: [
      { label: 'Windows x64 (MinGW)', values: [7.2, 24.5], note: '3.4×' },
      { label: 'Wasm (MVP)', values: [2.0, 6.8], note: '3.4×' },
      { label: 'Wasm (EH)', values: [2.1, 6.9], note: '3.3×' },
      { label: 'Wasm (threads)', values: [2.2, 6.9], note: '3.1×' },
      { label: 'Windows x64', values: [3.7, 8.2], note: '2.2×' },
      { label: 'Linux x64', values: [3.0, 6.2], note: '2.1×' },
      { label: 'Linux ARM64', values: [3.0, 5.5], note: '1.8×' },
      { label: 'macOS ARM64', values: [2.0, 3.2], note: '1.6×' },
      { label: 'macOS x64', values: [2.1, 3.1], note: '1.5×' },
    ],
    source:
      'Haybarn CI (GitHub organization webhooks, snapshotted to DuckDB) and the GitHub Actions REST API for duckdb/community-extensions. Build time excludes queue wait. See Methodology.',
    sparkLabel: 'Build minutes per platform',
    sparkRows: 5,
  },

  'testing-duckdb-wasm-extensions': {
    title: '124 community extensions, run in a browser',
    subtitle:
      'Outcome of executing each extension’s own test suite against a WASM build. 58 passed; the rest failed or could not be run at all.',
    rowHeader: 'Outcome',
    // One series: the row label carries identity, so colour is not an identity
    // channel here and a six-hue status ramp would be both unnecessary and
    // unvalidatable against this palette.
    series: [{ label: 'Extensions', color: REFERENCE }],
    noteLabel: 'Share',
    precision: 0,
    rows: [
      { label: 'pass', values: [58], note: '47%' },
      { label: 'fail', values: [43], note: '35%' },
      { label: 'skip', values: [9], note: '7%' },
      { label: 'not-deployed', values: [8], note: '6%' },
      { label: 'no-tests', values: [5], note: '4%' },
      { label: 'crash', values: [1], note: '1%' },
    ],
    source: 'Survey of 124 DuckDB community extensions. Shares are of the 124 surveyed and are rounded.',
    sparkLabel: '124 extensions by outcome',
    sparkRows: 4,
  },
};

export function blogFigure(slug: string): BlogFigure | undefined {
  return BLOG_FIGURES[slug];
}
