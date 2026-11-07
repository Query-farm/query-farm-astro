// Draws a bar under each timing in a markdown table, so the difference in scale
// is visible at a glance. A table opts in with an HTML comment right before it:
//
//   <!-- bars: row -->    each row is scaled on its own (compare across columns)
//   <!-- bars: table -->  one scale for the whole table (compare across rows too);
//                         a row whose first cell is "Total" is scaled on its own
//   <!-- bars: stack -->  each row becomes a group with one labeled bar per column,
//                         all on one scale, the value at the bar's tip
//
// Bars in a column whose header mentions "prefetch" get the highlight fill.
//
// Only cells that start with a time ("1.3 s", "**2,188 ms**") get a bar, and the
// number stays as text, so screen readers, copy-paste and crawlers see the table
// unchanged. The bar is aria-hidden.

const TIME = /^\s*([\d,]+(?:\.\d+)?)\s*(ms|s)\b/;

const text = node =>
  node.type === 'text' ? node.value : (node.children || []).map(text).join('');

const children = (node, tag) => (node.children || []).filter(c => c.type === 'element' && c.tagName === tag);

const marker = node => {
  const value = node.type === 'comment' ? node.value : node.type === 'raw' ? node.value.replace(/^<!--|-->$/g, '') : null;
  const m = value && value.match(/^\s*bars:\s*(row|table|stack)\s*$/);
  return m ? m[1] : null;
};

const millis = cell => {
  const m = text(cell).match(TIME);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return m[2] === 's' ? n * 1000 : n;
};

const addBar = (cell, value, max, highlight) => {
  const pct = Math.max((value / max) * 100, 1.5).toFixed(1);
  cell.properties = { ...cell.properties, className: [...(cell.properties?.className || []), 'has-bar', ...(highlight ? ['is-highlight'] : [])] };
  cell.children = [
    { type: 'element', tagName: 'span', properties: { className: ['tb-value'] }, children: cell.children },
    {
      type: 'element', tagName: 'span', properties: { className: ['tb-track'], ariaHidden: 'true' },
      children: [{ type: 'element', tagName: 'span', properties: { className: ['tb-bar'], style: `width:${pct}%` }, children: [] }],
    },
  ];
};

const decorate = (table, mode) => {
  const body = children(table, 'tbody')[0];
  if (!body) return;
  // Columns whose header mentions prefetch get the highlight fill.
  const head = children(table, 'thead')[0];
  const headCells = head ? children(children(head, 'tr')[0] || {}, 'th') : [];
  const highlight = headCells.map(th => /prefetch/i.test(text(th)));
  const rows = children(body, 'tr').map(tr => {
    const cells = children(tr, 'td');
    return { cells, label: cells[0] ? text(cells[0]).trim() : '', values: cells.map(millis) };
  });
  const isTotal = r => /^total$/i.test(r.label);
  const tableMax = Math.max(0, ...rows.filter(r => !isTotal(r)).flatMap(r => r.values.slice(1).filter(v => v != null)));
  for (const r of rows) {
    const own = Math.max(0, ...r.values.slice(1).filter(v => v != null));
    const max = mode === 'row' || isTotal(r) ? own : tableMax;
    if (!max) continue;
    r.values.forEach((v, i) => { if (i > 0 && v != null) addBar(r.cells[i], v, max, highlight[i]); });
  }
  // Headers of columns that got bars line up with the bars, which start at the left.
  const barred = new Set(rows.flatMap(r => r.cells.map((c, i) => (c.properties?.className || []).includes('has-bar') ? i : -1)));
  headCells.forEach((th, i) => {
    if (barred.has(i)) th.properties = { ...th.properties, className: [...(th.properties?.className || []), 'bar-col'] };
  });
  table.properties = { ...table.properties, className: [...(table.properties?.className || []), 'has-bars'] };
};

const el = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });

// Turns each body row into a group: its first cell becomes a heading, and each
// other column becomes a row labeled with that column's header. Still a table, so
// it reads in order without the bars. A cell without a time keeps its text, no bar.
const stack = table => {
  const head = children(table, 'thead')[0];
  const body = children(table, 'tbody')[0];
  if (!head || !body) return;
  const headCells = children(children(head, 'tr')[0] || {}, 'th');
  const rows = children(body, 'tr').map(tr => children(tr, 'td'));
  const max = Math.max(0, ...rows.flatMap(cells => cells.slice(1).map(millis).filter(v => v != null)));
  const out = [];
  for (const cells of rows) {
    out.push(el('tr', { className: ['tb-stack-group'] }, [
      el('th', { colSpan: 2, scope: 'colgroup' }, cells[0].children),
    ]));
    cells.slice(1).forEach((cell, i) => {
      const value = millis(cell);
      out.push(el('tr', { className: ['tb-stack-row', `tb-series-${i + 1}`] }, [
        el('th', { scope: 'row' }, headCells[i + 1].children),
        el('td', {}, value == null
          ? [el('span', { className: ['tb-stack-note'] }, cell.children)]
          : [el('span', { className: ['tb-stack-track'] }, [
              el('span', { className: ['tb-stack-bar'], ariaHidden: 'true', style: `width:calc((100% - 3.5em) * ${(value / max).toFixed(3)})` }),
              el('span', { className: ['tb-stack-value'] }, cell.children),
            ])]),
      ]));
    });
  }
  table.properties = { ...table.properties, className: [...(table.properties?.className || []), 'tb-stack'] };
  table.children = [
    el('colgroup', {}, [el('col', { className: ['tb-stack-label'] }), el('col', {})]),
    el('tbody', {}, out),
  ];
};

// Plain copy of a visited node: Sätteri's nodes carry lazy-resolver fields that
// shouldn't be handed back as replacement content.
const clone = node => {
  const { _resolver, _id, position, ...rest } = node;
  return node.children ? { ...rest, children: node.children.map(clone) } : rest;
};

// A Sätteri hast plugin (markdown.processor = satteri({ hastPlugins: [...] })).
export const tableBars = () => ({
  name: 'table-bars',
  element: {
    filter: ['table'],
    visit(node, ctx) {
      const parent = ctx.parent(node), index = ctx.indexOf(node);
      if (!parent || index == null) return;
      let mode = null;
      for (let i = index - 1; i >= 0; i--) {
        const sib = parent.children[i];
        if (sib.type === 'text' && !sib.value.trim()) continue;
        mode = marker(sib);
        break;
      }
      if (!mode) return;
      const table = clone(node);
      if (mode === 'stack') stack(table);
      else decorate(table, mode);
      return table;
    },
  },
});
