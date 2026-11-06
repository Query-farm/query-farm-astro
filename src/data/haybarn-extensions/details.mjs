import { marked } from 'marked';

// Render maintainer prose as text, never as executable or unsanitized HTML.
function inlineText(tokens = []) {
  return tokens.map(token => {
    if (token.type === 'html' || token.type === 'image') return '';
    if (token.tokens) return inlineText(token.tokens);
    return token.text ?? token.raw ?? '';
  }).join('');
}

export function overviewParagraphs(markdown = '') {
  return marked.lexer(markdown).filter(token => token.type === 'paragraph')
    .map(token => inlineText(token.tokens).replace(/\s+/g, ' ').trim())
    .filter(text => text.length > 60 && text.length < 1800)
    .slice(0, 2);
}

// Only surface reference links supplied by the contributor. Never infer an API
// reference or turn arbitrary Markdown links into executable URLs.
export function documentationLinks(markdown = '') {
  const links = new Map();
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type !== 'link') return;
    const label = inlineText(token.tokens).replace(/\s+/g, ' ').trim();
    if (!/\b(functions?|reference|documentation|docs|guide|examples?|api)\b/i.test(label)) return;
    try {
      const url = new URL(token.href);
      if (!['https:', 'http:'].includes(url.protocol)) return;
      if (!links.has(url.href)) links.set(url.href, { href: url.href, label });
    } catch { /* Relative links need upstream context; leave them at the source. */ }
  });
  return [...links.values()].slice(0, 3);
}

export function exampleContext(code = '') {
  let purpose;
  for (const line of code.split('\n')) {
    if (!line.trim()) continue;
    const comment = /^\s*--\s+(.+)$/.exec(line)?.[1];
    if (!comment) break;
    if (!purpose && !/\b(install|load)\b|^(result|output|expected)/i.test(comment)) purpose = comment;
  }
  const results = [...code.matchAll(/^\s*--\s*(?:Result|Expected result|Output):\s*(\S[^\n]*)$/gim)];
  return { purpose, result: results.length === 1 ? results[0][1].trim() : undefined };
}

export function maintainerExample(name, source = '') {
  // Keep whole examples. Long walkthroughs remain available at the source.
  if (!source.trim() || source.length > 12_000) return null;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid extension name');
  // Our installation section supplies release-specific commands. Remove only
  // standalone commands for this extension, retaining dependency setup and SQL.
  const install = new RegExp(`^\\s*(?:FORCE\\s+)?INSTALL\\s+['"]?${name}['"]?(?:\\s+FROM\\s+community)?\\s*;\\s*(?:--.*)?$`, 'i');
  const load = new RegExp(`^\\s*LOAD\\s+['"]?${name}['"]?(?:\\s+FROM\\s+community)?\\s*;\\s*(?:--.*)?$`, 'i');
  const code = source.split('\n').filter(line => !install.test(line) && !load.test(line)).join('\n').trim();
  if (!code || !/\b(?:SELECT|FROM|CALL|CREATE|ATTACH|COPY|SET|PRAGMA)\b/i.test(code)) return null;
  return { code, lang: /[│┌└]|^D\s|```/m.test(code) ? 'text' : 'sql' };
}

export function installationSQL(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid extension name');
  return `INSTALL ${name} FROM community;\nLOAD ${name} FROM community;`;
}

export const artifactURL = (name, artifact) =>
  `https://haybarn-extensions.query.farm/community/v${artifact.version}/${artifact.platform}/${name}.duckdb_extension.${artifact.platform.startsWith('wasm_') ? 'wasm' : 'gz'}`;

// Match the platform and architecture labels in Query Farm's extension docs.
const platformLabels = {
  linux_amd64: ['Linux', 'x86_64'], linux_arm64: ['Linux', 'aarch64'],
  linux_amd64_musl: ['Linux (musl)', 'x86_64'], linux_arm64_musl: ['Linux (musl)', 'aarch64'],
  osx_amd64: ['macOS', 'Intel'], osx_arm64: ['macOS', 'Apple Silicon'],
  windows_amd64: ['Windows', 'x86_64'], windows_arm64: ['Windows', 'ARM64'], windows_amd64_mingw: ['Windows', 'x86_64 (MinGW)'],
  wasm_mvp: ['WASM', 'mvp'], wasm_eh: ['WASM', 'eh'], wasm_threads: ['WASM', 'threads'],
};
export function platformSupport(availability) {
  const groups = new Map();
  for (const artifact of availability) {
    const [platform, architecture] = platformLabels[artifact.platform] ?? [artifact.platform, artifact.platform];
    if (!groups.has(platform)) groups.set(platform, new Set());
    groups.get(platform).add(architecture);
  }
  return [...groups].map(([platform, architectures]) => ({ platform, architectures: [...architectures] }));
}
