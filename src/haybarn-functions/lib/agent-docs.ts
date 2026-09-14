import { snapshots, defaultSnapshot, getFunctions, getFunction, functionUrl, formatSignature, signatureKey, compareSnapshots, type Snapshot, type FunctionDoc, type Overload } from './catalog';
import { orderedOverloads, overloadId, catalogExamples } from './reference';
import { recipesFor } from '../data/recipes';
import { wasmVersion } from '../data/settings';
import { argumentLayout } from './arguments';
import { translationsFor, usesSameFunction } from './translations';
import { runnableExamplesFor } from './examples';
import { documentationFor } from './upstream-docs';
import { operatorNotation, isOperatorName } from '../../../scripts/haybarn-functions/notation.mjs';

export const apiVersion = 1;
export function functionJsonUrl(snapshot: Snapshot, fn: { slug: string }) { return `/products/haybarn/functions/api/v1/${snapshot.id}/functions/${fn.slug}.json`; }
export function functionMarkdownUrl(snapshot: Snapshot, fn: { slug: string }) { return `${functionUrl(snapshot, fn, true)}index.md`; }
export function indexJsonUrl(snapshot: Snapshot) { return `/products/haybarn/functions/api/v1/${snapshot.id}/functions.json`; }
export function indexMarkdownUrl(snapshot: Snapshot) { return `/products/haybarn/functions/releases/${snapshot.id}/index.md`; }
export function comparisonJsonUrl(from: Snapshot, to: Snapshot) { return `/products/haybarn/functions/api/v1/compare/${from.id}/${to.id}.json`; }
export function snapshotMetadata(snapshot: Snapshot) {
  const { functions: _functions, ...metadata } = snapshot;
  return metadata;
}
export const interpretation = [
  'Choose a snapshot matching the target engine and build. The default is captured from the published Haybarn WASM package used by the browser playground. Historical native snapshots are also available.',
  'Availability is an observation in the recorded build and extension profile, not a guarantee of support in every installation or in WASM.',
  'Types and descriptions are declarations from duckdb_functions(). Binding can specialize result types. Null means not supplied by the catalog; do not invent defaults, optionality, argument mode, or table output columns.',
  'Raw parameter arrays preserve catalog order for scalar/aggregate/macro functions. Raw table arguments are alphabetical. Use callingConvention for engine-confirmed positional order and named arguments; null modes are unrecorded. Named does not mean optional. Macro defaults and special named variadic behavior are not supplied by duckdb_functions().',
  'Catalog examples are source material and may require data or extensions. runnableExamples contains separately verified SQL for the pinned WASM package; sample-data adaptations and guide examples are labeled separately.',
  'Guide annotations and recipes are separate editorial content. The browser runner always uses Haybarn WASM ' + wasmVersion + ', independently of the documentation snapshot.',
  'All URLs beginning with / are relative to the origin hosting this document. Exports require no JavaScript, cookies, API key, or browser engine.',
];

export function exportManifest() {
  return {
    schemaVersion: apiVersion,
    defaultSnapshot: defaultSnapshot.id,
    resources: { guide: '/products/haybarn/functions/agents/', discovery: '/products/haybarn/functions/llms.txt', functionSchema: '/products/haybarn/functions/api/v1/function.schema.json', search: '/products/haybarn/functions/api/v1/search.json' },
    browserRuntime: { engine: 'haybarn-wasm', packageVersion: wasmVersion, matchesDocumentationSnapshot: defaultSnapshot.runtime?.packageVersion === wasmVersion },
    interpretation,
    snapshots: snapshots.map(snapshot => ({ ...snapshotMetadata(snapshot), functionCount: getFunctions(snapshot).length,
      overloadCount: snapshot.functions.length, index: indexJsonUrl(snapshot), markdownIndex: indexMarkdownUrl(snapshot) })),
    comparisons: snapshots.flatMap(from => snapshots.filter(to => to.id !== from.id).map(to => ({ from: from.id, to: to.id, json: comparisonJsonUrl(from, to) }))),
  };
}

export function exportIndex(snapshot: Snapshot) {
  return {
    schemaVersion: apiVersion, snapshot: snapshotMetadata(snapshot),
    functions: getFunctions(snapshot).map(fn => ({ name: fn.name, slug: fn.slug, description: fn.description || null,
      category: fn.category, kinds: fn.kinds, aliasOf: fn.aliases, overloadCount: fn.overloads.length,
      inputTypes: [...new Set(fn.overloads.flatMap(row => row.parameter_types))],
      returnTypes: [...new Set(fn.overloads.map(row => row.return_type))],
      otherEngineNames: translationsFor(fn.name).filter(row => row.relation === 'direct').flatMap(({ source }) => source.names.map(name => ({ engine: source.engine, name }))),
      links: { html: functionUrl(snapshot, fn, true), markdown: functionMarkdownUrl(snapshot, fn), json: functionJsonUrl(snapshot, fn) },
    })),
  };
}

