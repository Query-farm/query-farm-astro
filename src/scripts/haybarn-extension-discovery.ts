type Entry = {
  name: string; categories: string[]; queryFarm: boolean; searchText: string;
  availability: { version: string; platform: string }[];
};
type SearchResult = { data(): Promise<{ meta: { extension_slug?: string } }> };
type Pagefind = { search(query: string, options: unknown): Promise<{ results: SearchResult[] }>; filters(): Promise<Record<string, Record<string, number>>> };

function initialize() {
  const root = document.querySelector<HTMLElement>('[data-extension-directory]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  if (matchMedia('(max-width: 700px)').matches) root.querySelector('details.category-disclosure')?.removeAttribute('open');
  const entries: Entry[] = JSON.parse(document.getElementById('extension-directory-data')!.textContent!);
  const form = root.querySelector<HTMLFormElement>('form')!;
  const query = root.querySelector<HTMLInputElement>('#extension-query')!;
  const platform = root.querySelector<HTMLSelectElement>('#extension-platform')!;
  const publisher = root.querySelector<HTMLSelectElement>('#extension-publisher')!;
  const count = root.querySelector<HTMLElement>('#extension-result-count')!;
  const clear = root.querySelector<HTMLButtonElement>('.clear-filters')!;
  const empty = root.querySelector<HTMLElement>('.directory-empty')!;
  const results = root.querySelector<HTMLElement>('.extension-results')!;
  const articles = new Map([...root.querySelectorAll<HTMLElement>('[data-extension]')].map(article => [article.dataset.extension!, article]));
  const category = root.dataset.initialCategory || '';
  let search: Promise<Pagefind> | undefined;
  let request = 0;
  let timer: ReturnType<typeof setTimeout>;
  const fold = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  function readURL() {
    const params = new URL(location.href).searchParams;
    query.value = params.get('q') || '';
    for (const [key, select] of [['platform', platform], ['publisher', publisher]] as const) {
      const value = params.get(key) || '';
      select.value = [...select.options].some(option => option.value === value) ? value : '';
    }
  }
  function writeURL() {
    const url = new URL(location.href);
    url.searchParams.delete('release');
    for (const [key, value] of [['q', query.value.trim()], ['platform', platform.value], ['publisher', publisher.value]]) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
    root!.querySelectorAll<HTMLAnchorElement>('a[data-category]').forEach(link => {
      const href = new URL(link.href);
      href.search = url.search;
      link.href = href.toString();
    });
  }
  async function searchNames(term: string) {
    try {
      search ??= (async () => {
        const asset = '/pagefind/pagefind.js';
        const engine: Pagefind = await import(/* @vite-ignore */ asset);
        const filters = await engine.filters();
        if (!filters.kind?.['haybarn-extension']) throw new Error('Extension index not built yet');
        return engine;
      })();
      const engine = await search;
      const response = await engine.search(term, { filters: { kind: 'haybarn-extension' } });
      return (await Promise.all(response.results.map(result => result.data()))).map(data => data.meta.extension_slug).filter((name): name is string => !!name);
    } catch {
      // A fresh development checkout has no built Pagefind index yet. The
      // complete static list and its discovery terms still work offline.
      const words = fold(term).split(/\s+/).filter(Boolean);
      return entries.filter(entry => words.every(word => fold(entry.searchText).includes(word))).map(entry => entry.name);
    }
  }
  async function update(syncURL = true) {
    const current = ++request;
    const term = query.value.trim();
    const target = platform.value, author = publisher.value;
    if (syncURL) writeURL();
    const names = term ? await searchNames(term) : entries.map(entry => entry.name);
    if (current !== request) return;
    const ranked = new Map(names.map((name, index) => [name, index]));
    let shown = 0;
    const ordered = [...entries].sort((a, b) => (ranked.get(a.name) ?? Infinity) - (ranked.get(b.name) ?? Infinity));
    for (const entry of ordered) {
      const article = articles.get(entry.name)!;
      const availability = entry.availability.filter(item => !target || item.platform === target);
      const show = ranked.has(entry.name) && (!category || entry.categories.includes(category)) && availability.length > 0 && (!author || (author === 'query-farm' ? entry.queryFarm : !entry.queryFarm));
      article.hidden = !show;
      if (show) {
        shown++;
        article.querySelector('.release-label')!.textContent = 'Haybarn ' + [...new Set(availability.map(item => item.version))].join(' · ');
        const labels: Record<string, string> = { linux: 'Linux', osx: 'macOS', windows: 'Windows', wasm: 'WASM' };
        article.querySelector('.platform-label')!.textContent = [...new Set(availability.map(item => labels[item.platform.split('_')[0]]))].join(' · ');
      }
      results.append(article);
    }
    count.textContent = `${shown} ${shown === 1 ? 'extension' : 'extensions'}${term ? ` for “${term}”` : ''}`;
    empty.hidden = shown !== 0;
    clear.hidden = !term && !target && !author;
  }
  form.addEventListener('submit', event => { event.preventDefault(); void update(); });
  query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => void update(), 120); });
  for (const select of [platform, publisher]) select.addEventListener('change', () => void update());
  clear.addEventListener('click', () => { form.reset(); void update(); query.focus(); });
  root.querySelectorAll<HTMLAnchorElement>('[data-query]').forEach(link => link.addEventListener('click', event => {
    if (category) return;
    event.preventDefault(); query.value = link.dataset.query!; query.focus(); void update();
  }));
  window.addEventListener('popstate', () => { readURL(); void update(); });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    event.preventDefault(); query.focus();
  });
  readURL(); void update();
}
initialize();
document.addEventListener('astro:page-load', initialize);
