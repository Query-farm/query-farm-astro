export {};

interface SearchDocument { url: string; excerpt: string; meta: Record<string, string>; }
interface SearchMatch { id: string; data(): Promise<SearchDocument>; }
interface Pagefind {
  init(): Promise<void>;
  search(query: string, options: { filters: Record<string, string | { any: string[] }> }): Promise<{ results: SearchMatch[] }>;
}

const dialog = document.querySelector<HTMLDialogElement>('#haybarn-search')!;
const input = dialog.querySelector<HTMLInputElement>('#haybarn-search-input')!;
const results = dialog.querySelector<HTMLOListElement>('#haybarn-search-results')!;
const searchStatus = dialog.querySelector<HTMLElement>('#haybarn-search-status')!;
const suggestions = dialog.querySelector<HTMLElement>('#search-suggestions')!;
const allReleases = dialog.querySelector<HTMLInputElement>('#search-all-releases')!;
const more = dialog.querySelector<HTMLButtonElement>('#search-more')!;
const errorPanel = dialog.querySelector<HTMLElement>('#search-error')!;
const scope = dialog.querySelector<HTMLElement>('#search-scope')!;
const currentScope = scope.textContent;
const triggers = [...document.querySelectorAll<HTMLAnchorElement>('[data-search-open]')];
let pagefind: Promise<Pagefind> | undefined;
let loadAttempt = 0;
let previousFocus: HTMLElement | null = null;
let generation = 0;
let kind = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let matches: SearchMatch[] = [];
let shown = 0;

function engine() {
  if (!pagefind) pagefind = (async () => {
    // Browsers cache failed module imports; a retry needs a fresh module URL.
    const path = '/pagefind/pagefind.js' + (loadAttempt++ ? `?retry=${loadAttempt}` : '');
    const module = await import(/* @vite-ignore */ path) as Pagefind;
    await module.init();
    return module;
  })().catch(error => { pagefind = undefined; throw error; });
  return pagefind;
}

async function functionMatches(query: string): Promise<SearchMatch[]> {
  if (kind === 'Guide') return [];
  const parameters = new URLSearchParams({
    q: query,
    release: allReleases.checked ? 'all' : dialog.dataset.snapshot!,
    limit: '100',
  });
  const response = await fetch(`/products/haybarn/functions/api/v1/search.json?${parameters}`);
  if (!response.ok) throw new Error(`Function search failed: ${response.status}`);
  const payload = await response.json() as { results: SearchDocument[] };
  return payload.results.map((document, index) => ({
    id: `function-${index}-${document.url}`,
    async data() { return document; },
  }));
}

async function guideMatches(query: string): Promise<SearchMatch[]> {
  if (kind === 'Function') return [];
  const filters: Record<string, string | { any: string[] }> = {
    scope: 'haybarn',
    snapshot: 'guide',
  };
  const response = await (await engine()).search(query, { filters });
  return response.results;
}

function openSearch(query?: string) {
  document.querySelector('#site-search-modal')?.classList.add('hidden');
  document.querySelector('#site-search-open')?.setAttribute('aria-expanded', 'false');
  document.documentElement.style.overflow = '';
  if (query !== undefined) input.value = query;
  if (!dialog.open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    document.body.classList.add('search-open');
    triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'true'));
  }
  input.focus();
  void search();
}

triggers.forEach(trigger => trigger.addEventListener('click', event => { event.preventDefault(); openSearch(); }));
document.querySelectorAll<HTMLFormElement>('[data-search-form]').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault();
  openSearch(String(new FormData(form).get('q') ?? '').trim());
}));
dialog.querySelector('[data-search-close]')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  generation++;
  clearTimeout(timer);
  document.body.classList.remove('search-open');
  triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
  (previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : triggers[0])?.focus();
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); dialog.open ? dialog.close() : openSearch();
  } else if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault(); openSearch();
  }
});
dialog.addEventListener('keydown', event => {
  // A search input consumes Escape to clear itself in some browsers.
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); dialog.close(); return;
  }
  if (event.key === 'Tab') {
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')].filter(element => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  const links = [...results.querySelectorAll<HTMLAnchorElement>('a')];
  const current = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (document.activeElement !== input && current === -1) return;
  if (event.key === 'ArrowDown' && links.length) {
    event.preventDefault(); links[Math.min(current + 1, links.length - 1)].focus();
  } else if (event.key === 'ArrowUp' && current >= 0) {
    event.preventDefault(); (current > 0 ? links[current - 1] : input).focus();
  } else if (event.key === 'Enter' && document.activeElement === input && links.length) {
    event.preventDefault(); links[0].click();
  }
});

