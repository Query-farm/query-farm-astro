# Crossfield: proposed product copy

Editorial draft for `feat/crossfield-content-strategy`, October 24, 2026.
Read with the [content plan](PLAN.md). Headings and prose below are proposed public
copy; production notes explicitly identify demonstrations and validation work.
Examples retained from the existing site reuse its recorded evidence. New page
examples need the publication checks in the plan; this document is not a fresh run.

## The pitch

### One sentence

Crossfield brings approved business metrics into DuckDB, so people and agents can
query shared definitions, inspect their calculations and compare revisions in SQL.

### A conversation with a DuckDB user

You can write perfectly valid SQL and still count revenue twice, average the
wrong population, or use a different definition from the next report. Crossfield
makes those decisions part of a semantic model: what the metric calculates,
which rows contribute, and how it can be grouped or combined with other results.

Attach the model to DuckDB and query its named metrics. Crossfield compiles the
request into native DuckDB query trees and checks it against the model. You can
inspect the generated SQL, compare attached model revisions, and enable strict
controls over the supported query surface. Query Farm supplies the extension and
the matching DuckDB engine changes that make those checks part of execution.

### A conversation with a business owner

When two reports disagree, the first question is often whether they measured the
same thing. Crossfield makes the definition explicit and reusable. A model can
say whether revenue includes tax, how returns affect it, and which comparisons
are permitted. Analysts and agents select those approved metrics instead of
recreating the formulas for every report. When a definition changes, you can
compare its old and new results on the same data before adopting it.

### A conversation with an agent builder

Give your agent an interface to approved calculations. Crossfield exposes metric
names, dimensions, types, units, callable signatures and requirements as SQL
metadata. The agent can discover what is available, construct a query, inspect its
semantic explanation and use structured diagnostics to correct a rejected request.
The application controls the session; Crossfield validates supported queries
against the selected model. A model that cannot answer a question should lead to
an explicit limitation, not a silently different calculation.

## Homepage draft

### Hero

**Crossfield by Query.Farm**

# Approved business metrics. Queried directly in DuckDB.

Define what revenue, customer counts and reporting periods mean. Let people and
agents choose the metrics and dimensions they need while Crossfield applies the
model's calculations and rules inside DuckDB.

Attach semantic models as catalogs, inspect the SQL behind a result, and compare
definitions side by side. Enable strict mode when supported queries must stay
within an approved model.

Primary action: **Run the SQL walkthrough**.
Secondary action: **See how it works**.

Availability line: **Development build. Uses a matching Query Farm build of DuckDB
and the Crossfield extension.** Link directly to current availability and setup.
Replace this line with exact release information only when artifacts are published.

Production note: put the existing store query/result beside this copy, with its
setup link and “Precomputed fixture results” label. Do not put a disconnected
SQL expression in the hero with no data/model prerequisites.

### Why we built it: SQL can run correctly and answer the wrong question

Suppose an order has three receipt lines. Joining the order to those lines gives
you three rows containing the same order subtotal. Sum that subtotal and the order
contributes three times. The database has executed the query correctly; the query
has counted the wrong thing.

Definitions can diverge even without a join. One report calls the amount collected
“revenue,” including tax. Another uses the subtotal before tax. An agent can write
either query, and a SQL parser will accept both.

We built Crossfield to make these choices explicit and executable. A semantic
model describes the datasets, what each row represents, the calculations the
business approves, and how those calculations may be grouped and combined. Query
writers select the definitions they need; Crossfield applies them to the request.

### A small retail example

Jaffle Shop is a fictional retailer used in this walkthrough. Its data has orders,
the receipt lines in each order, and the stores that accepted them. The frozen
example contains 525 orders and 834 lines. Its current model defines revenue as
order subtotals, excluding tax.

After the linked setup attaches the model as `jaffle_current`:

```sql
SELECT store_name, order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle
GROUP BY store_name
ORDER BY store_name;
```

| store_name | order_count | item_count | revenue |
| --- | ---: | ---: | ---: |
| Brooklyn | 19 | 36 | 255.00 |
| Philadelphia | 506 | 798 | 6100.00 |

