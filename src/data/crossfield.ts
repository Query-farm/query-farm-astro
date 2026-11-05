/** Public documentation navigation. These pages describe development builds. */
export const crossfieldRoot = '/products/crossfield';
export const crossfieldDocs = `${crossfieldRoot}/docs`;
export const crossfieldStories = [
  { title: 'How it works', href: `${crossfieldRoot}/how-it-works`, description: 'Follow a delivery standard from a business decision into SQL and model review.' },
  { title: 'For AI agents', href: `${crossfieldRoot}/agents`, description: 'Help AI agents find the right metric, inspect its calculation and correct rejected queries.' },
  { title: 'Apache Ossie', href: `${crossfieldRoot}/ossie`, description: 'Describe business calculations in an open model and query them through Crossfield.' },
  { title: 'Inside the engine', href: `${crossfieldRoot}/engine`, description: 'Why Crossfield is part of Haybarn and which DuckDB engine capabilities it needs.' },
];
export const crossfieldPages = [
  { title: 'Overview', href: crossfieldDocs, description: 'What a semantic model owns, and where to start.' },
  { title: 'Fulfillment walkthrough', href: `${crossfieldDocs}/fulfillment`, description: 'Start here: define complete, on-time orders and compare original and revised promises.' },
  { title: 'Trading example', href: `${crossfieldDocs}/trading`, description: 'Define exposure and execution price, join limits, and compare reporting scopes.' },
  { title: 'Retail orders and items', href: `${crossfieldDocs}/quickstart`, description: 'Combine orders and receipt lines without double-counting revenue.' },
  { title: 'Author a model', href: `${crossfieldDocs}/models`, description: 'Define datasets, grain, metrics and public names.' },
  { title: 'Query and compose', href: `${crossfieldDocs}/querying`, description: 'Catalogs, detail, callable inputs and model revisions.' },
  { title: 'Model versions', href: `${crossfieldDocs}/model-versions`, description: 'Compare definitions against the same data and keep earlier reporting rules available.' },
  { title: 'Discovery and AI agents', href: `${crossfieldDocs}/discovery`, description: 'Find definitions, inspect SQL and repair rejected queries.' },
  { title: 'Validate a model', href: `${crossfieldDocs}/validation`, description: 'Review model changes, run the native validator and check numerical answers.' },
  { title: 'Time and measurements', href: `${crossfieldDocs}/time-and-measurements`, description: 'Separate timestamps, measurement intervals, calendars and historical sources.' },
  { title: 'Query API sources', href: `${crossfieldDocs}/providers`, description: 'Choose an input scope while the model supplies the provider calls and dependencies.' },
  { title: 'Runnable examples', href: `${crossfieldDocs}/examples`, description: 'Download fulfillment, trading, retail and native capability fixtures with expected answers.' },
  { title: 'Availability and limits', href: `${crossfieldDocs}/compatibility`, description: 'Build requirements, supported behavior and boundaries.' },
];

export const jaffleStoreSQL = `SELECT store_name, order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle
GROUP BY store_name
ORDER BY store_name;`;

export const jaffleTotalSQL = `SELECT order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle;`;

export const jaffleStoreRows = [
  ['Brooklyn', 19, 36, '255.00'],
  ['Philadelphia', 506, 798, '6100.00'],
];
export const jaffleTotalRows = [[525, 834, '6355.00']];

/** Deliberately incorrect revenue aggregation; verified against the frozen shop fixture. */
export const jaffleFanoutSQL = `SELECT s.name AS store_name,
       count(*) AS joined_rows,
       sum(o.subtotal) AS revenue_after_join
FROM warehouse.orders AS o
JOIN warehouse.items AS i ON i.order_id = o.id
JOIN warehouse.stores AS s ON s.id = o.store_id
GROUP BY s.name
ORDER BY s.name;`;

export const jaffleExplainSQL = `EXPLAIN (SEMANTIC)\n${jaffleStoreSQL}`;

export const compositionSQL = `SET crossfield_mode = 'semantic';

SELECT sales.region, sales.revenue, targets.budget
FROM SEMANTIC actuals.actual AS sales
LEFT JOIN SEMANTIC planning.plan AS targets
  ON sales.region = targets.region
WHERE sales.region IS NOT NULL
GROUP BY sales.region
ORDER BY sales.region;`;

export const revisionSQL = `SET crossfield_mode = 'semantic';

WITH previous AS (
  SELECT revenue FROM SEMANTIC jaffle_old.jaffle
), current AS (
  SELECT revenue FROM SEMANTIC jaffle_current.jaffle
)
SELECT previous.revenue AS previous_revenue,
       current.revenue AS current_revenue,
       current.revenue - previous.revenue AS change
FROM previous CROSS JOIN current;`;

/** Attachment and mode statements already covered by the downloadable native fixtures. */
export const portfolioAttachSQL = `ATTACH 'exposure-current.package.json' AS portfolio (
    TYPE crossfield,
    BINDINGS '{"warehouse":"warehouse"}'
);`;

export const portfolioStrictSQL = `USE portfolio.semantic;
SET crossfield_mode = 'strict';`;

export const jaffleAttachSQL = `ATTACH 'jaffle-v2.package.json' AS jaffle_current (
    TYPE crossfield, MODEL_VERSION '2',
    BINDINGS '{"sales":"warehouse","reference":"warehouse"}'
);`;

export const jaffleStrictSQL = `USE jaffle_current.semantic;
SET crossfield_mode = 'strict';`;
