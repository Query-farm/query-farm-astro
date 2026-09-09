import { overloadId } from '../../../scripts/haybarn-functions/catalog.mjs';
import { type FunctionDoc, type Overload } from './catalog';

export { overloadId };

export function orderedOverloads(fn: FunctionDoc) {
  return [...fn.overloads].sort((a, b) => a.function_type.localeCompare(b.function_type) ||
    a.parameters.length - b.parameters.length || a.parameters.join(',').localeCompare(b.parameters.join(',')) ||
    a.parameter_types.join(',').localeCompare(b.parameter_types.join(',')) || (a.return_type ?? '').localeCompare(b.return_type ?? ''));
}

export function overloadGroups(fn: FunctionDoc) {
  const groups = new Map<string, { kind: string; parameters: string[]; rows: Overload[] }>();
  for (const row of orderedOverloads(fn)) {
    const key = JSON.stringify([row.function_type, row.parameters, Boolean(row.varargs)]);
    if (!groups.has(key)) groups.set(key, { kind: row.function_type, parameters: row.parameters, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}

export function exampleQuery(example: string, kind: string) {
  if (/^\s*(SELECT|WITH|FROM|CALL|PRAGMA|CREATE|INSTALL|LOAD)\b/i.test(example)) return example;
  return kind === 'table' || kind === 'table_macro' ? `SELECT * FROM ${example.replace(/;$/, '')};` : `SELECT ${example.replace(/;$/, '')};`;
}

export function catalogExamples(fn: FunctionDoc) {
  const examples = new Map<string, { original: string; sql: string; overloadIds: string[] }>();
  for (const row of orderedOverloads(fn)) for (const original of row.examples) {
    const sql = exampleQuery(original, row.function_type);
    if (!examples.has(sql)) examples.set(sql, { original, sql, overloadIds: [] });
    examples.get(sql)!.overloadIds.push(overloadId(row));
  }
  return [...examples.values()];
}
