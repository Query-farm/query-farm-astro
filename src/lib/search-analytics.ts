// What visitors search for, recorded as GA4's recommended `search` event.
// `search_term` fills GA4's built-in "Search term" dimension; `search_area`
// says which search box it came from and `search_results` how many results it
// found, so a 0 marks something people want that the site doesn't answer.
//
// Search boxes update as the visitor types, so one event is sent per settled
// query: after they pause, never for each keystroke, and not again for the
// same query. All search widgets, including the site modal, share this helper.

type Gtag = (...args: unknown[]) => void;

/** Returns a function to call with every query a search box runs. */
export function searchTracker(area: string, settleMs = 1500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  return (term: string, results: number) => {
    clearTimeout(timer);
    const query = term.trim().slice(0, 100);
    if (!query) return;
    timer = setTimeout(() => {
      if (query.toLowerCase() === last) return;
      last = query.toLowerCase();
      (window as unknown as { gtag?: Gtag }).gtag?.('event', 'search', { search_term: query, search_area: area, search_results: results });
    }, settleMs);
  };
}
