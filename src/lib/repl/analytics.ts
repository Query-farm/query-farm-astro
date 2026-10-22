// GA4 events for the in-browser ("Try it" / "Run via WASM") shells, so the
// site can see which extensions people try, whether the WebAssembly engine
// loads for them and how long it takes, and whether they go on to run their
// own queries. SQL text is never sent: visitors can paste anything into the
// shell. gtag only exists in production, so these are no-ops elsewhere.
//
//   try_extension        a shell was opened
//   try_extension_ready  engine + extension loaded and the example ran
//   try_extension_failed the engine or the extension failed to load
//   try_query_run        the visitor ran a statement of their own

type Gtag = (...args: unknown[]) => void;

/** Where the shell was opened from, from the URL. */
export function tryPageType(pathname = location.pathname): string {
  if (pathname.startsWith('/blog/')) return 'blog';
  if (/^\/products\/extensions\/[^/]+\/functions\//.test(pathname)) return 'extension_function';
  if (pathname.startsWith('/products/extensions/')) return 'extension';
  if (pathname.startsWith('/vgi')) return 'vgi';
  return 'other';
}

export function trackTry(event: string, params: Record<string, string | number | boolean>) {
  (window as unknown as { gtag?: Gtag }).gtag?.('event', event, params);
}

/** Statement text compared loosely, to tell an edited query from the example. */
export function normalizeStatement(sql: string): string {
  return sql.replace(/^(\s*--[^\n]*\n)+/, '').replace(/;\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
