export interface Recipe {
  id: string;
  title: string;
  description: string;
  category: string;
  functions: string[];
  sql: string;
}
// Editorial additions stay separate from generated engine metadata.
export const recipes: Recipe[] = [
  {
    id: 'transform-a-list', title: 'A little function. A whole new list.', category: 'lists',
    description: 'Apply the same idea to every value. A lambda lets you describe the transformation right where you use it.',
    functions: ['list_transform'],
    sql: "SELECT list_transform(\n  [12, 24, 36],\n  lambda price: price * 1.2\n) AS prices_with_tax;",
  },
  {
    id: 'clean-text', title: 'Turn a label into a useful key.', category: 'text',
    description: 'Trim the edges, normalize case, and replace runs of spaces. Small functions compose into a readable cleaning step.',
    functions: ['lower', 'trim', 'regexp_replace'],
    sql: "SELECT regexp_replace(\n  lower(trim('  Summer Harvest 2026  ')),\n  '\\s+', '-', 'g'\n) AS slug;",
  },
  {
    id: 'bucket-dates', title: 'Give your timestamps a rhythm.', category: 'dates',
    description: 'Group events into calendar months with date_trunc. The same pattern works for days, weeks, and years.',
    functions: ['date_trunc', 'sum'],
    sql: "SELECT\n  date_trunc('month', sold_at) AS month,\n  sum(amount) AS revenue\nFROM (VALUES\n  (DATE '2026-06-03', 120),\n  (DATE '2026-06-18', 85),\n  (DATE '2026-07-02', 150)\n) AS sales(sold_at, amount)\nGROUP BY 1 ORDER BY 1;",
  },
  {
    id: 'read-json', title: 'Find the value inside the document.', category: 'json',
    description: 'Extract a JSON field directly as text, ready to use in the rest of your query.',
    functions: ['json_extract_string'],
    sql: "SELECT json_extract_string(\n  '{\"farm\":\"Willow Creek\",\"crops\":[\"apples\",\"pears\"]}',\n  '$.farm'\n) AS farm;",
  },
  {
    id: 'summarize-values', title: 'Find the middle of the story.', category: 'aggregate',
    description: 'Compare the average with the median to see how an unusually large value changes your summary.',
    functions: ['avg', 'median'],
    sql: "SELECT\n  avg(yield_kg) AS average,\n  median(yield_kg) AS median\nFROM (VALUES (12), (14), (15), (16), (98))\n  AS harvest(yield_kg);",
  },
  {
    id: 'generate-rows', title: 'Make a small dataset from nothing.', category: 'files',
    description: 'A table function produces rows you can query. range starts at zero and stops before the upper bound.',
    functions: ['range'],
    sql: "SELECT\n  range AS n,\n  range * range AS squared\nFROM range(1, 6);",
  },
];
export function recipesFor(name: string) { return recipes.filter(r => r.functions.includes(name)); }
