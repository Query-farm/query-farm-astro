/** Read exactly the SQL displayed by either of our code block renderers. */
export function exampleSql(pre: HTMLElement): string {
  const code = pre.querySelector('code');
  if (!code) return (pre.textContent ?? '').trim();
  // Expressive Code uses block elements instead of literal newlines.
  const lines = code.querySelectorAll(':scope > .ec-line');
  if (lines.length) return Array.from(lines, line => line.textContent ?? '').join('\n').trim();
  return (code.textContent ?? '').trim();
}

/** Explicit author annotations travel with the displayed/copyable SQL. */
export function browserUnavailableReason(sql: string): string | undefined {
  return /^\s*-- browser-unavailable: (.+)$/m.exec(sql)?.[1].trim();
}

export function expectedExampleError(sql: string): string | undefined {
  return /^\s*-- expect-error: (.+)$/m.exec(sql)?.[1].trim();
}
