import type { Overload, Snapshot } from './catalog';
import { overloadId } from '../../../scripts/haybarn-functions/catalog.mjs';

interface BindingCapture {
  snapshot: string;
  binarySha256: string;
  source: 'engine-binder';
  overloads: Record<string, { positional: string[]; named: string[]; query: string; diagnostic: string }>;
}
export interface Argument {
  name: string;
  type: string | null;
  mode: 'positional' | 'named' | null;
  position: number | null;
}
const captures = Object.values(import.meta.glob<{ default: BindingCapture }>('../data/bindings/*.json', { eager: true })).map(module => module.default);

export function argumentLayout(row: Overload, snapshot?: Snapshot) {
  const capture = snapshot && captures.find(capture => capture.snapshot === snapshot.id && capture.binarySha256 === snapshot.binarySha256);
  const binding = capture?.overloads[overloadId(row)];
  const parameters: Argument[] = row.parameters.map((name, i) => ({ name, type: row.parameter_types[i],
    mode: binding ? binding.named.includes(name) ? 'named' : 'positional' : null,
    position: binding && binding.positional.includes(name) ? binding.positional.indexOf(name) : null,
  }));
  return {
    source: binding ? 'engine-binder' as const : null,
    parameters,
    positional: binding ? parameters.filter(arg => arg.mode === 'positional').sort((a, b) => a.position! - b.position!) : parameters,
    named: parameters.filter(arg => arg.mode === 'named'),
    variadic: row.varargs ? { type: row.varargs, minimumCount: null, maximumCount: null, namedArgumentMode: null } : null,
    evidence: binding ? { query: binding.query, diagnostic: binding.diagnostic } : null,
  };
}

export function signatureParts(row: Overload, snapshot?: Snapshot, includeTypes = true, compactNamed = false) {
  const layout = argumentLayout(row, snapshot);
  const type = (arg: Argument) => includeTypes ? `: ${arg.type ?? 'unknown'}` : '';
  const parts = layout.positional.map(arg => `${arg.name}${type(arg)}`);
  if (row.varargs) parts.push(includeTypes ? `…: ${row.varargs}` : '…');
  if (compactNamed && layout.named.length) parts.push('named arguments');
  else parts.push(...layout.named.map(arg => `${arg.name} := ${includeTypes ? arg.type ?? 'unknown' : '…'}`));
  return parts;
}