Here, `item_count` counts receipt lines. Order revenue is aggregated at the order
population before it is combined with the line count. The raw join shown alongside
this query produces 1155.00 for Brooklyn; the approved order subtotals total 255.00.

Remove the store dimension and `GROUP BY` to ask for totals with the same definitions:

```sql
SELECT order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle;
```

The result is 525 orders, 834 lines and 6355.00 in revenue. A named metric supports
new questions within its declared rules; it does not limit the user to one canned
report. The model also has separate approved detail entries for inspecting rows.

### See the calculation, including the SQL

```sql
EXPLAIN (SEMANTIC)
SELECT store_name, order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle
GROUP BY store_name
ORDER BY store_name;
```

The explanation exposes the model, selected metrics, dependencies, grouping grain
and expanded SQL without executing the report or calling its providers. In this
example, you can see separate aggregates for orders and receipt lines before the
results are combined by store.

Production note: retain `SemanticExplain.astro` and its exact captured output.
Display the two existing SQL excerpts, full expansion and JSON download. Do not
write a simplified expansion and label it engine output. Explain separately that
`EXPLAIN (SQL)` binds/optimizes, while `EXPLAIN ANALYZE` executes.

### Bring models together. Make definition changes visible.

Sales and planning can maintain separate models and compare revenue with budget
at a declared shared dimension. Crossfield aggregates each input independently and
validates supported direct joins against the approved shared grain. Equal column
names alone do not establish that the dimensions mean the same thing.

Definitions can also coexist as separate attachments. In the retail example, the
older revenue definition includes tax; the current definition excludes it. On the
same fixture rows, their totals are 6730.75 and 6355.00, a difference of −375.75.
That difference is a definition change, not a decline in sales.

Production note: retain the existing complete sales/budget and revision SQL.
Label these examples **semantic mode**. Each semantic input retains its contract;
ordinary outer reconciliation is the author's calculation. Strict business queries
still require one attachment. Model versioning does not freeze source rows or
automatically provide historical data access.

### Give agents discoverable definitions and useful feedback

An agent needs to know more than which tables exist. It needs to know which
metrics are approved, which dimensions can accompany them, and which inputs are
required. Crossfield exposes that information through queryable metadata.

After the retail setup:

```sql
SELECT name, sql_name, unit, comment
FROM crossfield_members()
WHERE database_name = 'jaffle_current'
ORDER BY name;
```

Additional discovery functions describe callable signatures, dependencies,
relationships and supported combinations. Invalid requests return diagnostics
that help the caller preserve the intended question while correcting the query.
If the required calculation is not approved, the useful answer is that the model
cannot currently supply it.

Strict mode can reject raw-source calculations and unsupported transformations.
For an application serving untrusted SQL users, a trusted native host must also
control and seal the session. That is separate from an analyst enabling a setting
on a connection they control.

Action: **Read the agent integration guide**.

### Open definitions, explicit execution rules

