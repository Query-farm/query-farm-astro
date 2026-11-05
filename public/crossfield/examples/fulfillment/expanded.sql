WITH "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b" AS (
        SELECT
            __cf_source_0.region AS __cf_d0,
            "system".main.count(__cf_source_0.id) AS __cf_metric_0,
            "system".main.sum(
                CASE
                    WHEN (((__cf_source_0.delivered_units >= __cf_source_0.ordered_units) AND (__cf_source_0.last_delivered_date <= __cf_source_0.original_promised_date))) THEN (1)
                    ELSE 0
                END) AS __cf_metric_1,
            ((100.0 * "system".main.sum(
                CASE
                    WHEN (((__cf_source_0.delivered_units >= __cf_source_0.ordered_units) AND (__cf_source_0.last_delivered_date <= __cf_source_0.original_promised_date))) THEN (1)
                    ELSE 0
                END)) / "system".main.count(__cf_source_0.id)) AS __cf_metric_2,
            1 AS __cf_present
        FROM warehouse.main.order_facts AS __cf_source_0
        WHERE ((__cf_source_0.original_promised_date = CAST('2024-01-31' AS DATE)) AND (__cf_source_0.status != 'cancelled'))
        GROUP BY __cf_source_0.region
    )
SELECT
    __cf_keys.__cf_d0 AS region,
    "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b".__cf_metric_0 AS eligible_orders,
    "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b".__cf_metric_1 AS on_time_orders,
    "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b".__cf_metric_2 AS on_time_percent
FROM ((
                SELECT __cf_d0
                FROM "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b"
            ) AS __cf_keys
        LEFT JOIN
            "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b" ON ((__cf_keys.__cf_d0 IS NOT DISTINCT
                        FROM "__crossfield_fact_bbd41d58-a472-44de-bd04-78121436d06b".__cf_d0
                    ))
    )
ORDER BY __cf_keys.__cf_d0
