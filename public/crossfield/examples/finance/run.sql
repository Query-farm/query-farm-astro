SET crossfield_mode = 'strict';

SELECT issuer, gross_exposure, net_exposure
FROM SEMANTIC portfolio.exposure
GROUP BY issuer
ORDER BY issuer;

SELECT book, gross_exposure, net_exposure
FROM SEMANTIC portfolio.exposure
GROUP BY book
ORDER BY book;

SELECT gross_exposure, net_exposure
FROM SEMANTIC portfolio.exposure;

SELECT order_id, filled_shares, execution_cost, execution_price
FROM SEMANTIC trading.executions
GROUP BY order_id;

SET crossfield_mode = 'semantic';

SELECT p.issuer, p.gross_exposure, l.gross_limit
FROM SEMANTIC portfolio.exposure AS p
LEFT JOIN SEMANTIC risk.limits AS l
  ON p.issuer = l.issuer
GROUP BY p.issuer
ORDER BY p.issuer;

WITH current AS (
  SELECT gross_exposure FROM SEMANTIC portfolio.exposure
), candidate AS (
  SELECT gross_exposure FROM SEMANTIC proposed.exposure
)
SELECT current.gross_exposure AS current_exposure,
       candidate.gross_exposure AS proposed_exposure,
       candidate.gross_exposure - current.gross_exposure AS change
FROM current CROSS JOIN candidate;
