// Enhance prose examples in place. Keeping the panels mounted preserves a
// running WASM shell, edited SQL, and results when the reader changes tabs.
document.querySelectorAll<HTMLElement>('[data-example-tabs]').forEach(root => {
  const list = root.querySelector<HTMLElement>('[role="tablist"]');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls') ?? ''));
  if (!list || !tabs.length || panels.some(panel => !panel || !root.contains(panel))) return;

  function select(index: number) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i]!.hidden = !selected;
    });
  }

  // Old section links still work even though those headings now live in tabs.
  function revealHashTarget() {
    let id: string;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    const index = panels.findIndex(panel => panel!.contains(target));
    if (index < 0) return;
    select(index);
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  tabs.forEach((tab, index) => {
    const panel = panels[index]!;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;

    tab.addEventListener('click', () => {
      select(index);
      history.replaceState(history.state, '', `#${panel.id}`);
    });
    tab.addEventListener('keydown', event => {
      const destinations: Record<string, number> = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const next = destinations[event.key];
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });

  // Without JavaScript the controls stay hidden and all examples remain readable.
  select(0);
  list.hidden = false;
  revealHashTarget();
  window.addEventListener('hashchange', revealHashTarget);

  const printMedia = window.matchMedia('print');
  printMedia.addEventListener('change', () => {
    if (printMedia.matches) {
      panels.forEach(panel => { panel!.hidden = false; });
    } else {
      select(tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    }
  });
});
