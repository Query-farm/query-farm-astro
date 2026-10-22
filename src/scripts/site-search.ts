import {
  extensionDocument, matchingExtensions, mergeSearchResults, popularExtensions, resultKey,
  type SearchDocument, type SearchExtension,
} from '../lib/site-search';
import { searchTracker } from '../lib/search-analytics';

const trackSearch = searchTracker('site');

interface Pagefind {
  init(): Promise<void>;
  search(query: string, options: { filters: { kind: string | { any: string[] } } }): Promise<{
    results: { data(): Promise<SearchDocument> }[];
  }>;
}

const openBtn = document.querySelector<HTMLButtonElement>('#site-search-open')!;
const modal = document.querySelector<HTMLElement>('#site-search-modal')!;
const input = document.querySelector<HTMLInputElement>('#site-search-input')!;
const resultsEl = document.querySelector<HTMLElement>('#site-search-results')!;
const statusEl = document.querySelector<HTMLElement>('#site-search-status')!;
const heading = document.querySelector<HTMLElement>('#site-search-heading')!;
const fnToggle = document.querySelector<HTMLInputElement>('#site-search-functions')!;

let pagefind: Promise<Pagefind> | undefined;
let catalog: Promise<SearchExtension[]> | undefined;
let loadAttempt = 0;
let generation = 0;
let timer: ReturnType<typeof setTimeout>;

function ensurePagefind() {
  return pagefind ??= (async () => {
    const path = '/pagefind/pagefind.js' + (loadAttempt++ ? `?retry=${loadAttempt}` : '');
    const module = await import(/* @vite-ignore */ path) as Pagefind;
    await module.init();
    return module;
  })().catch(error => { pagefind = undefined; throw error; });
}

function loadCatalog() {
  return catalog ??= fetch('/search/extensions.json').then(async response => {
    if (!response.ok) throw new Error('Extension search unavailable');
    return await response.json() as SearchExtension[];
  }).catch(error => { catalog = undefined; throw error; });
}

function setStatus(message: string) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
}

// Search excerpts may contain SQL/HTML examples. Preserve only Pagefind's
// highlights; all other content is rendered as text.
function excerptFragment(excerpt: string) {
  const template = document.createElement('template');
  template.innerHTML = excerpt;
  const fragment = document.createDocumentFragment();
  for (const node of template.content.childNodes) {
    if (node instanceof HTMLElement && node.tagName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent;
      fragment.append(mark);
    } else fragment.append(document.createTextNode(node.textContent ?? ''));
  }
  return fragment;
}

const genericIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/></svg>';
const numberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function resultItem(doc: SearchDocument, extensions: SearchExtension[]) {
  const url = new URL(doc.url, location.origin);
  if (url.origin !== location.origin) return null;
  const extension = extensions.find(extension => resultKey(extension.url) === resultKey(doc.url));
  const parentExtension = extension ?? extensions.find(extension => url.pathname.startsWith(extension.url));
  const kind = extension ? 'Extension' : doc.meta.kind
    || (url.pathname.includes('/functions/') ? 'Reference'
      : url.pathname.startsWith('/blog/') ? 'Blog'
        : url.pathname.includes('/docs/') ? 'Documentation'
          : url.pathname.startsWith('/products/') ? 'Product' : 'Page');
  const link = document.createElement('a');
  link.href = url.pathname + url.search + url.hash;
  link.className = 'site-search-result';
  link.dataset.kind = kind;
  if (extension?.categoryId) link.dataset.category = extension.categoryId;
  const icon = document.createElement('span');
  icon.className = 'site-search-icon';
  icon.innerHTML = parentExtension?.icon ?? genericIcon;
  const body = document.createElement('div'); body.className = 'site-search-result-body';
  const row = document.createElement('div'); row.className = 'site-search-result-heading';
  const title = document.createElement('strong'); title.textContent = extension?.name ?? doc.meta.title ?? doc.url;
  const badge = document.createElement('span'); badge.className = 'site-search-badge'; badge.textContent = kind;
  row.append(title, badge);
  const excerpt = document.createElement('p'); excerpt.className = 'site-search-excerpt';
  if (extension) excerpt.textContent = extension.description;
  else excerpt.append(excerptFragment(doc.excerpt));
  body.append(row, excerpt);
  const detail = document.createElement('p'); detail.className = 'site-search-detail';
  if (extension) {
    detail.textContent = extension.category;
    if (extension.usageCount) {
      detail.append(` · ${numberFormat.format(extension.usageCount)} loads`);
      detail.title = `${extension.usageCount.toLocaleString('en')} extension loads${extension.usagePeriod ? ` · ${extension.usagePeriod}` : ''}`;
    }
  } else detail.textContent = doc.meta.extension ?? url.pathname;
  body.append(detail);
  link.append(icon, body);
  return link;
}

