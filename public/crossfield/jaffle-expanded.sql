WITH "__crossfield_scope_24c10d4f-4e0f-4205-939c-a4ca24adfe0b"(
    __scope_column_0,
    __scope_column_1,
    __scope_column_2,
    __scope_column_3) AS (
        SELECT
            __scope_column_0 AS store_name,
            __scope_column_1 AS order_count,
            __scope_column_2 AS item_count,
            __scope_column_3 AS revenue
        FROM (
                WITH "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd" AS (
                        SELECT
                            __cf_source_1."name" AS __cf_d0,
                            "system".main.count(__cf_source_0.id) AS __cf_metric_0,
                            "system".main.sum(__cf_source_0.subtotal) AS __cf_metric_1,
                            1 AS __cf_present
                        FROM (warehouse.main.orders AS __cf_source_0
                                INNER JOIN warehouse.main.stores AS __cf_source_1 ON ((__cf_source_0.store_id = __cf_source_1.id))
                            )
                        GROUP BY __cf_source_1."name"
                    ),
                    "__crossfield_fact_aa01cb34-1fb3-4c64-86f9-09e0cff0c5e4" AS (
                        SELECT
                            __cf_source_2."name" AS __cf_d0,
                            "system".main.count(__cf_source_0.id) AS __cf_metric_0,
                            1 AS __cf_present
                        FROM ((warehouse.main.items AS __cf_source_0
                                        INNER JOIN warehouse.main.orders AS __cf_source_1 ON ((__cf_source_0.order_id = __cf_source_1.id))
                                    )
                                INNER JOIN warehouse.main.stores AS __cf_source_2 ON ((__cf_source_1.store_id = __cf_source_2.id))
                            )
                        GROUP BY __cf_source_2."name"
                    )
                SELECT
                    __cf_keys.__cf_d0 AS store_name,
                    "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd".__cf_metric_0 AS order_count,
                    "__crossfield_fact_aa01cb34-1fb3-4c64-86f9-09e0cff0c5e4".__cf_metric_0 AS item_count,
                    "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd".__cf_metric_1 AS revenue
                FROM ((((
                                                SELECT __cf_d0
                                                FROM "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd"
                                            )
                                        UNION (
                                                SELECT __cf_d0
                                                FROM "__crossfield_fact_aa01cb34-1fb3-4c64-86f9-09e0cff0c5e4"
                                            )
                                    ) AS __cf_keys
                                LEFT JOIN
                                    "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd" ON ((__cf_keys.__cf_d0 IS NOT DISTINCT
                                                FROM "__crossfield_fact_4c8b94a3-cdab-421d-b2d5-bd22199e99fd".__cf_d0
                                            ))
                            )
                        LEFT JOIN
                            "__crossfield_fact_aa01cb34-1fb3-4c64-86f9-09e0cff0c5e4" ON ((__cf_keys.__cf_d0 IS NOT DISTINCT
                                        FROM "__crossfield_fact_aa01cb34-1fb3-4c64-86f9-09e0cff0c5e4".__cf_d0
                                    ))
                    )
                ORDER BY __cf_keys.__cf_d0
            ) AS __scope_input(__scope_column_0, __scope_column_1, __scope_column_2, __scope_column_3)
    )
SELECT
    __scope_column_0 AS store_name,
    __scope_column_1 AS order_count,
    __scope_column_2 AS item_count,
    __scope_column_3 AS revenue
FROM "__crossfield_scope_24c10d4f-4e0f-4205-939c-a4ca24adfe0b"
