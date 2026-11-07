import {formatCellValue} from './repl/format';
import type {Field} from 'apache-arrow';
type Cell = string | number | bigint | boolean | null | undefined;
/** Arrow represents SUM(integer) as Decimal128 words or a tagged HUGEINT.
 * Preserve integral precision instead of comparing the backing byte array. */
export function challengeCell(value: any, field?: Field): Cell {
  if(value == null || typeof value !== 'object')return value;
  if(typeof value.__int128 === 'bigint')return value.__int128;
  if(typeof value.__uint128 === 'bigint')return value.__uint128;
  const formatted=formatCellValue(value,undefined,field);
  if(field?.type.toString().startsWith('Decimal')){
    const integral=formatted.replace(/\.0+$/,'');
    if(/^-?\d+$/.test(integral))return BigInt(integral);
    return Number(formatted);
  }
  return formatted;
}
function valueKey(value: Cell): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return `number:${value}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}
/** Compare bags of rows, including duplicate counts. Equivalent SQL and row
 * ordering are allowed; column order/names and NULL values remain significant. */
export function checkChallengeResult(columns: string[], rows: Cell[][], expectedColumns: string[], expectedRows: Cell[][]) {
  if (columns.length !== expectedColumns.length || columns.some((name, i) => name.toLowerCase() !== expectedColumns[i].toLowerCase())) {
    return { passed: false, message: `Return these columns in order: ${expectedColumns.join(', ')}.` };
  }
  if (rows.length !== expectedRows.length) return { passed: false, message: `Your query returned ${rows.length} rows; the expected result has ${expectedRows.length}. Check which records your filter keeps.` };
  const key = (row: Cell[]) => JSON.stringify(row.map(valueKey));
  const actual = rows.map(key).sort(), expected = expectedRows.map(key).sort();
  const passed = actual.every((row, i) => row === expected[i]);
  return { passed, message: passed ? 'Your result matches.' : 'The row count matches, but some values differ. Compare your output with the expected result.' };
}
