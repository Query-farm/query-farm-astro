const SHELL_BASE = 'https://shell.duckdb.org/#queries=v0';
const STYLE_ID = 'ext-shell-button-style';
const ATTACHED_FLAG = 'shellButtonAttached';

const ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

const STYLE = `
.ext-shell-button {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  font-family: inherit;
  color: rgb(134, 239, 172);
  background: rgba(13, 40, 24, 0.9);
  border: 1px solid rgba(102, 187, 106, 0.25);
  border-radius: 0.25rem;
  backdrop-filter: blur(4px);
  text-decoration: none;
  cursor: pointer;
  z-index: 10;
  transition: color 120ms ease, border-color 120ms ease;
}
.ext-shell-button:hover {
  color: rgb(220, 252, 231);
  border-color: rgba(102, 187, 106, 0.55);
}
.ext-shell-button[data-offset-copy="true"] {
  right: 6.25rem;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function installFromClause(source: string): string {
  if (source === 'community') return 'FROM community';
  if (source.toLowerCase().startsWith('from ')) return source;
  return `FROM '${source}'`;
}

function snippetStartsWithInstall(snippet: string, name: string): boolean {
  const stripped = snippet
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)+/m, '')
    .trimStart();
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^INSTALL\\s+${escapedName}\\b`, 'i');
  return re.test(stripped);
}

// Symmetric character swap used by the duckdb-wasm shell when packing/unpacking
// queries in the URL hash. See packages/duckdb-wasm-shell/src/shell.ts in
// duckdb/duckdb-wasm — must be applied before encodeURIComponent.
function extraswaps(input: string): string {
  let res = '';
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === ' ') res += '-';
    else if (c === '-') res += ' ';
    else if (c === ';') res += '~';
    else if (c === '~') res += ';';
    else res += c;
  }
  return res;
}

function encodeSegment(sql: string): string {
  return encodeURIComponent(extraswaps(sql));
}

function buildShellUrl(name: string, source: string, snippet: string): string {
  const segments: string[] = [];
  if (!snippetStartsWithInstall(snippet, name)) {
    segments.push(`INSTALL ${name} ${installFromClause(source)};`);
    segments.push(`LOAD ${name};`);
  }
  segments.push(snippet);
  const encoded = segments.map(encodeSegment).join(',');
  return `${SHELL_BASE},${encoded}`;
}

function ensurePositionedHost(pre: HTMLElement): HTMLElement {
  const parent = pre.parentElement;
  if (parent && getComputedStyle(parent).position !== 'static') {
    return parent;
  }
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  pre.replaceWith(wrap);
  wrap.appendChild(pre);
  return wrap;
}

function attachButton(pre: HTMLElement, name: string, source: string): void {
  if (pre.dataset[ATTACHED_FLAG] === 'true') return;
  const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
  const trimmed = code.trim();
  if (!trimmed) return;
  pre.dataset[ATTACHED_FLAG] = 'true';

  const host = ensurePositionedHost(pre);
  const hasCopy = !!host.querySelector(':scope > .copy-button');

  const a = document.createElement('a');
  a.className = 'ext-shell-button';
  a.href = buildShellUrl(name, source, trimmed);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = 'Open in DuckDB WASM shell';
  a.setAttribute('aria-label', 'Open in DuckDB WASM shell');
  if (hasCopy) a.dataset.offsetCopy = 'true';
  a.innerHTML = `${ICON_SVG}<span>Open in shell</span>`;
  host.appendChild(a);
}

function setup(): void {
  const ctx = document.getElementById('extension-page-context');
  if (!ctx) return;
  const name = ctx.dataset.extensionName;
  if (!name) return;
  const source = ctx.dataset.installSource ?? 'community';

  ensureStyle();
  const blocks = document.querySelectorAll<HTMLElement>('pre[data-language="sql"]');
  blocks.forEach(pre => attachButton(pre, name, source));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
