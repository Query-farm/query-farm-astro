// Generate the vgi-typescript API reference MDX from the TypeScript compiler API.
//
// The TypeScript counterpart of scripts/gen-api-go/main.go and
// scripts/gen-api-mdx.py. Like Go — and unlike Python, where a page is a module
// — vgi-typescript's public surface is one barrel (src/index.ts) re-exporting
// ~390 symbols from ~65 files, so pages are curated topic groups. GROUPS below
// is the source of truth for which pages exist; keep the astro.config.mjs
// sidebar in sync with it.
//
// Two audits gate the run and both exit non-zero:
//   - every exported symbol lands on exactly one page;
//   - every src/ file that declares an exported symbol belongs to a group, so a
//     new module upstream cannot silently vanish from the reference.
//
// Usage: node --experimental-strip-types main.ts <vgi-typescript-root> <out-dir>

import ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';

const SOURCE_BASE = 'https://github.com/Query-farm/vgi-typescript/blob/main/';
const VGI_RPC_DOCS = 'https://vgi-rpc.query.farm/';

// ── page groups ─────────────────────────────────────────────────────────────

interface Group {
  slug: string;
  title: string;
  blurb: string;
  /** Source files (repo-relative, no extension) whose exports land on this page. */
  files: string[];
}

const GROUPS: Group[] = [
  {
    slug: 'scalar',
    title: 'Scalar functions',
    blurb: 'One row in, one value out — the simplest function shape.',
    files: ['src/functions/scalar'],
  },
  {
    slug: 'table',
    title: 'Table functions',
    blurb: 'Set-returning producers, with the optimizer hooks that make them fast.',
    files: ['src/functions/table'],
  },
  {
    slug: 'table-in-out',
    title: 'Table-in-out functions',
    blurb: 'Streaming a relation through, batch by batch.',
    files: ['src/functions/table-in-out'],
  },
  {
    slug: 'table-buffering',
    title: 'Buffering functions',
    blurb: 'Sink, combine, source — for output that depends on the whole input.',
    files: ['src/functions/table-buffering'],
  },
  {
    slug: 'aggregate',
    title: 'Aggregate functions',
    blurb: 'Per-group accumulation: update, combine, finalize.',
    files: ['src/functions/aggregate'],
  },
  {
    slug: 'copy',
    title: 'COPY formats',
    blurb: 'Reading and writing your own format through COPY … FROM / TO.',
    files: ['src/functions/copy-from', 'src/functions/copy-to'],
  },
  {
    slug: 'worker',
    title: 'Worker & serving',
    blurb: 'Building a worker and putting it on a transport.',
    files: [
      'src/worker',
      'src/serve-entry',
      'src/worker-cf-entry',
      'src/protocol/dispatch',
      'src/http/landing',
      'src/http/serve',
      'src/http/fetch',
    ],
  },
  {
    slug: 'catalog',
    title: 'Catalogs',
    blurb: 'Presenting a worker as a database: schemas, tables, views, macros.',
    files: [
      'src/catalog/interface',
      'src/catalog/descriptors',
      'src/catalog/read-only',
      'src/catalog/composite',
      'src/catalog/attach-option',
      'src/catalog/attach-options',
      'src/generated/vgi-client',
    ],
  },
  {
    slug: 'arguments',
    title: 'Arguments',
    blurb: 'Declaring a signature, and reading the values that arrive.',
    files: ['src/arguments/arguments', 'src/arguments/argument-spec'],
  },
  {
    slug: 'arrow-types',
    title: 'Arrow types',
    blurb: 'The type factories, the erased facade shapes, and the predicates that discriminate them.',
    files: ['src/arrow/schema-types', 'src/arrow/predicates', 'src/arrow/types', 'src/arrow/index'],
  },
  {
    slug: 'codec',
    title: 'Value representations',
    blurb: 'rich vs raw, the branded unit types, and the codec that converts between them.',
    files: [
      'src/arrow/codec/branded',
      'src/arrow/codec/type-descriptors',
      'src/arrow/codec/registry',
      'src/arrow/codec/repr',
      'src/arrow/codec/index',
    ],
  },
  {
    slug: 'arrow-helpers',
    title: 'Batch helpers',
    blurb: 'Building, reading, projecting and serializing record batches.',
    files: [
      'src/arrow/impl-arrowjs/index',
      'src/arrow/impl-arrowjs/build',
      'src/arrow/impl-arrowjs/iterate',
      'src/arrow/impl-arrowjs/ipc',
      'src/arrow/impl-arrowjs/project',
      'src/arrow/impl-arrowjs/filter',
      'src/arrow/impl-arrowjs/empty',
      'src/arrow/impl-arrowjs/statistics',
      'src/arrow/impl-arrowjs/canonical',
      'src/util/arrow/index',
      'src/util/bytes',
      'src/util/statistics',
    ],
  },
  {
    slug: 'cache-control',
    title: 'Cache control',
    blurb: 'Advertising a result as reusable by the client.',
    files: ['src/cache-control'],
  },
  {
    slug: 'filter-pushdown',
    title: 'Filter pushdown',
    blurb: 'Receiving the predicates DuckDB pushed toward the scan.',
    files: [
      'src/filter-pushdown/index',
      'src/filter-pushdown/types',
      'src/filter-pushdown/evaluate',
      'src/filter-pushdown/deserialize',
      'src/filter-pushdown/serialize',
      'src/filter-pushdown/collector',
    ],
  },
  {
    slug: 'storage',
    title: 'State storage',
    blurb: 'State that outlives one call, or crosses worker processes.',
    files: ['src/functions/storage', 'src/functions/storage-cf-do'],
  },
  {
    slug: 'client',
    title: 'Client',
    blurb: 'Calling a VGI worker from TypeScript, without DuckDB in the middle.',
    files: ['src/client/client', 'src/client/types', 'src/client/errors'],
  },
  {
    slug: 'errors',
    title: 'Errors',
    blurb: 'The typed errors a worker raises, and how they reach the caller.',
    files: ['src/errors'],
  },
  {
    slug: 'metadata',
    title: 'Protocol & metadata',
    blurb: 'Enums, protocol shapes, secrets, and the function metadata DuckDB reads.',
    files: [
      'src/types',
      'src/protocol/types',
      'src/protocol/state-serializer',
      'src/metadata/types',
      'src/metadata/resolve',
      'src/metadata/serialize',
      'src/functions/types',
      'src/functions/registry',
      'src/secrets/helpers',
      'src/generated/vgi-protocol-schemas',
    ],
  },
];