function exportOverload(row: Overload, snapshot: Snapshot, fn: { slug: string }) {
  const layout = argumentLayout(row, snapshot);
  return { id: overloadId(row), url: `${functionUrl(snapshot, fn, true)}#${overloadId(row)}`,
    signature: formatSignature(row, snapshot),
    parameterOrder: row.function_type === 'table' ? 'alphabetical-not-call-order' : 'catalog-order',
    callingConvention: { ...layout, positional: layout.source ? layout.positional : null, named: layout.source ? layout.named : null },
    syntax: { kind: isOperatorName(row.function_name) ? 'operator' : 'function', operator: operatorNotation(row) },
    // The supplemental binder evidence stays outside the unmodified catalog row.
    catalog: row,
  };
}

export function exportFunction(snapshot: Snapshot, fn: FunctionDoc) {
  const selectedKeys = new Set(fn.overloads.map(signatureKey));
  return {
    $schema: '/products/haybarn/functions/api/v1/function.schema.json', schemaVersion: apiVersion,
    name: fn.name, schema: 'main', slug: fn.slug,
    description: fn.description || null, category: fn.category, kinds: fn.kinds, aliasOf: fn.aliases,
    snapshot: snapshotMetadata(snapshot),
    links: { html: functionUrl(snapshot, fn, true), markdown: functionMarkdownUrl(snapshot, fn), json: functionJsonUrl(snapshot, fn) },
    interpretation,
    overloads: orderedOverloads(fn).map(row => exportOverload(row, snapshot, fn)),
    editorial: { argumentNotes: [] as { name: string; note: string; overloadIds: string[] }[],
      recipes: recipesFor(fn.name).map(recipe => ({ id: recipe.id, title: recipe.title, description: recipe.description,
        sql: recipe.sql, source: 'guide-recipe', verification: null, intendedRuntime: { engine: 'haybarn-wasm', packageVersion: wasmVersion } })),
    },
    examples: catalogExamples(fn).map(example => ({ ...example, source: 'engine-catalog', verification: null })),
    translations: translationsFor(fn.name),
    runnableExamples: runnableExamplesFor(fn.name),
    additionalDocumentation: documentationFor(fn),
    availability: snapshots.map(release => {
      const found = getFunction(release, fn.name);
      return { snapshot: release.id, observed: Boolean(found), overloadCount: found?.overloads.length ?? 0,
        matchingOverloadIds: found?.overloads.filter(row => selectedKeys.has(signatureKey(row))).map(overloadId) ?? [],
        json: found ? functionJsonUrl(release, found) : null,
      };
    }),
  };
}

export function exportComparison(from: Snapshot, to: Snapshot) {
  const diff = compareSnapshots(from, to) as {
    added: FunctionDoc[]; removed: FunctionDoc[];
    changed: (FunctionDoc & { addedSignatures: Overload[]; removedSignatures: Overload[] })[];
  };
  return {
    schemaVersion: apiVersion, from: snapshotMetadata(from), to: snapshotMetadata(to), interpretation,
    added: diff.added.map(fn => ({ name: fn.name, json: functionJsonUrl(to, fn), overloads: fn.overloads.map(row => exportOverload(row, to, fn)) })),
    removed: diff.removed.map(fn => ({ name: fn.name, json: functionJsonUrl(from, fn), overloads: fn.overloads.map(row => exportOverload(row, from, fn)) })),
    changed: diff.changed.map(fn => ({ name: fn.name, before: functionJsonUrl(from, fn), after: functionJsonUrl(to, fn),
      addedSignatures: fn.addedSignatures.map(row => exportOverload(row, to, fn)),
      removedSignatures: fn.removedSignatures.map(row => exportOverload(row, from, fn)),
    })),
  };
}

function fence(text: string, language = '') {
  const width = Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1));
  const delimiter = '`'.repeat(width);
  return `${delimiter}${language}\n${text}\n${delimiter}`;
}
function cell(text: string) { return text.replaceAll('|', '\\|').replaceAll('\n', ' '); }

