WITH "__crossfield_scope_5493b7ab-4c66-43f7-a15f-c7d876b53c19"(
    __scope_column_0,
    __scope_column_1,
    __scope_column_2) AS (
        SELECT
            __scope_column_0 AS issuer,
            __scope_column_1 AS gross_exposure,
            __scope_column_2 AS net_exposure
        FROM (
                WITH "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528" AS (
                        SELECT
                            __cf_source_0.issuer AS __cf_d0,
                            "system".main.sum("system".main.abs(__cf_source_0.market_value_usd)) AS __cf_metric_0,
                            "system".main.sum(__cf_source_0.market_value_usd) AS __cf_metric_1,
                            1 AS __cf_present
                        FROM warehouse.main.positions AS __cf_source_0
                        WHERE ((__cf_source_0.as_of = CAST('2024-01-31' AS DATE)) AND (__cf_source_0.book IN ('Book A', 'Book B')))
                        GROUP BY __cf_source_0.issuer
                    )
                SELECT
                    __cf_keys.__cf_d0 AS issuer,
                    "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528".__cf_metric_0 AS gross_exposure,
                    "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528".__cf_metric_1 AS net_exposure
                FROM ((
                                SELECT __cf_d0
                                FROM "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528"
                            ) AS __cf_keys
                        LEFT JOIN
                            "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528" ON ((__cf_keys.__cf_d0 IS NOT DISTINCT
                                        FROM "__crossfield_fact_ef3c92dc-e0ee-45ef-9137-570876360528".__cf_d0
                                    ))
                    )
                ORDER BY __cf_keys.__cf_d0
            ) AS __scope_input(__scope_column_0, __scope_column_1, __scope_column_2)
    )
SELECT
    __scope_column_0 AS issuer,
    __scope_column_1 AS gross_exposure,
    __scope_column_2 AS net_exposure
FROM "__crossfield_scope_5493b7ab-4c66-43f7-a15f-c7d876b53c19"
