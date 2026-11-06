import { searchTracker } from '../lib/search-analytics';
import { PAGE_SIZE, pageCount, directoryPagePath, pageNumbers, platformSummary } from '../data/haybarn-extensions/pagination.mjs';

type Entry = {
  name: string; categories: string[]; queryFarm: boolean; publisherId: string; searchText: string;
  displayName: string; href: string; description: string; icon: string;
  topics: { id: string; name: string }[];
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
  const publisher = root.querySelector<HTMLSelectElement>('#extension-publisher')!;
  const count = root.querySelector<HTMLElement>('#extension-result-count')!;
  const clear = root.querySelector<HTMLButtonElement>('.clear-filters')!;
  const empty = root.querySelector<HTMLElement>('.directory-empty')!;
  const results = root.querySelector<HTMLElement>('.extension-results')!;
  const template = root.querySelector<HTMLTemplateElement>('#extension-result-template')!;
  const icons = new Map([...root.querySelectorAll<HTMLTemplateElement>('template[data-extension-icon]')].map(icon => [icon.dataset.extensionIcon, icon]));
  const activeFilters = root.querySelector<HTMLElement>('.active-filters')!;
  const optionLabels = new Map([...publisher.options].map(option => [option, option.textContent!]));
  const pagination = root.querySelector<HTMLElement>('.directory-pagination')!;
  const category = root.dataset.initialCategory || '';
  let page = Number(root.dataset.page || 1);
  let search: Promise<Pagefind> | undefined;
  let request = 0;
  let timer: ReturnType<typeof setTimeout>;
  const trackSearch = searchTracker('extension_directory');
  const fold = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  function readURL() {
    page = Number(location.pathname.match(/\/page\/(\d+)\/?$/)?.[1] ?? 1);
    const params = new URL(location.href).searchParams;
    query.value = params.get('q') || '';
    const value = (params.get('publisher') || '').toLowerCase();
    publisher.value = [...publisher.options].some(option => option.value === value) ? value : '';
  }
  function writeURL() {
    const url = new URL(location.href);
    url.pathname = directoryPagePath(page, category) + '/';
    url.searchParams.delete('release');
    url.searchParams.delete('platform');
    for (const [key, value] of [['q', query.value.trim()], ['publisher', publisher.value]]) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
    root!.querySelectorAll<HTMLAnchorElement>('a[data-category]').forEach(link => {
      const href = new URL(link.href);
      href.search = url.search;
      link.href = href.toString();
    });
  }

  function renderPagination(total: number) {
    const fragment = document.createDocumentFragment();
    const addLink = (number: number, label: string, relation?: string) => {
      const link = document.createElement('a');
      const url = new URL(directoryPagePath(number, category), location.origin);
      url.search = location.search;
      link.href = url.toString();
      link.textContent = label;
      if (relation) link.rel = relation;
      else link.setAttribute('aria-label', `Page ${number}`);
      if (number === page) link.setAttribute('aria-current', 'page');
      fragment.append(link);
    };
    if (page > 1) addLink(page - 1, '← Previous', 'prev');
    for (const number of pageNumbers(page, total)) {
      if (number !== null) addLink(number, String(number));
      else {
        const gap = document.createElement('span');
        gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true');
        fragment.append(gap);
      }
    }
    if (page < total) addLink(page + 1, 'Next →', 'next');
    pagination.replaceChildren(fragment);
    pagination.hidden = total <= 1;
  }

  function renderEntries(visible: Entry[]) {
    const fragment = document.createDocumentFragment();
    for (const entry of visible) {
      const article = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      article.dataset.extension = entry.name;
      const link = article.querySelector<HTMLAnchorElement>('h2 a')!;
      link.href = entry.href; link.textContent = entry.displayName;
      article.querySelector<HTMLElement>('.publisher-label')!.hidden = !entry.queryFarm;
      article.querySelector('.extension-description')!.textContent = entry.description;
      article.querySelector('.extension-glyph')!.replaceChildren(icons.get(entry.icon)!.content.cloneNode(true));
      article.querySelector('.extension-topics')!.replaceChildren(...entry.topics.map(topic => {
        const link = document.createElement('a');
        const url = new URL(directoryPagePath(1, topic.id), location.origin);
        url.search = location.search;
        link.href = url.toString(); link.textContent = topic.name; link.dataset.category = topic.id;
        return link;
      }));
      const availability = entry.availability;
      article.querySelector('.release-label')!.textContent = `Haybarn ${[...new Set(availability.map(item => item.version))].join(' · ')}`;
      article.querySelector('.platform-label')!.textContent = platformSummary(availability);
      fragment.append(article);
    }
    results.replaceChildren(fragment);

    // Filtering can return a visitor from a later page to page one. Keep its
    // title, canonical, and collection markup aligned with the displayed page.
    const title = root!.dataset.title + (page > 1 ? ` — Page ${page}` : '');
    document.title = `${title} | Query.Farm`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')!;
    const url = new URL(canonical.href);
    url.pathname = directoryPagePath(page, category) + '/';
    canonical.href = url.toString();
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
      const schema = JSON.parse(script.textContent!);
      if (schema['@type'] === 'BreadcrumbList') {
        const parents = schema.itemListElement.slice(0, -1).filter((item: { item: string }) =>
          new URL(item.item, canonical.href).pathname.replace(/\/+$/, '') !== url.pathname.replace(/\/+$/, ''));
        schema.itemListElement = [...parents, { '@type': 'ListItem', name: title, item: canonical.href }]
          .map((item, index) => ({ ...item, position: index + 1 }));
        script.textContent = JSON.stringify(schema);
        continue;
      }
      if (schema['@type'] !== 'CollectionPage') continue;
      schema.name = title; schema.url = canonical.href;
      schema.mainEntity.numberOfItems = visible.length;
      schema.mainEntity.itemListElement = visible.map((entry, index) => ({
        '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + index + 1,
        name: entry.displayName, url: new URL(`${entry.href}/`, canonical.href).href,
      }));
      script.textContent = JSON.stringify(schema);
    }
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
      // The complete scoped catalog remains searchable if Pagefind is unavailable.
      const words = fold(term).split(/\s+/).filter(Boolean);
      return entries.filter(entry => words.every(word => fold(entry.searchText).includes(word))).map(entry => entry.name);
    }
  }
  const matchesPublisher = (entry: Entry, value: string) => !value || entry.publisherId === value;

  function renderFacets(keywordMatches: Entry[]) {
    // Counts reflect the current query and category across all result pages.
    for (const option of publisher.options) {
      const total = keywordMatches.filter(entry => matchesPublisher(entry, option.value)).length;
      option.textContent = `${optionLabels.get(option)} (${total})`;
      option.disabled = total === 0 && option.value !== '' && option.value !== publisher.value;
    }
    const chips = document.createDocumentFragment();
    for (const [control, name, label] of [
      [query, 'search', query.value.trim()],
      [publisher, 'publisher', optionLabels.get(publisher.selectedOptions[0])],
    ] as const) {
      if (!control.value.trim()) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.setAttribute('aria-label', `Remove ${name} filter`);
      chip.textContent = `${name === 'search' ? 'Search' : 'Publisher'}: ${label} ×`;
      chip.addEventListener('click', () => {
        clearTimeout(timer); control.value = ''; void update(true); control.focus();
      });
      chips.append(chip);
    }
    activeFilters.replaceChildren(chips);
    activeFilters.hidden = !activeFilters.childElementCount;
  }
  async function update(resetPage = false) {
    const current = ++request;
    const term = query.value.trim();
    const author = publisher.value;
    if (resetPage) page = 1;
    const names = term ? await searchNames(term) : entries.map(entry => entry.name);
    if (current !== request) return;
    const ranked = new Map(names.map((name, index) => [name, index]));
    const ordered = [...entries].sort((a, b) => (ranked.get(a.name) ?? Infinity) - (ranked.get(b.name) ?? Infinity));
    const keywordMatches = ordered.filter(entry => ranked.has(entry.name));
    const matching = keywordMatches.filter(entry => matchesPublisher(entry, author));
    page = Math.min(page, pageCount(matching.length));
    const offset = (page - 1) * PAGE_SIZE;
    const visible = matching.slice(offset, offset + PAGE_SIZE);
    writeURL();
    renderEntries(visible);
    renderPagination(pageCount(matching.length));
    renderFacets(keywordMatches);
    count.textContent = `${matching.length ? `${offset + 1}–${offset + visible.length} of ` : ''}${matching.length} ${matching.length === 1 ? 'extension' : 'extensions'}${term ? ` for “${term}”` : ''}`;
    empty.hidden = matching.length !== 0;
    trackSearch(term, matching.length);
    clear.hidden = !term && !author;
  }
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); void update(true); });
  query.addEventListener('input', () => { clearTimeout(timer); request++; timer = setTimeout(() => void update(true), 120); });
  publisher.addEventListener('change', () => { clearTimeout(timer); void update(true); });
  clear.addEventListener('click', () => { clearTimeout(timer); form.reset(); void update(true); query.focus(); });
  root.querySelectorAll<HTMLAnchorElement>('[data-query]').forEach(link => link.addEventListener('click', event => {
    if (category) return;
    event.preventDefault(); clearTimeout(timer); query.value = link.dataset.query!; query.focus(); void update(true);
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
