// Shared by extraction, rendering, and release comparisons. No UI dependencies.
import { createHash } from 'node:crypto';

export function overloadId(row) {
  return `overload-${createHash('sha256').update(JSON.stringify([row.schema_name, row.function_name, signatureKey(row)])).digest('hex').slice(0, 16)}`;
}

export function functionSlug(name) {
  return /^[a-z][a-z0-9_]*$/.test(name) ? name : `operator-${Buffer.from(name).toString('hex')}`;
}

export function signatureKey(row) {
  let args = row.parameters.map((name, i) => [name, row.parameter_types[i] ?? 'UNKNOWN']);
  // Table-function named argument order varies between engine processes.
  // The catalog does not expose the positional/named boundary.
  if (row.function_type === 'table') args = args.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([row.function_type, args, row.varargs, row.return_type]);
}

export function normalizeRows(rows) {
  const fields = ['schema_name', 'function_name', 'function_type', 'description', 'comment',
    'return_type', 'parameters', 'parameter_types', 'varargs', 'macro_definition',
    'has_side_effects', 'internal', 'examples', 'stability', 'categories', 'alias_of'];
  const unique = new Map();
  for (const source of rows) {
    if (source.schema_name !== 'main' || source.internal === false) continue;
    const row = Object.fromEntries(fields.map(key => [key, source[key] ??
      (['parameters', 'parameter_types', 'examples', 'categories'].includes(key) ? [] : null)]));
    if (typeof row.function_name !== 'string' || !Array.isArray(row.parameters) || !Array.isArray(row.parameter_types)) {
      throw new Error('Invalid duckdb_functions() row');
    }
    if (row.function_type === 'table') {
      const pairs = row.parameters.map((name, i) => [name, row.parameter_types[i]]).sort(([a], [b]) => a.localeCompare(b));
      row.parameters = pairs.map(([name]) => name);
      row.parameter_types = pairs.map(([, type]) => type);
    }
    const key = `${row.function_name}:${signatureKey(row)}`;
    unique.set(key, row);
  }
  return [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}

export function groupFunctions(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.function_name)) groups.set(row.function_name, {
      name: row.function_name, slug: functionSlug(row.function_name), overloads: [],
    });
    groups.get(row.function_name).overloads.push(row);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function compareSnapshots(before, after) {
  const left = new Map(groupFunctions(before.functions).map(f => [f.name, f]));
  const right = new Map(groupFunctions(after.functions).map(f => [f.name, f]));
  const added = [], removed = [], changed = [];
  for (const [name, fn] of right) {
    const previous = left.get(name);
    if (!previous) added.push(fn);
    else {
      const oldKeys = new Set(previous.overloads.map(signatureKey));
      const newKeys = new Set(fn.overloads.map(signatureKey));
      const addedSignatures = fn.overloads.filter(r => !oldKeys.has(signatureKey(r)));
      const removedSignatures = previous.overloads.filter(r => !newKeys.has(signatureKey(r)));
      if (addedSignatures.length || removedSignatures.length) changed.push({ ...fn, addedSignatures, removedSignatures });
    }
  }
  for (const [name, fn] of left) if (!right.has(name)) removed.push(fn);
  return { added, removed, changed };
}
