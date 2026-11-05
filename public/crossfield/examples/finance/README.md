# Portfolio exposure and execution price

Independently authored, synthetic cash-equity data for the Crossfield website.
All values are USD. The example assumes prices, currency conversion, issuer identity,
and position values have already been supplied correctly. No live API is used.

## Run

Use the matching Crossfield engine and extension. From this extracted directory:

```sh
/path/to/matched/haybarn -unsigned -init /dev/null :memory: \
  -cmd "LOAD '/absolute/path/to/crossfield.duckdb_extension';" < session.sql
```

`haybarn` is the CLI name in the verified shared-engine build. Substitute your
matched CLI path; stock DuckDB does not provide Crossfield's required lifecycle hooks.
`session.sql` loads the data, attaches the models, executes the queries, and prints
EXPLAIN (SEMANTIC). Run once per fresh connection. The `.read` commands are CLI syntax.

## Business rules

- Current exposure: January 31, 2024, Book A and Book B; signed cash-equity market
  values already in USD. Gross is SUM(ABS(value)); net is SUM(value).
- Proposed exposure: same date and formulas, also include the Expansion book.
- The two exposure packages share a package ID and have revisions 1 and 2.
  They import the same semantic definitions; only the population policy changes.
- The January 30 position must not contribute to either snapshot.
- The limits model contains a $22m Atlas limit. No Boreal record exists; NULL is
  an absent limit, not zero. Joining models requires explicit shared issuer metadata.
- Execution price: active fills only, SUM(shares * price) / SUM(shares).
  The void fill is excluded. It is our order's quantity-weighted execution price,
  excluding fees, not a market-wide VWAP benchmark. Zero shares yields NULL.

The source rows and explicit expected-results.txt supply a manual oracle. The test
uses the normal native SQLLogicTest runner, with optimizer enabled and disabled.
See verification.txt for fresh execution evidence and the matched engine pin.

The model-owned fixed date keeps this example focused. A production daily reporting
model needs an explicit as-of interface and applicable temporal aggregation rules.
This is a reporting example, not a pricing system or a complete risk system.

Ossie definitions live in *.ossie.json. Crossfield manifests add approval, source
bindings, population, units, and shared-dimension policies. Root metric composition
and the package/catalog interface belong to Crossfield's supported profile; this
bundle is not presented as a universal Apache Ossie interchange example.

All fixture rows, models, and SQL were independently authored for Query Farm.
