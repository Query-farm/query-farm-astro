-- Deliberate rejection: this mean has no approved duration-weighted recipe.
-- Expected diagnostic: MEASUREMENT_AGGREGATION_REQUIRED.
SET crossfield_mode = 'strict';
SELECT report_day, unsafe_mean
FROM SEMANTIC weather_model.measurements GROUP BY report_day;
