import { PAGE_SIZE, catalogFacetCounts, catalogQuery, defaultCatalogState, parseCatalogState, selectTutorials, type CatalogItem } from '../lib/tutorial-catalog';
import { tutorialCategoryLabel, tutorialTechnologyLabel } from '../data/tutorial-taxonomy';

const root = document.querySelector<HTMLElement>('[data-tutorial-catalog]');
if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-catalog-controls]')!;
  const search = form.querySelector<HTMLInputElement>('[name=q]')!;
  const facets = root.querySelector<HTMLElement>('[data-catalog-facets]')!;
  const list = root.querySelector<HTMLElement>('[data-catalog-items]')!;
  const cards = new Map(Array.from(list.querySelectorAll<HTMLElement>('[data-tutorial-card]')).map(card => [card.dataset.tutorialCard!, card]));
  const items = [...cards.values()].map(card => JSON.parse(card.dataset.catalogItem!) as CatalogItem);
  const count = root.querySelector<HTMLElement>('[data-catalog-count]')!;
  const selections = root.querySelector<HTMLElement>('[data-catalog-selections]')!;
  const clear = root.querySelector<HTMLButtonElement>('[data-catalog-clear]')!;
  const empty = root.querySelector<HTMLElement>('[data-catalog-empty]')!;
  const pagination = root.querySelector<HTMLElement>('[data-catalog-pagination]')!;
  const previous = root.querySelector<HTMLButtonElement>('[data-catalog-previous]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-catalog-next]')!;
  const pageLabel = root.querySelector<HTMLElement>('[data-catalog-page]')!;
  let state = parseCatalogState(new URLSearchParams(location.search));
  let pending: number | undefined;
  const emit = (event: string, values: Record<string, string | number | boolean>) =>
    (window as Window & {gtag?: (...args: unknown[]) => void}).gtag?.('event', event, {content_type:'tutorial', ...values});

  const render = (historyMode?: 'push' | 'replace', track = false) => {
    const result = selectTutorials(items, state);
    const totals = catalogFacetCounts(items, state);
    state.page = result.page;
    for (const card of cards.values()) card.hidden = true;
    for (const item of result.items) {
      const card = cards.get(item.id)!;card.hidden = false;list.append(card);
    }
    // Keep spaces intact while someone is typing a multi-word query.
    if (document.activeElement !== search) search.value = state.q;
    for (const input of facets.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      const group = input.name === 'category' ? 'categories' : 'tools';
      const total = totals[group][input.value] ?? 0;
      input.checked = state[group].includes(input.value);
      input.disabled = total === 0 && !input.checked;
      input.setAttribute('aria-description', `${total} matching ${total === 1 ? 'tutorial' : 'tutorials'}`);
      input.closest('label')!.querySelector('[data-facet-count]')!.textContent = String(total);
    }
    selections.replaceChildren();
    for (const group of ['categories','tools'] as const) for (const id of state[group]) {
      const button = document.createElement('button');
      const label = group === 'categories' ? tutorialCategoryLabel(id) : tutorialTechnologyLabel(id);
      button.type='button';button.textContent=`${label} ×`;button.setAttribute('aria-label',`Remove ${label}`);
      button.addEventListener('click',()=>{
        clearTimeout(pending);state[group]=state[group].filter(value=>value!==id);state.page=1;
        render('push',true);
        const input=Array.from(facets.querySelectorAll<HTMLInputElement>('input')).find(input=>input.value===id);
        if(input && !input.disabled)input.focus();else count.focus({preventScroll:true});
      });
      selections.append(button);
    }
    selections.hidden = selections.childElementCount === 0;
    clear.hidden = !state.q && !state.categories.length && !state.tools.length;
    count.textContent = result.total > PAGE_SIZE
      ? `Showing ${(result.page - 1) * PAGE_SIZE + 1}–${Math.min(result.page * PAGE_SIZE,result.total)} of ${result.total} tutorials`
      : `${result.total} ${result.total === 1 ? 'tutorial' : 'tutorials'}`;
    empty.hidden = result.total !== 0;pagination.hidden = result.pages <= 1;
    previous.disabled = result.page === 1;next.disabled = result.page === result.pages;
    pageLabel.textContent = `Page ${result.page} of ${result.pages}`;
    const query = catalogQuery(state);
    const url = location.pathname + (query ? '?' + query : '') + location.hash;
    if (historyMode && url !== location.pathname + location.search + location.hash) history[historyMode === 'push' ? 'pushState' : 'replaceState'](null,'',url);
    if (track) emit('tutorial_catalog_filter', { category:state.categories.join('|') || 'all', tool:state.tools.join('|') || 'all', has_query:Boolean(state.q.trim()), result_count:result.total });
    return result;
  };
  const applySearch = (mode: 'push' | 'replace') => {
    clearTimeout(pending);state.q=search.value.slice(0,200);state.page=1;render(mode,true);
  };
  form.hidden=false;facets.hidden=false;
  form.addEventListener('submit',event=>{event.preventDefault();applySearch('push')});
  search.addEventListener('input',()=>{clearTimeout(pending);pending=window.setTimeout(()=>applySearch('replace'),250)});
  facets.addEventListener('change',event=>{
    if(!(event.target instanceof HTMLInputElement))return;
    clearTimeout(pending);state.q=search.value.slice(0,200);state.page=1;
    const input=event.target;
    const group=input.name === 'category' ? 'categories' : 'tools';
    state[group]=input.checked ? [...state[group],input.value] : state[group].filter(value=>value!==input.value);
    render('push',true);
  });
  for (const reset of root.querySelectorAll<HTMLButtonElement>('[data-catalog-reset]')) reset.addEventListener('click',()=>{
    clearTimeout(pending);state={...defaultCatalogState};search.value='';render('push',true);search.focus();
  });
  for (const [button,delta] of [[previous,-1],[next,1]] as const) button.addEventListener('click',()=>{
    state.page+=delta;const result=render('push');emit('tutorial_catalog_page',{page:result.page,result_count:result.total});
    count.focus({preventScroll:true});root.scrollIntoView({block:'start'});
  });
  root.addEventListener('click',event=>{
    const anchor=(event.target as Element).closest('a');const card=anchor?.closest<HTMLElement>('[data-tutorial-card]');
    if(!card || anchor?.classList.contains('card-category'))return;
    const item=items.find(item=>item.id===card.dataset.tutorialCard)!;emit('tutorial_select',{post:item.id,category:item.category});
  });
  addEventListener('popstate',()=>{clearTimeout(pending);state=parseCatalogState(new URLSearchParams(location.search));search.value=state.q;render()});
  render('replace');root.dataset.catalogReady='true';
}
