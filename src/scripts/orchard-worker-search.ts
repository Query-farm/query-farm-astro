// Orchard worker directory: facet filtering + full-text search over workers and
// every object in the catalogs they attach. Cards are server-rendered; this only
// hides, reorders and annotates them. The search index (search.json) is fetched
// the first time someone types, so the directory costs nothing until searched.
import MiniSearch from 'minisearch';

interface Doc {
  id: string;
  type: string;
  worker: string;
  workerName?: string;
  title: string;
  text: string;
  keywords: string;
  fields?: string;
  anchor?: string;
  category: string;
  language: string;
}

const KIND_LABEL: Record<string, string> = {
  worker: 'worker',
  table: 'table',
  view: 'view',
  scalar: 'function',
  aggregate: 'aggregate',
  table_in_out: 'table function',
  macro: 'macro',
  table_macro: 'table macro',
  other: 'object',
};

let indexPromise: Promise<{ mini: MiniSearch<Doc>; docs: Map<string, Doc> }> | null = null;
function loadIndex() {
  indexPromise ??= fetch('/products/orchard/workers/search.json')
    .then(r => r.json() as Promise<Doc[]>)
    .then(list => {
      const mini = new MiniSearch<Doc>({
        fields: ['title', 'text', 'keywords', 'fields'],
        storeFields: ['type', 'worker', 'title', 'text', 'anchor'],
        searchOptions: { boost: { title: 3, keywords: 2, fields: 0.6 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
        // Split snake_case and dotted names so `delta` finds `delta_e`.
        tokenize: s => s.split(/[\s\-_.,;:()/'"→|]+/).filter(Boolean),
      });
      mini.addAll(list);
      return { mini, docs: new Map(list.map(d => [d.id, d])) };
    });
  return indexPromise;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initWorkerDirectory() {
  const root = document.querySelector<HTMLElement>('.orchard-dir');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';

  const input = root.querySelector<HTMLInputElement>('#ow-search')!;
  const grid = root.querySelector<HTMLElement>('#ow-grid')!;
  const items = Array.from(grid.querySelectorAll<HTMLElement>('.ow-item'));
  const original = [...items];
  const empty = root.querySelector<HTMLElement>('#ow-empty')!;
  const count = root.querySelector<HTMLElement>('#ow-count')!;
  const objBox = root.querySelector<HTMLElement>('#ow-objects')!;
  const objList = root.querySelector<HTMLElement>('#ow-objects-list')!;
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.ow-chip'));
  chips.forEach(c => c.setAttribute('aria-pressed', 'false'));

  const selected: Record<string, Set<string>> = { language: new Set(), surface: new Set(), platform: new Set(), access: new Set() };

  // Restore state from the URL so filtered views are shareable.
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') ?? '';
  for (const key of Object.keys(selected)) {
    for (const v of params.getAll(key)) {
      selected[key].add(v);
      chips.find(c => c.dataset.facet === key && c.dataset.value === v)?.setAttribute('aria-pressed', 'true');
    }
  }

  function facetOk(el: HTMLElement) {
    const lang = selected.language;
    if (lang.size && !lang.has(el.dataset.language!)) return false;
    const surf = (el.dataset.surface ?? '').split('|');
    for (const s of selected.surface) if (!surf.includes(s)) return false;
    const plat = (el.dataset.platform ?? '').split(' ');
    for (const p of selected.platform) if (!plat.includes(p)) return false;
    if (selected.access.has('offline') && el.dataset.access !== 'offline') return false;
    return true;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (input.value.trim()) p.set('q', input.value.trim());
    for (const [k, vs] of Object.entries(selected)) vs.forEach(v => p.append(k, v));
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  let seq = 0;
  async function apply() {
    const my = ++seq;
    const q = input.value.trim();
    syncUrl();

    let ranking: Map<string, { score: number; why: string }> | null = null;
    let objectHits: { doc: Doc; score: number }[] = [];
    if (q.length >= 2) {
      const { mini, docs } = await loadIndex();
      if (my !== seq) return;
      const scope = root!.dataset.category;
      const results = mini.search(q, scope ? { filter: r => (docs.get(r.id)?.category ?? '').split(' ').includes(scope) } : undefined);
      ranking = new Map();
      for (const r of results) {
        const d = docs.get(r.id)!;
        const prev = ranking.get(d.worker);
        if (d.type !== 'worker') objectHits.push({ doc: d, score: r.score });
        const why = d.type === 'worker' ? '' : `${KIND_LABEL[d.type] ?? d.type} <code class="font-mono text-soil-800">${esc(d.title)}</code>`;
        if (!prev) ranking.set(d.worker, { score: r.score, why });
        else {
          prev.score += r.score * 0.25;
          if (!prev.why && why) prev.why = why;
        }
      }
    }

    let shown = 0;
    const order = ranking ? [...original].sort((a, b) => (ranking!.get(b.dataset.slug!)?.score ?? 0) - (ranking!.get(a.dataset.slug!)?.score ?? 0)) : original;
    for (const el of order) {
      const hit = ranking?.get(el.dataset.slug!);
      const vis = facetOk(el) && (!ranking || Boolean(hit));
      el.hidden = !vis;
      const match = el.querySelector<HTMLElement>('.ow-match')!;
      match.innerHTML = hit?.why ? `Matched ${hit.why}` : '';
      match.classList.toggle('hidden', !hit?.why);
      grid.appendChild(el);
      if (vis) shown++;
    }

    const visible = new Set(order.filter(el => !el.hidden).map(el => el.dataset.slug));
    objectHits = objectHits.filter(h => visible.has(h.doc.worker)).slice(0, 8);
    objBox.classList.toggle('hidden', objectHits.length === 0);
    objList.innerHTML = objectHits
      .map(({ doc }) => `<li class="min-w-0 py-2"><a class="group flex min-w-0 flex-wrap items-baseline gap-x-2 no-underline" href="/products/orchard/workers/${doc.worker}#${doc.anchor ?? ''}">
          <span class="font-mono text-[13.5px] font-semibold text-soil-900 group-hover:text-link">${esc(doc.title)}</span>
          <span class="text-[12px] text-sun-700">${esc(KIND_LABEL[doc.type] ?? doc.type)} · ${esc(doc.workerName ?? doc.worker)}</span>
          <span class="block w-full min-w-0 truncate text-[13px] text-soil-600">${esc(doc.text || '')}</span></a></li>`)
      .join('');

    empty.classList.toggle('hidden', shown > 0);
    count.textContent = shown === items.length ? `${items.length} workers` : `Showing ${shown} of ${items.length} workers`;
  }

  let t: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(apply, 120);
  });
  input.addEventListener('focus', () => void loadIndex(), { once: true });
  chips.forEach(chip =>
    chip.addEventListener('click', () => {
      const set = selected[chip.dataset.facet!];
      const v = chip.dataset.value!;
      const on = !set.has(v);
      on ? set.add(v) : set.delete(v);
      chip.setAttribute('aria-pressed', String(on));
      apply();
    }),
  );
  root.querySelector('#ow-reset')?.addEventListener('click', () => {
    input.value = '';
    Object.values(selected).forEach(s => s.clear());
    chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
    apply();
  });

  if (input.value || Object.values(selected).some(s => s.size)) apply();
}
