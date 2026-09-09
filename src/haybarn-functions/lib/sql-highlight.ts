// Presentation only: SQL is still passed unchanged to the engine's parser.
const keywords = /^(?:select|from|where|as|with|group|by|order|limit|having|join|on|and|or|not|null|true|false|lambda|date|timestamp|interval|values|create|table|insert|into|case|when|then|else|end|distinct|asc|desc|set|load|install|cast|over|partition|filter|exclude|qualify|union|all)$/i;

export function highlightSQL(sql: string): { text: string; kind: string }[] {
  const pattern = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b(?:select|from|where|as|with|group|by|order|limit|having|join|on|and|or|not|null|true|false|lambda|date|timestamp|interval|values|create|table|insert|into|case|when|then|else|end|distinct|asc|desc|set|load|install|cast|over|partition|filter|exclude|qualify|union|all)\b|\b\d+(?:\.\d+)?\b|\b[a-z_]\w*(?=\s*\()/gi;
  const tokens: { text: string; kind: string }[] = [];
  let end = 0;
  for (const match of sql.matchAll(pattern)) {
    if (match.index! > end) tokens.push({ text: sql.slice(end, match.index), kind: '' });
    const text = match[0];
    const kind = text.startsWith('--') || text.startsWith('/*') ? 'comment' : /^["']/.test(text) ? 'string' : /^\d/.test(text) ? 'number' : keywords.test(text) ? 'keyword' : 'function';
    tokens.push({ text, kind });
    end = match.index! + text.length;
  }
  if (end < sql.length) tokens.push({ text: sql.slice(end), kind: '' });
  return tokens;
}
