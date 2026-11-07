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
  if (diagnostic.startsWith('Binder Error: No function matches')) return parseSignatureBinding(row, diagnostic);
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

// DuckDB 2.0 reports full signatures on overload mismatch. Its unknown-option
// error only suggests nearby names, so it cannot enumerate named arguments.
function signatureParts(text) {
  const parts = [];
  let start = 0, depth = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) { if (text[i + 1] === quote) i++; else quote = null; }
    } else if (char === '"' || char === "'") quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
    if (depth < 0) return null;
  }
  if (quote || depth !== 0) return null;
  parts.push(text.slice(start).trim());
  return parts;
}

function parseSignatureBinding(row, diagnostic) {
  const candidates = diagnostic.split('Candidate functions:\n')[1]?.split('\n').filter(line => line.startsWith('\t'));
  if (!candidates?.length) return null;
  const layouts = [];
  for (const candidate of candidates) {
    const signature = candidate.trim().match(/^("(?:[^"]|"")*"|[\w]+)\((.*)\)$/);
    if (!signature) continue;
    const unquote = name => name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name;
    if (unquote(signature[1]) !== row.function_name) continue;
    const parts = signatureParts(signature[2]);
    if (!parts) continue;
    const positional = [], named = [], seen = new Set();
    let keywordOnly = false, kwargs = false, valid = true, variadic = null;
    for (const part of parts) {
      if (!part || part === '/') continue;
      if (part === '*') { keywordOnly = true; continue; }
      const parameter = part.match(/^(\*\*|\*)?("(?:[^"]|"")*"|[\w]+) (.+)$/);
      if (!parameter) { valid = false; break; }
      const [, prefix, quotedName, declaration] = parameter;
      const name = unquote(quotedName), type = declaration.split(/\s+:?=\s+/)[0];
      if (prefix === '**') { kwargs = true; continue; }
      if (prefix === '*') { variadic = type; keywordOnly = true; continue; }
      const index = row.parameters.indexOf(name);
      if (index < 0 || row.parameter_types[index] !== type || seen.has(name)) { valid = false; break; }
      seen.add(name);
      (keywordOnly ? named : positional).push(name);
    }
    if (!valid || variadic !== row.varargs) continue;
    // The catalog enumerates typed **kwargs options after the fixed parameters.
    const options = row.parameters.filter(name => !seen.has(name));
    if (options.length && !kwargs) continue;
    named.push(...options);
    layouts.push({ positional, named });
  }
  const unique = new Map(layouts.map(layout => [JSON.stringify(layout), layout]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export function signatureBindingQuery(row, overloads = [row]) {
  // Too many positional arguments prevents fixed-arity functions from binding.
  const quote = name => `"${name.replaceAll('"', '""')}"`;
  const args = row.varargs
    ? row.parameters.map(name => `${quote(name)} := NULL::STRUCT(__guide_invalid_type__ INTEGER)`)
    : Array(Math.max(...overloads.filter(other => other.function_name === row.function_name).map(other => other.parameters.length)) + 1).fill('NULL');
  if (row.parameter_types.includes('TABLE')) args[0] = '(SELECT 1)';
  return `EXPLAIN SELECT * FROM ${quote(row.function_name)}(${args.join(', ')});`;
}

export function bindingQuery(row) {
  const positional = row.parameters.map((name, i) => ({ name, type: row.parameter_types[i] }))
    .filter(arg => /^col\d+$/.test(arg.name)).sort((a, b) => Number(a.name.slice(3)) - Number(b.name.slice(3)));
  if (row.description || positional.some((arg, i) => arg.name !== `col${i}` || !arg.type || !/^[\w\s[\](),]+$/.test(arg.type))) return null;
  const args = positional.map(arg => ['ANY', 'TABLE', 'POINTER'].includes(arg.type) ? 'NULL' : `NULL::${arg.type}`);
  args.push('__guide_invalid_named_parameter__ := NULL');
  return `EXPLAIN SELECT * FROM "${row.function_name.replaceAll('"', '""')}"(${args.join(', ')});`;
}

export function extensionDirectorySQL(directory, engineVersion) {
  const quoted = `'${directory.replaceAll("'", "''")}'`;
  return Number(engineVersion.replace(/^v/, '').split('.')[0]) >= 2
    ? `SET extension_directories = [${quoted}];`
    : `SET extension_directory = ${quoted};`;
}

export function captureBindings({ binary, snapshot, root }) {
  const hash = createHash('sha256').update(readFileSync(binary)).digest('hex');
  if (hash !== snapshot.binarySha256) throw new Error('Binding capture must use the exact catalog binary.');
  const extensionDirectory = resolve(root, '.cache/extensions', `${snapshot.engine}-${hash.slice(0, 16)}`);
  const prelude = extensionDirectorySQL(extensionDirectory, snapshot.engineVersion) + '\n' + snapshot.requestedExtensions.map(name => `LOAD "${name.replaceAll('"', '""')}";`).join('\n');
  const overloads = {};
  const unresolved = [];
  const tableFunctions = snapshot.functions.filter(row => row.function_type === 'table');
  const fullSignatures = Number(snapshot.engineVersion.replace(/^v/, '').split('.')[0]) >= 2;
  for (const row of tableFunctions) {
    const id = overloadId(row);
    // Use the same version-specific binder evidence as the WASM capture.
    const query = fullSignatures ? signatureBindingQuery(row, tableFunctions) : bindingQuery(row);
    if (!query) { unresolved.push(id); continue; }
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