// ── helpers ─────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape a code fragment for a raw-HTML block.
 *
 * Braces matter as much as angle brackets here. Markdown protects `{` inside an
 * inline code span, but raw HTML in MDX gets no such protection: a signature
 * like `VgiBackendInfo = { name: "arrow-js" }` inside <pre><code> is parsed as a
 * JSX expression and fails the build with "Expected `,` or `)` but found `:`".
 */
function escCode(s: string): string {
  return escHtml(s).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

/**
 * Escape the Markdown that would otherwise fire inside prose we emit as
 * Markdown. Inline code spans are left alone: escaping inside them is not
 * merely unnecessary, it is wrong — the entity survives into the rendered
 * <code> and the reader sees `Record&lt;string&gt;`.
 */
function escMd(s: string): string {
  const parts = s.split(/(`[^`]*`)/);
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(/([<>{}])/g, '\\$1')))
    .join('');
}

/**
 * Flatten a declaration fragment onto one line. Field types are frequently
 * written across several — object literals, long unions, callback signatures —
 * and a definition-list term has to stay a term.
 */
function collapse(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** YAML-safe double-quoted scalar. */
function yamlStr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function kindOf(decl: ts.Declaration): string {
  if (ts.isInterfaceDeclaration(decl)) return 'interface';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (ts.isTypeAliasDeclaration(decl)) return 'type';
  if (ts.isEnumDeclaration(decl)) return 'enum';
  if (ts.isFunctionDeclaration(decl)) return 'function';
  if (ts.isVariableDeclaration(decl)) {
    const t = decl.initializer;
    if (t && (ts.isArrowFunction(t) || ts.isFunctionExpression(t))) return 'function';
    return 'const';
  }
  return 'const';
}

/** Map a symbol kind onto the CSS icon classes the API stylesheet already ships. */
function iconKind(kind: string): string {
  switch (kind) {
    case 'interface':
    case 'class':
    case 'enum':
      return 'class';
    case 'function':
      return 'function';
    default:
      return 'attribute';
  }
}

/** JSDoc body text, with @param/@returns tags dropped (rendered separately). */
function docOf(sym: ts.Symbol, checker: ts.TypeChecker): string {
  const parts = sym.getDocumentationComment(checker);
  return ts.displayPartsToString(parts).trim();
}

function tagsOf(sym: ts.Symbol): { name: string; text: string }[] {
  return sym.getJsDocTags().map((t) => ({
    name: t.name,
    text: ts.displayPartsToString(t.text ?? []).trim(),
  }));
}

/**
 * The declaration's source text with any implementation body removed. Printing
 * the real text rather than the checker's reconstruction keeps the author's
 * formatting, their inline comments, and their type parameter names.
 */
function signatureText(decl: ts.Declaration): string {
  const sf = decl.getSourceFile();
  const full = decl.getText(sf);

  if (ts.isFunctionDeclaration(decl) && decl.body) {
    const bodyStart = decl.body.getStart(sf) - decl.getStart(sf);
    return full.slice(0, bodyStart).trimEnd().replace(/\s*\{$/, '');
  }
  if (ts.isVariableDeclaration(decl)) {
    const init = decl.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      const b = (init as ts.ArrowFunction).body;
      if (b && ts.isBlock(b)) {
        const cut = b.getStart(sf) - decl.getStart(sf);
        return 'const ' + full.slice(0, cut).trimEnd().replace(/=>\s*$/, '=> { … }');
      }
    }
    // A plain const: show the declaration without a possibly huge initializer.
    if (init && init.getText(sf).length > 200) {
      return 'const ' + decl.name.getText(sf) + (decl.type ? ': ' + decl.type.getText(sf) : '');
    }
    return 'const ' + full;
  }
  if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
    // Header only; members are rendered individually below. Cut at the members'
    // own start position rather than the first `{` in the text — a type
    // parameter constrained to an object literal (`<T extends { id: string }>`)
    // puts a brace in the header.
    const cut = decl.members.pos - decl.getStart(sf);
    return full.slice(0, cut).trimEnd().replace(/\s*\{$/, '');
  }
  return full;
}

/**
 * The declared members of an interface, as a field list.
 *
 * The alternative — and what this generator used to do — is to print the whole
 * interface and let its JSDoc ride along inside the code block. On something
 * like `AggregateFunctionConfig` that is seventy lines of source in which every
 * explanation is a comment, and the page carries no prose at all. vgi-typescript
 * documents its surface on the *properties*, not on the declarations, so pulling
 * each property out is what turns those comments back into documentation.
 *
 * Call, construct and index signatures have no name to key a list on; they stay
 * in the full-source fallback, which is rendered alongside for every interface.
 */
function interfaceMembers(
  decl: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  isExternal: boolean,
  rel: string,
): Entry[] {
  const sf = decl.getSourceFile();
  const out: Entry[] = [];
  for (const m of decl.members) {
    if (!m.name) continue;
    const name = m.name.getText(sf);
    if (name.startsWith('_')) continue;
    const sym = checker.getSymbolAtLocation(m.name);

    // `getText()` starts at getStart(), which excludes leading JSDoc — so this
    // is the declaration without the comment we are about to render as prose.
    const text = m.getText(sf).replace(/[;,]\s*$/, '');
    // Split `name?: Type` into its two halves. A method signature has no `:`
    // before its parameter list, so fall back to everything after the name.
    const afterName = text.slice(text.indexOf(name) + name.length);
    const optional = /^\s*\?/.test(afterName);
    const type = afterName.replace(/^\s*\?/, '').replace(/^\s*:\s*/, '').trim();

    out.push({
      name,
      kind: optional ? 'optional' : 'required',
      sig: type,
      doc: sym ? docOf(sym, checker) : '',
      tags: sym ? tagsOf(sym) : [],
      source: null,
      members: [],
      external: isExternal,
      file: rel,
    });
  }
  return out;
}

function sourceLink(decl: ts.Declaration, root: string): string | null {
  const sf = decl.getSourceFile();
  const file = sf.fileName;
  if (file.includes('node_modules') || !file.startsWith(root)) return null;
  const rel = path.relative(root, file);
  const line = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1;
  return `${SOURCE_BASE}${rel}#L${line}`;
}

interface Entry {
  name: string;
  kind: string;
  sig: string;
  doc: string;
  tags: { name: string; text: string }[];
  source: string | null;
  members: Entry[];
  external: boolean;
  file: string;
}

// ── main ────────────────────────────────────────────────────────────────────

const root = path.resolve(process.argv[2] ?? path.join(process.env.HOME!, 'Development/vgi-typescript'));
const outRoot = path.resolve(process.argv[3] ?? '.');

const entryFile = path.join(root, 'src/index.ts');
const cfg = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
const program = ts.createProgram([entryFile], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();

const entrySf = program.getSourceFile(entryFile);
if (!entrySf) {
  console.error(`cannot load ${entryFile}`);
  process.exit(1);
}
const moduleSym = checker.getSymbolAtLocation(entrySf);
if (!moduleSym) {
  console.error('src/index.ts exports nothing the checker can see');
  process.exit(1);
}

const fileToGroup = new Map<string, Group>();
for (const g of GROUPS) for (const f of g.files) fileToGroup.set(f, g);

const collected = new Map<string, Entry[]>(); // group slug → entries
for (const g of GROUPS) collected.set(g.slug, []);

const external: Entry[] = [];
const unmapped = new Map<string, string[]>(); // file → symbol names

for (const sym of checker.getExportsOfModule(moduleSym)) {
  const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
  const decl = target.declarations?.[0];
  if (!decl) continue;

  const sf = decl.getSourceFile();
  const isExternal = sf.fileName.includes('node_modules') || !sf.fileName.startsWith(root);
  const rel = isExternal
    ? sf.fileName.replace(/^.*?(vgi-rpc[^/]*)\//, '$1/')
    : path.relative(root, sf.fileName).replace(/\.tsx?$/, '');

  // Both interfaces and classes show only their header; their members are
  // rendered individually below. (Interfaces used to print whole, which meant
  // their per-property JSDoc stayed trapped inside a code block — see
  // `interfaceMembers`.)
  const members: Entry[] = [];
  if (ts.isInterfaceDeclaration(decl)) {
    members.push(...interfaceMembers(decl, checker, isExternal, rel));
  }
  if (ts.isClassDeclaration(decl)) {
    const type = checker.getDeclaredTypeOfSymbol(target);
    for (const p of type.getProperties()) {
      const pd = p.declarations?.[0];
      if (!pd) continue;
      if (p.getName().startsWith('_')) continue;
      // Skip inherited members — they document on the base type's own page.
      if (pd.parent !== decl) continue;
      const mods = ts.getCombinedModifierFlags(pd as ts.Declaration);
      if (mods & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
      members.push({
        name: p.getName(),
        kind: ts.isMethodDeclaration(pd) || ts.isMethodSignature(pd) ? 'method' : 'property',
        sig: pd.getText(pd.getSourceFile()).split('\n').slice(0, 12).join('\n').replace(/\s*\{[\s\S]*$/, ''),
        doc: docOf(p, checker),
        tags: tagsOf(p),
        source: sourceLink(pd as ts.Declaration, root),
        members: [],
        external: isExternal,
        file: rel,
      });
    }
  }

  const entry: Entry = {
    name: sym.getName(),
    kind: kindOf(decl),
    sig: signatureText(decl),
    doc: docOf(target, checker),
    tags: tagsOf(target),
    source: sourceLink(decl, root),
    members,
    external: isExternal,
    file: rel,
  };

  if (isExternal) {
    external.push(entry);
    continue;
  }

  const g = fileToGroup.get(rel);
  if (!g) {
    if (!unmapped.has(rel)) unmapped.set(rel, []);
    unmapped.get(rel)!.push(sym.getName());
    continue;
  }
  collected.get(g.slug)!.push(entry);
}

// ── audit 1: every source file that exports something belongs to a group ────

if (unmapped.size > 0) {
  console.error('AUDIT FAILED — exported symbols in files that belong to no group:');
  for (const [file, names] of [...unmapped].sort()) {
    console.error(`  ${file}: ${names.sort().join(', ')}`);
  }
  console.error('\nAdd each file to a GROUPS entry in scripts/gen-api-ts/main.ts.');
  process.exit(1);
}

// ── render ──────────────────────────────────────────────────────────────────

/** A ``` fence rendered as a Starlight <Code>, plus the language if declared. */
function codeBlock(code: string, lang: string): string {
  const esc = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `<Code lang="${lang || 'ts'}" code={\`${esc}\`} />`;
}

/**
 * Render a JSDoc body to MDX.
 *
 * Fenced code blocks are pulled out and emitted as <Code> rather than left as
 * Markdown fences. Two reasons, and the second is the one that bites: a fence
 * keeps its braces literal, but the prose around it does not — MDX reads a bare
 * `{` as the start of a JSX expression — so prose and code need opposite
 * escaping, and the only safe way to get that is to separate them first.
 */
function renderDoc(text: string): string {
  if (!text) return '';
  const out: string[] = [];
  const fence = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const prose = text.slice(last, m.index).trim();
    if (prose) out.push(escMd(prose), '');
    out.push(codeBlock(m[2].trimEnd(), m[1]), '');
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push(escMd(tail), '');
  return out.join('\n');
}

function renderEntry(e: Entry, level: number): string {
  const h = '#'.repeat(level);
  const icon = iconKind(e.kind);
  const out: string[] = [];

  out.push(`<a id="${e.name}"></a>`);
  out.push(
    `${h} <span class="api-icon api-icon--${icon}"></span>` +
      `<span class="api-kind-tag api-kind-tag--${icon}">${e.kind}</span> \`${e.name}\``,
  );
  out.push('');
  if (e.source) {
    out.push(`<a class="api-source" href="${e.source}" target="_blank" rel="noopener">source</a>`);
    out.push('');
  }

  // Multi-line declarations go through Starlight's <Code>: raw HTML in MDX may
  // not contain a blank line, and interface bodies routinely do.
  const sig = e.sig.trimEnd();
  if (sig.includes('\n')) {
    out.push('<Code lang="ts" code={`' + sig.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`} />');
  } else {
    out.push(`<pre class="api-sig"><code>${escCode(sig)}</code></pre>`);
  }
  out.push('');

  if (e.doc) {
    out.push('<p class="api-section">Description</p>');
    out.push('');
    out.push(renderDoc(e.doc).trimEnd());
    out.push('');
  }

  const params = e.tags.filter((t) => t.name === 'param');
  const returns = e.tags.filter((t) => t.name === 'returns' || t.name === 'return');
  const examples = e.tags.filter((t) => t.name === 'example');
  const deprecated = e.tags.filter((t) => t.name === 'deprecated');

  if (deprecated.length) {
    out.push(`<p class="api-deprecated">Deprecated${deprecated[0].text ? ' — ' + escMd(deprecated[0].text) : ''}</p>`);
    out.push('');
  }
  if (params.length) {
    // `api-meta-block`/`api-label`/`api-deflist`/`api-pname` — the vocabulary
    // starlight-api.css actually styles. This block used to emit an
    // `api-params` class that exists in no stylesheet, so every @param on these
    // pages rendered as an unstyled browser-default <dl>.
    const rows = params
      .map((p) => {
        const [pname, ...rest] = p.text.split(/\s+/);
        return `<dt><code class="api-pname">${escCode(pname)}</code></dt><dd>${escCode(rest.join(' '))}</dd>`;
      })
      .join('');
    out.push(`<div class="api-meta-block"><p class="api-label">Parameters</p><dl class="api-deflist">${rows}</dl></div>`);
    out.push('');
  }
  if (returns.length && returns[0].text) {
    out.push('<p class="api-section">Returns</p>');
    out.push('');
    out.push(escMd(returns[0].text));
    out.push('');
  }
  for (const ex of examples) {
    if (!ex.text) continue;
    const code = ex.text.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
    out.push('<Code lang="ts" code={`' + code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`} />');
    out.push('');
  }

  // Interface members: a field list, not a wall of source. Required fields come
  // first — the reader has to supply those — with optional ones after, each
  // tagged so the `?` isn't something to hunt for inside the type text.
  const fields = e.members.filter((m) => m.kind === 'required' || m.kind === 'optional');
  if (fields.length) {
    const ordered = [
      ...fields.filter((f) => f.kind === 'required'),
      ...fields.filter((f) => f.kind === 'optional'),
    ];
    out.push('<p class="api-section">Fields</p>');
    out.push('');
    out.push('<dl class="api-fields">');
    out.push('');
    for (const f of ordered) {
      const opt = f.kind === 'optional' ? '<span class="api-fopt">optional</span>' : '';
      out.push(
        `<dt><code class="api-fname">${escCode(f.name)}</code>` +
          `<code class="api-ftype">${escCode(collapse(f.sig))}</code>${opt}</dt>`,
      );
      // An undocumented field gets no <dd> at all — valid in a <dl>, and it
      // keeps the many fields vgi-typescript leaves undocumented as a tight
      // name/type list rather than a column of empty rows.
      if (f.doc) {
        // A <dd> holding Markdown needs blank lines around it, so each one is
        // its own block rather than one concatenated string like @param rows.
        out.push('<dd>');
        out.push('');
        out.push(renderDoc(f.doc).trimEnd());
        out.push('');
        out.push('</dd>');
      }
      out.push('');
    }
    out.push('</dl>');
    out.push('');
  }

  if (e.members.length) {
    const methods = e.members.filter((m) => m.kind === 'method');
    const props = e.members.filter((m) => m.kind === 'property');
    for (const [label, list] of [
      ['Properties', props],
      ['Methods', methods],
    ] as const) {
      if (!list.length) continue;
      out.push(`<p class="api-section">${label}</p>`);
      out.push('');
      out.push('<div class="api-members">');
      out.push('');
      for (const m of list) {
        out.push('<div class="api-member">');
        out.push('');
        out.push(`<a id="${e.name}.${m.name}"></a>`);
        out.push(
          `${'#'.repeat(level + 1)} <span class="api-icon api-icon--${m.kind}"></span>` +
            `<span class="api-kind-tag api-kind-tag--${m.kind}">${m.kind}</span> \`${m.name}\``,
        );
        out.push('');
        if (m.source) {
          out.push(`<a class="api-source" href="${m.source}" target="_blank" rel="noopener">source</a>`);
          out.push('');
        }
        const ms = m.sig.trimEnd();
        if (ms.includes('\n')) {
          out.push('<Code lang="ts" code={`' + ms.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`} />');
        } else {
          out.push(`<pre class="api-sig"><code>${escCode(ms)}</code></pre>`);
        }
        out.push('');
        if (m.doc) {
          out.push(renderDoc(m.doc).trimEnd());
          out.push('');
        }
        out.push('</div>');
      }
      out.push('</div>');
      out.push('');
    }
  }

  return out.join('\n');
}

const outDir = path.join(outRoot, 'vgi/docs/typescript/api');
fs.mkdirSync(outDir, { recursive: true });

let totalRendered = 0;
for (const g of GROUPS) {
  const entries = collected.get(g.slug)!.sort((a, b) => a.name.localeCompare(b.name));
  totalRendered += entries.length;

  const body: string[] = [];
  body.push('---');
  body.push(`title: ${yamlStr(g.title)}`);
  body.push(`description: ${yamlStr(g.blurb)}`);
  body.push('---');
  body.push("import { Code } from '@astrojs/starlight/components';");
  body.push('');
  body.push('<div class="api-module-doc">');
  body.push('');
  body.push('<p class="api-module-doc__label">On this page</p>');
  body.push('');
  body.push(escMd(g.blurb));
  body.push('');
  body.push('</div>');
  body.push('');

  for (const e of entries) {
    const wrapper = e.members.length ? 'api-class' : 'api-member';
    body.push(`<div class="${wrapper}">`);
    body.push('');
    body.push(renderEntry(e, 2));
    body.push('</div>');
    body.push('');
  }

  fs.writeFileSync(path.join(outDir, `${g.slug}.mdx`), body.join('\n'));
}

// ── audit 2: everything the barrel exports was rendered somewhere ───────────

const accountedFor = totalRendered + external.length;
const exportCount = checker.getExportsOfModule(moduleSym).length;
if (accountedFor !== exportCount) {
  console.error(
    `AUDIT FAILED — ${exportCount} exports, but ${accountedFor} accounted for ` +
      `(${totalRendered} rendered + ${external.length} re-exported from vgi-rpc).`,
  );
  process.exit(1);
}

// ── the re-export page ──────────────────────────────────────────────────────
//
// These names are exported from @query-farm/vgi but DECLARED in vgi-rpc. They
// get a page of their own rather than being scattered: a reader looking up
// `int` needs to know why its docs live somewhere else, and `int`/`int32`/
// `float32`/`bool` in particular are the ones the README warns about.

{
  const byFile = new Map<string, Entry[]>();
  for (const e of external) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file)!.push(e);
  }
  const body: string[] = [];
  body.push('---');
  body.push('title: "Re-exported from vgi-rpc"');
  body.push('description: "Names @query-farm/vgi re-exports from the RPC layer, and where they are documented."');
  body.push('---');
  body.push("import { Code } from '@astrojs/starlight/components';");
  body.push('');
  body.push('<div class="api-module-doc">');
  body.push('');
  body.push('<p class="api-module-doc__label">On this page</p>');
  body.push('');
  body.push(
    `These names are importable from \`@query-farm/vgi\` but declared in ` +
      `[\`@query-farm/vgi-rpc\`](${VGI_RPC_DOCS}), the transport layer underneath. ` +
      `They are listed here so a lookup lands somewhere; the authority for their ` +
      `behaviour is vgi-rpc's own reference.`,
  );
  body.push('');
  body.push('</div>');
  body.push('');
  for (const [file, list] of [...byFile.entries()].sort()) {
    body.push(`<p class="api-section">${escHtml(file)}</p>`);
    body.push('');
    body.push('');
    for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
      body.push(`- \`${e.name}\`${e.doc ? ' — ' + escMd(e.doc.split('\n')[0]) : ''}`);
    }
    body.push('');
  }
  fs.writeFileSync(path.join(outDir, 'vgi-rpc-reexports.mdx'), body.join('\n'));
}

console.error(`wrote ${GROUPS.length + 1} pages to ${outDir}`);
console.error(`rendered ${totalRendered} symbols; ${external.length} re-exported from vgi-rpc`);
console.error('audits: OK (every export lands on a page; every exporting file has a group)');
console.error('sidebar slugs: ' + GROUPS.map((g) => `vgi/docs/typescript/api/${g.slug}`).join(', '));
