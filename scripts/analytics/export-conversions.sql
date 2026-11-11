-- Attach the local vgi-google-analytics worker as ga4 first.
-- Use the same complete date range for the event export and report CLI.
-- Host filtering excludes previews, local tests and unrelated sites.
COPY (
  SELECT eventName, eventCount, totalUsers, sessions
  FROM ga4.report('552129062',
    dimensions => ['eventName'],
    metrics => ['eventCount', 'totalUsers', 'sessions'],
    start_date => '2026-10-22', end_date => '2026-11-09',
    dimension_filter => '{"filter":{"fieldName":"hostName","inListFilter":{"values":["query.farm","www.query.farm"]}}}')
) TO 'events.json' (FORMAT JSON, ARRAY true);

COPY (SELECT event_name FROM ga4.key_events('552129062'))
TO 'key-events.json' (FORMAT JSON, ARRAY true);
