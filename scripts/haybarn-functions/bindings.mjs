import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { overloadId } from './catalog.mjs';

// duckdb_functions() combines positional and named table parameters. Confirm
// their modes with the binder's own named-parameter diagnostic. EXPLAIN plus an
// invalid option stops before the table function binds or executes. Never turn
// an unrecognized diagnostic (or a renamed positional parameter) into a guess.
export function parseBinding(row, diagnostic) {
  if (!diagnostic.startsWith('Binder Error: Invalid named parameter "__guide_invalid_named_parameter__" for function ')) return null;
  const candidates = diagnostic.includes('Function does not accept any named parameters.') ? [] :
    diagnostic.split('Candidates:\n')[1]?.split('\n').filter(line => /^ {4}\S/.test(line)).map(line => {
      const [, name, type] = line.match(/^ {4}(\S+) (.+)$/) ?? [];
      return { name, type };
    });
  if (!candidates || candidates.some(arg => !arg.name || !arg.type)) return null;
  const named = candidates.map(arg => arg.name);
  if (candidates.some(arg => !row.parameters.some((name, i) => name === arg.name && row.parameter_types[i] === arg.type))) return null;
  const positional = row.parameters.filter(name => !named.includes(name)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  if (positional.some((name, i) => name !== `col${i}`)) return null;
  return { positional, named };
}

export function bindingQuery(row) {
  const positional = row.parameters.map((name, i) => ({ name, type: row.parameter_types[i] }))
    .filter(arg => /^col\d+$/.test(arg.name)).sort((a, b) => Number(a.name.slice(3)) - Number(b.name.slice(3)));
  if (row.description || positional.some((arg, i) => arg.name !== `col${i}` || !arg.type || !/^[\w\s[\](),]+$/.test(arg.type))) return null;
  const args = positional.map(arg => ['ANY', 'TABLE', 'POINTER'].includes(arg.type) ? 'NULL' : `NULL::${arg.type}`);
  args.push('__guide_invalid_named_parameter__ := NULL');
  return `EXPLAIN SELECT * FROM "${row.function_name.replaceAll('"', '""')}"(${args.join(', ')});`;
}

export function captureBindings({ binary, snapshot, root }) {
  const hash = createHash('sha256').update(readFileSync(binary)).digest('hex');
  if (hash !== snapshot.binarySha256) throw new Error('Binding capture must use the exact catalog binary.');
  const quote = text => `'${text.replaceAll("'", "''")}'`;
  const extensionDirectory = resolve(root, '.cache/extensions', `${snapshot.engine}-${hash.slice(0, 16)}`);
  const prelude = `SET extension_directory = ${quote(extensionDirectory)};\n` + snapshot.requestedExtensions.map(name => `LOAD "${name.replaceAll('"', '""')}";`).join('\n');
  const overloads = {};
  const unresolved = [];
  for (const row of snapshot.functions.filter(row => row.function_type === 'table')) {
    const id = overloadId(row);
    const positional = row.parameters.map((name, i) => ({ name, type: row.parameter_types[i] }))
      .filter(arg => /^col\d+$/.test(arg.name)).sort((a, b) => Number(a.name.slice(3)) - Number(b.name.slice(3)));
    // Only emit type syntax we can safely represent in a NULL cast. Catalog
    // names with descriptions may override colN, so leave those unresolved.
    if (row.description || positional.some((arg, i) => arg.name !== `col${i}` || !arg.type || !/^[\w\s[\](),]+$/.test(arg.type))) {
      unresolved.push(id); continue;
    }
    const args = positional.map(arg => ['ANY', 'TABLE', 'POINTER'].includes(arg.type) ? 'NULL' : `NULL::${arg.type}`);
    args.push('__guide_invalid_named_parameter__ := NULL');
    const query = `EXPLAIN SELECT * FROM "${row.function_name.replaceAll('"', '""')}"(${args.join(', ')});`;
    const result = spawnSync(binary, ['-init', '/dev/null', '-batch', '-bail', '-noheader', '-list', ':memory:', '-c', `${prelude}\n${query}`],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    const diagnostic = (result.stderr ?? '').trim();
    const binding = result.status !== 0 && !result.error ? parseBinding(row, diagnostic) : null;
    if (binding) overloads[id] = { ...binding, query, diagnostic };
    else unresolved.push(id);
  }
  const output = { schemaVersion: 1, snapshot: snapshot.id, binarySha256: hash,
    source: 'engine-binder', overloads, unresolved };
  const directory = resolve(root, 'src/haybarn-functions/data/bindings');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${snapshot.id}.json`), JSON.stringify(output, null, 2) + '\n');
  console.log(`${snapshot.id}: ${Object.keys(overloads).length} table argument layouts confirmed by the engine; ${unresolved.length} unresolved`);
}
