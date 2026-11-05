EXPLAIN (SEMANTIC)
SELECT issuer, gross_exposure, net_exposure
FROM SEMANTIC portfolio.exposure
GROUP BY issuer
ORDER BY issuer;
