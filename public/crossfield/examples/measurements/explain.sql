SET crossfield_mode = 'strict';
EXPLAIN (SEMANTIC)
SELECT location, report_day, rainfall, weighted_flux
FROM SEMANTIC weather_model.measurements
GROUP BY location, report_day ORDER BY location, report_day;