[Apache Ossie (incubating)](https://ossie.apache.org/) defines a common format for
semantic metadata. Crossfield implements a documented subset of its model and
expression contracts, then adds explicit approval, source-binding and execution
rules for DuckDB.

The distinction matters: exchanging a metric's definition is different from
approving how it may be used against a particular source. The Ossie guide shows
the standard definitions and Crossfield additions separately, with links to the
pinned specification and executable examples.

Action: **Explore Ossie models in Crossfield**.

### From API access to analytical meaning

Query Farm's VGI makes APIs and services available to SQL. Crossfield can add the
definitions that turn that access into a reporting interface.

For a GitHub model, a caller can choose an approved repository or organization
scope and select metrics. The model owns the declared retrieval dependencies.
For weather, it can specify that precipitation labelled midnight represents the
preceding hour, so it belongs to the previous reporting day. A temperature in the
same row can still describe the instant at midnight.

These capabilities are qualified per model, worker and runtime combination.
Crossfield also works with ordinary DuckDB tables; an API worker is optional.

Actions: **Explore the examples** · **Learn about VGI**.

### Why we extended the engine

DuckDB's extension interfaces give us syntax, catalogs and execution building
blocks. Our governance requirements also reach the statement lifecycle: the
original request must survive rewriting, selected function implementations must
be checked before binding callbacks run, and prepared queries must be reconsidered
when their governing context changes.

We added narrowly scoped engine hooks and binding fixes for those requirements.
The business rules stay in Crossfield; DuckDB continues to plan and execute the
query. Query Farm's matching distribution makes those capabilities available
together. Our product does not depend on these specialized changes being accepted
upstream.

Action: **Read the engine design and patch rationale**.

### Start with a report whose answer you can check

Run the offline retail walkthrough to see definitions, results, explanation and
rejections together. Or bring Query Farm a reporting question, the current
calculation and representative data. We can discuss how to express the workload
as a semantic model and where its current limits are.

Actions: **Run the SQL walkthrough** · **Discuss your workload**.

## Ossie page: proposed core explanation

# From an Ossie model to an executable DuckDB query

Ossie supplies a vocabulary for datasets, fields, relationships and metrics.
Crossfield consumes supported definitions and applies explicit approvals to their
execution. `FROM SEMANTIC` is Crossfield's SQL interface; it is not a query syntax
mandated by Ossie.

The following excerpt comes from Crossfield's independent dataset-scoped fixture.
Its logical `amount` deliberately doubles a physical value, making it easy to
check whether a metric uses the declared field or bypasses it:

```yaml
# Excerpt from a dataset, not a standalone approved model.
name: orders
source: main.scoped_orders
fields:
  - name: amount
    datatype: Integer
    expression:
      dialects:
        - dialect: OSSIE_SQL_2026
          expression: raw_amount * 2
metrics:
  - name: revenue
    datatype: Integer
    expression:
      dialects:
        - dialect: OSSIE_SQL_2026
          expression: SUM(amount)
```

Within this dataset metric, `amount` names the declared logical field. It does
not name `raw_amount` directly. The complete fixture includes fields, a second
dataset and an explicit Crossfield approval profile.

With the fixture's source tables and approved model attached as `local_metrics`:

```sql
SELECT orders.revenue AS sales, returns.revenue AS refunds
FROM SEMANTIC local_metrics.scoped_sales;
```

The independently specified results are `84` and `7`. The source order amounts
are `10, 20, NULL, 5, 7`, doubled by the logical field; returns independently use
`3, 4`. Their populations and definitions remain separate.

Production links: [complete fixture](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/test/models/ossie-dataset-metrics.ossie.json),
[setup and numerical tests](https://github.com/Query-farm/crossfield/blob/1dbccf8b27120f01fdf886596b4f4139688d9d5e/test/sql/compiler/ossie_dataset_metrics.test),
[Ossie specification](https://github.com/apache/ossie/blob/01a5488d840deda309aac68cc0b312c195369b8d/core-spec/spec.md).
Turn these into downloadable, self-contained website instructions in the example
pass; the excerpt alone is not sufficient setup.

The page should show this compact boundary table:

| Layer | Owns |
| --- | --- |
| Supported Ossie definitions | Logical datasets, fields, relationships, model/dataset metrics and portable expression semantics |
| Crossfield declarations | Approvals, physical bindings, callable retrieval, units/populations, reporting and measurement contracts |
| Crossfield SQL interface | Attached catalogs, semantic queries, discovery and explanation |
| Matched DuckDB engine | Native binding, optimization and execution, with lifecycle hooks used by Crossfield |

Root metric composition and qualified logical-field dependencies in field recipes
are Crossfield extensions. Label those examples explicitly, including the existing
retail `revenue` alias recipe. The supported profile must also record the Decimal
AVG result-type difference and that Ossie's relational `AGG()` draft is not
implemented. A valid Ossie document without an executable supported dialect and
Crossfield approvals does not become an approved query interface automatically.

## Engine page: proposed opening and examples

# Why Crossfield ships with a custom DuckDB build

A parser can recognize a semantic query and expand it into SQL. Crossfield also
needs to enforce what that query is allowed to do after DuckDB has resolved its
tables, functions and types—and when a prepared query is used again later.

Those requirements need engine integration. We keep model interpretation and
approval in the extension, and provide generic hooks at the native lifecycle
boundaries where those decisions must take effect. DuckDB still supplies the
optimizer, vectorized execution, storage and transactions.

### A prepared query must not keep stale authority

Consider an application that prepares a report and later replaces the model
attachment. The old handle must not silently continue as though it still referred
to the approved attachment. Crossfield retains the original semantic request and
checks its execution context; attachment replacement requires the affected caller
to prepare again. Other lifecycle changes can trigger revalidation or recompilation.

A rewrite that only ran when the SQL first arrived would miss that later boundary.

### A function's spelling is not its implementation

DuckDB resolves overloads and can invoke extension callbacks during binding.
Crossfield needs to inspect the chosen definition before those callbacks run.
The binding hook supplies that point of control; provenance also helps distinguish
approved conversions from other registered implementations. Approval follows the
resolved object, not an executable function-pointer comparison.

### These mechanisms can serve other extensions

Connection-aware grammar options, named options for correlated table functions,
and parser diagnostics with structured guidance have uses beyond semantic metrics.
An extension that enforces its own query contract could also use lifecycle and
binding callbacks. These are potential applications of the interfaces; we are not
claiming adoption by other projects.

Add the eight-patch table from the plan and link to the exact patch contract and
tests. Distinguish the SQL formatter fix from the governance mechanisms.

### The distribution is part of the product

Crossfield requires compatible engine and extension builds. A matching DuckDB
version label alone is insufficient because some hooks change native interfaces.
Other native modules must also match the supported build. Query Farm's release
documentation should identify the engine source, patch set, extension build,
supported platforms and validation evidence together.

We expect to maintain the specialized integration in our distribution. Upstream
acceptance would be a separate decision by DuckDB maintainers, not a prerequisite
for using Crossfield. The tradeoff is an explicit compatibility and maintenance
responsibility, which the release documentation must make visible.

These controls govern supported SQL entry points. They do not isolate hostile
native code or supply application authentication. Explain host sealing and source
permissions on the linked compatibility page.

## Agent page: required session, not invented chat output

Build one recorded SQL session with these steps:

1. Inspect `crossfield_models()` to identify the attachment and revision.
2. Inspect `crossfield_members()` and `crossfield_member_capabilities()` for
   metrics, units and grouping requirements.
3. For a callable example, inspect `crossfield_signatures()` and use its complete
   parameter contract. Do not ask the agent to choose an internal provider ID.
4. Submit `EXPLAIN (SEMANTIC)` and show the captured metadata/expansion. Discovery
   and this explanation do not execute providers.
5. Execute a supported query and show its independent expected result.
6. Attempt an unapproved raw aggregation in strict mode; show the actual native
   diagnostic and the approved equivalent only if it preserves the question.
7. Show one genuinely unsupported request. The correct response identifies the
   missing model capability rather than dropping a filter or changing a metric.

Do not fabricate an LLM conversation and call it an evaluation. A SQL metadata
interface can be exposed through the application's chosen agent tool; the current
site must not imply that Crossfield supplies a universal agent framework, hosted
assistant or turnkey MCP integration. Link native host controls for applications
that expose SQL to arbitrary callers.

## Supporting editorial and search copy

Product card: **Approved business definitions inside DuckDB.** Query named
metrics, inspect their SQL, and compare model revisions with Crossfield.

Proposed page title: **Crossfield: a semantic layer inside DuckDB | Query.Farm**.

Proposed search description: **Query approved metrics in DuckDB with Crossfield.
Inspect generated SQL, compare model revisions, and give agents discoverable
definitions and validation.**

Launch/editorial article ideas, after the corresponding examples are ready:

- **The query was valid. The revenue was wrong.** A numerical walkthrough of
  row multiplication and the semantic definition that avoids it.
- **Why we added statement lifecycle hooks to DuckDB.** Original intent,
  selected definitions and prepared execution, with the exact patch references.
- **Give your SQL agent a model it can inspect.** A recorded discovery/error/repair
  session, including a question the model cannot answer.
- **Which day owns the rain at midnight?** Why API columns need measurement
  meaning before they become reporting metrics.

Avoid “guaranteed correct answers,” “fully Ossie compliant,” “works with every
connector,” “drop-in on stock DuckDB,” “no hallucinations,” or implying the current
Haybarn/Cupola browser builds execute Crossfield. Place real limitations beside
their features; keep the main narrative focused on the supported value.