// Only preserve Pagefind's <mark> highlights. Catalog text is otherwise text,
// including SQL examples that contain HTML; no result can inject live markup.
function excerptFragment(excerpt: string) {
  const template = document.createElement('template');
  template.innerHTML = excerpt;
  const fragment = document.createDocumentFragment();
  for (const node of template.content.childNodes) {
    if (node instanceof HTMLElement && node.tagName === 'MARK') {
      const mark = document.createElement('mark'); mark.textContent = node.textContent; fragment.append(mark);
    } else fragment.append(document.createTextNode(node.textContent ?? ''));
  }
  return fragment;
}

function resultItem(doc: SearchDocument) {
  const url = new URL(doc.url, location.origin);
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid search result URL');
  const item = document.createElement('li');
  const link = document.createElement('a'); link.href = url.pathname + url.search + url.hash;
  const heading = document.createElement('div'); heading.className = 'search-result-heading';
  const title = document.createElement('strong'); title.textContent = doc.meta.title ?? doc.url;
  const label = document.createElement('span'); label.textContent = doc.meta.kind ?? 'Guide';
  heading.append(title, label);
  const excerpt = document.createElement('p'); excerpt.append(excerptFragment(doc.excerpt));
  link.append(heading, excerpt);
  if (doc.meta.release) {
    const release = document.createElement('small'); release.textContent = doc.meta.release; link.append(release);
  }
  item.append(link); return item;
}

async function appendResults(token: number) {
  more.disabled = true;
  const documents = await Promise.all(matches.slice(shown, shown + 8).map(match => match.data()));
  if (token !== generation || !dialog.open) return;
  results.append(...documents.map(resultItem));
  shown += documents.length;
  searchStatus.textContent = matches.length ? `${matches.length.toLocaleString()} ${matches.length === 1 ? 'result' : 'results'}${shown < matches.length ? ` · Showing ${shown}` : ''}` : `No results for “${input.value.trim()}”. Try fewer words or include other releases.`;
  more.hidden = shown >= matches.length;
  more.disabled = false;
}

function failed(token: number) {
  if (token !== generation || !dialog.open) return;
  results.replaceChildren(); more.hidden = true; errorPanel.hidden = false;
  searchStatus.textContent = 'Search could not load. Try again or browse the function catalog.';
}

async function search(token = ++generation) {
  clearTimeout(timer);
  const query = input.value.trim();
  matches = []; shown = 0; results.replaceChildren(); more.hidden = true; errorPanel.hidden = true;
  suggestions.hidden = Boolean(query);
  scope.textContent = allReleases.checked ? 'All captured releases' : currentScope;
  if (!query) { searchStatus.textContent = 'Search descriptions, arguments, SQL examples, and guides.'; return; }
  searchStatus.textContent = 'Searching…';
  try {
    const [functions, guides] = await Promise.all([functionMatches(query), guideMatches(query)]);
    if (token !== generation || !dialog.open) return;
    matches = [...functions, ...guides];
    await appendResults(token);
  } catch { failed(token); }
}

input.addEventListener('input', () => {
  const token = ++generation;
  clearTimeout(timer);
  // Invalidate previous results immediately, including Enter-to-open targets.
  results.replaceChildren(); more.hidden = true; errorPanel.hidden = true;
  searchStatus.textContent = input.value.trim() ? 'Searching…' : 'Search descriptions, arguments, SQL examples, and guides.';
  suggestions.hidden = Boolean(input.value.trim());
  timer = setTimeout(() => void search(token), 140);
});
allReleases.addEventListener('change', () => void search());
dialog.querySelectorAll<HTMLButtonElement>('[data-search-kind]').forEach(button => button.addEventListener('click', () => {
  kind = button.dataset.searchKind!;
  dialog.querySelectorAll<HTMLButtonElement>('[data-search-kind]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  void search();
}));
dialog.querySelectorAll<HTMLButtonElement>('[data-search-suggestion]').forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.searchSuggestion!; input.focus(); void search();
}));
more.addEventListener('click', () => { const token = generation; void appendResults(token).catch(() => failed(token)); });
dialog.querySelector('#search-retry')!.addEventListener('click', () => { pagefind = undefined; void search(); });
