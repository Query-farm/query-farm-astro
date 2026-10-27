# Complete orders, delivered on time

Independently authored synthetic data, definitions and expected answers for the
Crossfield website. No third-party dataset, API, worker or service is used.

## Run

Extract fulfillment.zip, change into fulfillment/, and use a matching engine:

```sh
/path/to/matched/haybarn -unsigned -init /dev/null :memory: \
  -cmd "LOAD '/absolute/path/to/crossfield.duckdb_extension';" < session.sql
```

Or start the CLI and execute `.bail on`, `.read setup.sql`, `.read run.sql`,
and `.read explain.sql`. Run setup once per fresh connection.

Engine requirement: shared Haybarn engine
6d01968ba1ee4973483e3e67c9a1f58864a1ea9f, based on DuckDB 2.0
snapshot d54cbbe3df17e8e5ce68312f483b4155836112aa, with its matching Crossfield
extension. No binaries are included; stock DuckDB is not a substitute.

## Meaning and expected results

The population is non-canceled orders originally due January 31, 2024.
The observation cutoff is February 3 inclusive. Dates are UTC business dates.
`setup.sql` prepares a stored `order_facts` table from orders and shipments,
summing delivered units and retaining the last delivery date by order. This
source preparation does not automatically refresh. It is not a Crossfield
materialized report. Source assumptions: distinct orders/shipments, positive
ordered quantities, no returns, and a consistent snapshot.

The model owns population selection and the complete, on-time calculation.
Orders with incomplete deliveries remain in the denominator. Future deliveries,
canceled orders and orders with a different original due date are excluded.

By region: North 2 eligible / 1 on time / 50 percent; South 2 / 1 / 50.
Overall: 4 eligible / 2 on time / 50 percent. An empty region returns
COUNT=0, SUM=NULL and percentage=NULL.

The revised package uses revised promise dates for the deadline, while retaining
the SAME original January 31 reporting population. A101 changes from late to
on-time. The answer becomes 75 percent, a 25 percentage point difference.
Both package revisions read the same stored facts.

Five of six observed shipments for eligible orders were on time: 83.333... percent.
That shipment measure does not describe how many complete orders were on time.
See expected-results.txt for the manually established arithmetic.

The two package revisions contain the exact readable Ossie/manifest documents
and their SHA-256 digests. Attach uses these embedded copies. EXPLAIN output is
captured native output, including unstable generated aliases. The numerical
answers are independent expectations, not an engine-generated oracle.

fulfillment.test runs through DuckDB's standard native SQLLogicTest runner.
verification.txt records fresh execution evidence and commands. The models use
trusted source-key evidence and do not certify production source quality.