function render(documents: SearchDocument[], extensions: SearchExtension[], label: string) {
  const focused = document.activeElement;
  const focusedKey = focused instanceof HTMLAnchorElement && resultsEl.contains(focused)
    ? resultKey(focused.href) : undefined;
  resultsEl.replaceChildren(...documents.map(doc => resultItem(doc, extensions)).filter(item => item !== null));
  heading.textContent = label;
  heading.hidden = !documents.length;
  if (focusedKey) {
    const replacement = [...resultsEl.querySelectorAll<HTMLAnchorElement>('a')]
      .find(link => resultKey(link.href) === focusedKey);
    (replacement ?? input).focus({ preventScroll: true });
  }
}

async function runSearch(token = ++generation) {
  clearTimeout(timer);
  const query = input.value.trim();
  const includeFunctions = fnToggle.checked;
  const current = () => token === generation && !modal.classList.contains('hidden');
  resultsEl.setAttribute('aria-busy', 'true');
  setStatus('Searching…');
  try {
    // Catalog failure must not prevent full-text search, and an unavailable
    // Pagefind index must not prevent direct extension navigation.
    const extensions = await loadCatalog().catch(() => [] as SearchExtension[]);
    if (!current()) return;
    if (!query) {
      render(popularExtensions(extensions).map(extensionDocument), extensions, 'Popular extensions');
      setStatus(extensions.length ? '' : 'Type to search the docs and extensions.');
      return;
    }
    const named = matchingExtensions(extensions, query);
    render(named.slice(0, 8).map(extensionDocument), extensions, 'Search results');
    try {
      const engine = await ensurePagefind();
      if (!current()) return;
      const search = await engine.search(query, {
        filters: { kind: includeFunctions ? { any: ['page', 'function'] } : 'page' },
      });
      if (!current()) return;
      trackSearch(query, search.results.length);
      const documents = await Promise.all(search.results.slice(0, 8).map(result => result.data()));
      if (!current()) return;
      const top = mergeSearchResults(named, documents);
      render(top, extensions, 'Search results');
      setStatus(top.length ? '' : `No results for “${query}”.`);
    } catch {
      if (current()) setStatus(named.length
        ? 'Showing extension matches. Full-site search is temporarily unavailable.'
        : 'Search is temporarily unavailable. Please try again.');
    }
  } finally {
    if (current()) resultsEl.setAttribute('aria-busy', 'false');
  }
}

function openModal() {
  document.querySelector<HTMLDialogElement>('#haybarn-search')?.close();
  modal.classList.remove('hidden');
  openBtn.setAttribute('aria-expanded', 'true');
  document.documentElement.style.overflow = 'hidden';
  input.focus();
  void runSearch();
}

function closeModal() {
  generation++;
  clearTimeout(timer);
  modal.classList.add('hidden');
  openBtn.setAttribute('aria-expanded', 'false');
  document.documentElement.style.overflow = '';
  openBtn.focus();
}

openBtn.addEventListener('click', openModal);
modal.querySelectorAll('[data-search-close]').forEach(element => element.addEventListener('click', closeModal));
input.addEventListener('input', () => {
  const token = ++generation; // Invalidate pending requests before the debounce.
  trackSearch('', 0);
  clearTimeout(timer);
  resultsEl.replaceChildren();
  heading.hidden = true;
  timer = setTimeout(() => { void runSearch(token); }, 140);
});
fnToggle.addEventListener('change', () => { void runSearch(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.getElementById('haybarn-search')) {
    event.preventDefault(); openModal(); return;
  }
  if (modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
  else if (event.key === 'Tab') {
    const focusable = [...modal.querySelectorAll<HTMLElement>('button, input, a[href]')]
      .filter(element => !element.hasAttribute('disabled') && !element.hidden);
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const links = [...resultsEl.querySelectorAll<HTMLAnchorElement>('a')];
    if (!links.length || (document.activeElement !== input && !resultsEl.contains(document.activeElement))) return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % links.length : (index <= 0 ? links.length : index) - 1;
    links[next].focus();
  } else if (event.key === 'Enter' && document.activeElement === input) {
    const first = resultsEl.querySelector<HTMLAnchorElement>('a');
    if (first) { event.preventDefault(); first.click(); }
  }
});