export function functionMarkdown(snapshot: Snapshot, fn: FunctionDoc) {
  const doc = exportFunction(snapshot, fn);
  const lines = [
    `# ${fn.name} — ${snapshot.label}`, '', fn.description || 'No description supplied by the engine.', '',
    `- Reference: ${doc.links.html}`, `- JSON: ${doc.links.json}`, `- Snapshot ID: ${snapshot.id}`,
    `- Engine: ${snapshot.engine} ${snapshot.engineVersion}`, `- Source ID: ${snapshot.sourceId}`,
    `- Binary SHA-256: ${snapshot.binarySha256}`, `- Captured: ${snapshot.capturedAt}`,
    `- Source: ${snapshot.source}`, `- Loaded extensions: ${snapshot.loadedExtensions.map(extension => extension.extension_name).join(', ')}`,
    ...(fn.aliases.length ? [`- Alias of: ${fn.aliases.join(', ')}`] : []),
    '', '## Interpretation', '', ...interpretation.map(note => `- ${note}`), '', '## Overloads', '',
  ];
  for (const overload of doc.overloads) {
    const row = overload.catalog;
    lines.push(`### ${overload.id}`, '', `Kind: ${row.function_type}. Parameter order: ${overload.parameterOrder}.`, '',
      fence(overload.signature, 'text'), '', `Link: ${overload.url}`, '',
      '| Argument | Catalog type | Calling mode |', '| --- | --- | --- |',
      ...overload.callingConvention.parameters.map(arg => `| ${cell(arg.name)} | ${cell(arg.type ?? 'unknown')} | ${arg.mode ?? 'not recorded'}${arg.position !== null ? ` (position ${arg.position + 1})` : ''} |`), '',
      `Declared return type: ${row.return_type ?? 'unknown'}. Variadic argument type: ${row.varargs ?? 'none declared'}.`,
      `Stability: ${row.stability ?? 'unknown'}. Declared side effects: ${row.has_side_effects ?? 'unknown'}.`, '',
    );
    if (row.description && row.description !== fn.description) lines.push(row.description, '');
    if (row.macro_definition) lines.push('Macro definition:', '', fence(row.macro_definition, 'sql'), '');
  }
  lines.push('', '## Guide recipes', '');
  for (const recipe of doc.editorial.recipes) lines.push(`### ${recipe.title}`, '', recipe.description, '',
    `Intended runtime: Haybarn WASM ${wasmVersion}. Per-example execution verification: not recorded in this export.`, '', fence(recipe.sql, 'sql'), '');
  if (!doc.editorial.recipes.length) lines.push('No guide recipes.', '');
  lines.push('## Engine catalog examples', '', 'Source examples may require additional data or extensions. Expressions are wrapped in SELECT; execution verification is not recorded.', '');
  for (const example of doc.examples) lines.push(`Reported for: ${example.overloadIds.join(', ')}`, '', fence(example.sql, 'sql'), '');
  if (!doc.examples.length) lines.push('No catalog examples.', '');
  if (doc.runnableExamples.length) {
    lines.push('## Runnable examples', '', `Executed successfully in Haybarn WASM ${wasmVersion}. Sample data and guide examples are separate from the original catalog.`, '');
    for (const example of doc.runnableExamples) lines.push(fence(example.sql, 'sql'), '');
  }
  if (doc.additionalDocumentation.length) lines.push('## Additional DuckDB documentation', '', ...doc.additionalDocumentation.map(link => `- [${link.title}](${link.url})`), '');
  if (doc.translations.length) {
    lines.push('## In other engines', '');
    for (const translation of doc.translations) {
      lines.push(`### ${translation.source.engine}${translation.source.name ? `: ${translation.source.name}()` : ''}`, '');
      if (usesSameFunction(translation)) {
        lines.push('Same function. The SQLGlot example uses the same call in both engines.', '', fence(translation.source.sql, 'sql'), '');
      } else {
        lines.push(translation.relation === 'rewrite' ? `Uses ${fn.name} as part of a larger rewrite.` : translation.scope, '',
          `${translation.source.engine}:`, '', fence(translation.source.sql, 'sql'), '',
          'Haybarn / DuckDB:', '', fence(translation.target.sql, 'sql'), '');
      }
      lines.push(`Translation from [SQLGlot](${translation.provenance.url}).`, '');
    }
  }
  lines.push('## Observed availability', '', '| Snapshot | Observed | Overloads | JSON |', '| --- | --- | --- | --- |',
    ...doc.availability.map(row => `| ${row.snapshot} | ${row.observed ? 'present' : 'not observed'} | ${row.overloadCount} | ${row.json ? `[reference](${row.json})` : '—'} |`), '',
    'Engine catalog documentation is derived from MIT-licensed Haybarn and DuckDB. [Notices](/third-party-notices.txt).', '');
  return lines.join('\n');
}

