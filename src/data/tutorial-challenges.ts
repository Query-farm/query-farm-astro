import fuzzy from './tutorials/fuzzy-matching-duckdb.json';
import parquet from './tutorials/compare-parquet-duckdb.json';
import pushdown from './tutorials/duckdb-postgresql-query-pushdown.json';
import {tutorialFixtures} from './tutorial-fixtures';

export interface TutorialChallenge {
  id: string; post: string; title: string; prompt: string; hint: string;
  starter: string; solution: string; success: string; setup: string; extension: string;
  columns: string[]; rows: (string | number | boolean | null)[][];
}
export const tutorialChallenges: Record<string, TutorialChallenge> = {
  ...Object.fromEntries(tutorialFixtures.filter(tutorial => tutorial.challenge).map(tutorial => [tutorial.slug, {
    ...tutorial.challenge!, post: tutorial.slug, setup: tutorial.setup, extension: tutorial.extension,
  }])),
  [fuzzy.slug]: {
    id: 'keep-tied-matches', post: fuzzy.slug, title: 'Keep both perfect matches',
    prompt: 'Find every customer tied for lead 105’s highest score. Return customer_id, customer, and score. Keep ties; do not pick just one.',
    hint: 'Filter to the maximum score for lead 105. LIMIT 1 would hide a tied customer.',
    starter: "SELECT customer_id, customer, round(score, 1) AS score\nFROM candidates\nWHERE lead_id = 105\nORDER BY score DESC, customer_id;",
    solution: "SELECT customer_id, customer, round(score, 1) AS score\nFROM candidates\nWHERE lead_id = 105\n  AND score = (SELECT max(score) FROM candidates WHERE lead_id = 105)\nORDER BY customer_id;",
    success: 'Both candidates remain. A perfect similarity score cannot choose between two customer IDs.',
    setup: fuzzy.setup, extension: fuzzy.extension,
    columns: ['customer_id', 'customer', 'score'], rows: [[7, 'Cedar Works', 100], [9, 'Cedar Works', 100]],
  },
  [parquet.slug]: {
    id: 'find-added-customers', post: parquet.slug, title: 'Find just the new customer',
    prompt: 'Return customers present in current but absent from previous. Your result needs two columns: id and name.',
    hint: 'Keep the LEFT JOIN, then test whether the previous row’s ID is NULL. A changed plan does not make a customer new.',
    starter: 'SELECT c.id, c.name\nFROM current c\nLEFT JOIN previous p ON c.id = p.id\nORDER BY c.id;',
    solution: 'SELECT c.id, c.name\nFROM current c\nLEFT JOIN previous p ON c.id = p.id\nWHERE p.id IS NULL\nORDER BY c.id;',
    success: 'Eli is the only new customer. Ada and Ben changed, but were already in the previous snapshot.',
    setup: parquet.setup, extension: parquet.extension,
    columns: ['id', 'name'], rows: [[5, 'Eli']],
  },
  [pushdown.slug]: {
    id: 'filter-regional-totals', post: pushdown.slug, title: 'Narrow the aggregate result',
    prompt: 'Sum cancelled orders by region. Return only regions whose total exceeds 25,000, with columns region and total. This exercise runs locally.',
    hint: 'WHERE chooses input rows. HAVING filters groups after the sum has been calculated.',
    starter: "SELECT region, sum(amount) AS total\nFROM orders\nWHERE status = 'cancelled'\nGROUP BY region\nORDER BY region;",
    solution: "SELECT region, sum(amount) AS total\nFROM orders\nWHERE status = 'cancelled'\nGROUP BY region\nHAVING sum(amount) > 25000\nORDER BY region;",
    success: 'Two regions remain after aggregation. On a remote query, inspect the plan to see which server does this work.',
    setup: pushdown.setup, extension: pushdown.extension,
    columns: ['region', 'total'], rows: [['North', 25500], ['South', 28000]],
  },
};
