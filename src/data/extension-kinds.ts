/**
 * One source of truth for how each kind of thing a DuckDB extension registers is
 * labelled and tinted. The contents index and the function-reference cards both
 * read from here, so a scalar function wears the same slate everywhere it
 * appears on the page.
 *
 * Kind badges carry a glyph and a tint, not a label alone. Colour on its own
 * could not do this job: there are eleven kinds and only six `cat-*` tints, and
 * pastels that clear the contrast law on paper are by construction close to one
 * another. So the glyph is the primary signal (see ExtensionKindIcon) and the
 * tint is the secondary one — no two kinds share both.
 *
 * The tints are the warm-recut `cat-*` set from global.css. Function kinds take
 * the tint whose `-ink` is literally the colour the VGI shape diagram is drawn
 * in, so a chip and its glyph are the same hue by construction: scalar slate
 * (#2f5058), table field (#3b5626), aggregate gold (#6d4718), copy plum
 * (#59385a). Every -ink measures 6.1–7.3:1 on its own chip.
 *
 * Six tints do not cover eleven kinds, so the remaining kinds are assigned to
 * avoid collisions *within a single page* rather than globally: no extension in
 * the catalogue registers two kinds that share a tint. Scalar and table are the
 * near-universal pair, so they own slate and field outright and nothing else
 * takes those. Before re-pointing an entry here, check the kinds that actually
 * co-occur — e.g. {scalar, secret, storage, table} on airport/adbc_scanner,
 * {pragma, storage, table} on vgi, {macro, scalar, table} on chsql.
 *
 * The hairline is the kind's own ink at 40%, not neutral soil: the chips sit
 * only ~1.15:1 against paper, so the one edge that was already being drawn may
 * as well identify the kind instead of just containing it.
 */
export type ExtensionKind =
  | 'scalar'
  | 'table'
  | 'aggregate'
  | 'copy'
  | 'type'
  | 'macro'
  | 'pragma'
  | 'secret'
  | 'filesystem'
  | 'storage'
  | 'logtype'
  | 'logstorage';

export const KIND_TINT: Record<string, string> = {
  scalar:     'border-cat-slate-ink/40 bg-cat-slate text-cat-slate-ink',
  table:      'border-cat-field-ink/40 bg-cat-field text-cat-field-ink',
  aggregate:  'border-cat-gold-ink/40  bg-cat-gold  text-cat-gold-ink',
  copy:       'border-cat-plum-ink/40  bg-cat-plum  text-cat-plum-ink',
  type:       'border-cat-clay-ink/40  bg-cat-clay  text-cat-clay-ink',
  macro:      'border-cat-moss-ink/40  bg-cat-moss  text-cat-moss-ink',
  pragma:     'border-cat-clay-ink/40  bg-cat-clay  text-cat-clay-ink',
  secret:     'border-cat-gold-ink/40  bg-cat-gold  text-cat-gold-ink',
  filesystem: 'border-cat-moss-ink/40  bg-cat-moss  text-cat-moss-ink',
  storage:    'border-cat-plum-ink/40  bg-cat-plum  text-cat-plum-ink',
  logtype:    'border-cat-gold-ink/40  bg-cat-gold  text-cat-gold-ink',
  logstorage: 'border-cat-moss-ink/40  bg-cat-moss  text-cat-moss-ink',
};

export const KIND_TINT_FALLBACK = 'border-soil-300 bg-soil-100 text-soil-600';

export const KIND_LABEL: Record<string, string> = {
  scalar: 'Scalar function',
  table: 'Table function',
  aggregate: 'Aggregate function',
  copy: 'Copy function',
  type: 'Logical type',
  macro: 'Macro',
  pragma: 'Setting',
  secret: 'Secret',
  filesystem: 'Filesystem',
  storage: 'Catalog',
  logtype: 'Log type',
  logstorage: 'Log storage',
};

export const kindTint = (kind: string): string => KIND_TINT[kind] ?? KIND_TINT_FALLBACK;
export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? kind;