export function indexMarkdown(snapshot: Snapshot) {
  return [`# ${snapshot.label} function index`, '', `> ${getFunctions(snapshot).length} function names observed in ${snapshot.engineVersion}, source ID ${snapshot.sourceId}.`, '',
    `For accepted argument and return types, fetch the [structured index](${indexJsonUrl(snapshot)}).`, '',
    '## Functions', '', ...getFunctions(snapshot).map(fn => `- [${fn.name}](${functionMarkdownUrl(snapshot, fn)}): ${fn.description.replace(/\s+/g, ' ') || 'No description supplied.'}`), ''].join('\n');
}

export function discoveryMarkdown() {
  return ['# Haybarn Function Guide', '', '> SQL function reference extracted from Haybarn and DuckDB engine catalogs, with exact recorded signatures, examples, provenance, and observed release comparisons.', '',
    `Default snapshot: ${defaultSnapshot.label} (${defaultSnapshot.id}). Choose a snapshot before generating SQL. The browser runner uses Haybarn WASM ${wasmVersion}.`, '',
    ...interpretation.map(note => `- ${note}`), '', '## Start here', '',
    '- [Agent guide](/products/haybarn/functions/agents/index.md): Fetch workflow, endpoint contract, and interpretation rules.',
    '- [Release manifest](/products/haybarn/functions/api/v1/releases.json): Snapshot provenance, type-searchable indexes, and comparison URLs.',
    '- [Function search](/products/haybarn/functions/api/v1/search.json?q=list_transform): Server-side search across signatures, arguments, examples, and translations. Pass release=all to include every snapshot.',
    '- [Function JSON schema](/products/haybarn/functions/api/v1/function.schema.json): Version 1 function document contract.', '',
    '## Snapshot indexes', '', ...snapshots.map(snapshot => `- [${snapshot.label}](${indexMarkdownUrl(snapshot)}): Function names, descriptions, and links to individual Markdown references.`), '',
    '## Optional', '', '- [Source notices](/third-party-notices.txt): Engine and documentation licensing.', ''].join('\n');
}

export const agentGuideMarkdown = () => `# Using the Haybarn Function Guide from an agent

Start at /products/haybarn/functions/llms.txt or /products/haybarn/functions/api/v1/releases.json. Resolve paths beginning with / against the origin serving this document.

## Retrieval workflow

1. GET /products/haybarn/functions/api/v1/releases.json. Select the snapshot for the target engine and build; use its source ID and loaded extensions to assess applicability.
2. GET /products/haybarn/functions/api/v1/search.json?q=TERM&release=SNAPSHOT to search signatures, arguments, examples, and translations, or fetch the snapshot's full index URL and match locally. Use release=all only when cross-release results are wanted.
3. Follow the function's links.json for structured metadata or links.markdown for prose and SQL. Each overload includes a stable id and a human reference URL with the same fragment.
4. Read the selected overload's catalog fields and callingConvention. A function can have multiple kinds and arities. Raw table parameter arrays are alphabetical; callingConvention separates positional and named arguments using recorded binder evidence. Variadic types come from catalog.varargs. Defaults, minimum variadic counts and special named variadic behavior remain unknown.
5. For a migration, follow a comparison URL in the manifest. Inspect addedSignatures and removedSignatures for the specific function; description-only changes are not signature changes.

## Contract

All responses are generated from the same snapshots used by the HTML reference. schemaVersion is 1. The function schema is at /products/haybarn/functions/api/v1/function.schema.json. Function overload catalog fields preserve duckdb_functions() names, arrays, and nulls. Editorial guidance lives under editorial. Examples under examples originate in the engine catalog; verification: null means no execution evidence is recorded in the export.

The browser runtime is Haybarn WASM ${wasmVersion}. Exported docs, comparisons, and search are read-only resources generated from committed snapshots at the edge. There is no HTTP SQL execution endpoint and no authentication requirement.

## Interpretation

${interpretation.map(note => `- ${note}`).join('\n')}

## Resources

- [Discovery](/products/haybarn/functions/llms.txt)
- [Release manifest](/products/haybarn/functions/api/v1/releases.json)
- [Function schema](/products/haybarn/functions/api/v1/function.schema.json)
- [Function search](/products/haybarn/functions/api/v1/search.json?q=list_transform)
- [Default catalog](${indexJsonUrl(defaultSnapshot)})
- [Example function](${functionJsonUrl(defaultSnapshot, getFunction(defaultSnapshot, 'list_transform')!)})
`;

export function jsonResponse(value: unknown) { return new Response(JSON.stringify(value, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
export function markdownResponse(text: string) { return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }); }
