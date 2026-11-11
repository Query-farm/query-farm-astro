// Per-worker icons for the Orchard directory: one generic Phosphor icon per worker, so
// cards are recognisable at a glance instead of repeating the category icon. Kept here,
// in the site, rather than in each worker's metadata.
//
// Deliberately NO brand logos: leagues, Microsoft and most vendors restrict use of
// their marks. Pick an icon that suggests what the worker does. A worker missing from
// this table falls back to its primary category's icon. Keys are slugs (repo name
// without the `vgi-` prefix); values are `ph:` icon names (https://phosphoricons.com).

export const workerIcons = {
  // Sports
  mlb: 'ph:baseball', nfl: 'ph:football-helmet', 'ncaa-football': 'ph:football',
  nba: 'ph:basketball', 'ncaa-basketball': 'ph:basketball', nhl: 'ph:hockey',
  soccer: 'ph:soccer-ball', 'us-soccer': 'ph:soccer-ball', cricket: 'ph:trophy',
  rugby: 'ph:football', tennis: 'ph:tennis-ball', golf: 'ph:golf',
  f1: 'ph:flag-checkered', nascar: 'ph:steering-wheel', ufc: 'ph:boxing-glove',
  // Markets & finance
  yfinance: 'ph:chart-line-up', kalshi: 'ph:scales', quant: 'ph:function',
  'trading-calendar': 'ph:calendar-check', iso20022: 'ph:bank',
  'etf-schwab': 'ph:chart-pie-slice', 'etf-first-trust': 'ph:chart-pie-slice', 'etf-globalx': 'ph:chart-pie-slice',
  'etf-invesco': 'ph:chart-pie-slice', 'etf-ishares': 'ph:chart-pie-slice', 'etf-jpmorgan': 'ph:chart-pie-slice',
  'etf-spdr': 'ph:chart-pie-slice', 'etf-vanguard': 'ph:chart-pie-slice', 'etf-wisdomtree': 'ph:chart-pie-slice',
  // News, social & research
  search: 'ph:magnifying-glass', news: 'ph:newspaper', google: 'ph:cloud-arrow-down',
  wikipedia: 'ph:book-open-text', scholar: 'ph:graduation-cap', hackernews: 'ph:chats-circle',
  bluesky: 'ph:at',
  // Maps, places & weather
  geocode: 'ph:map-pin', libpostal: 'ph:envelope-simple', proj: 'ph:globe-simple',
  arcgis: 'ph:map-trifold', mvt: 'ph:squares-four', 'open-meteo': 'ph:cloud-sun',
  // Cloud & SaaS
  'azure-directory': 'ph:address-book', 'azure-signins': 'ph:sign-in', 'azure-defender': 'ph:shield-warning',
  'azure-risk': 'ph:warning-diamond', 'azure-loganalytics': 'ph:list-magnifying-glass',
  'azure-resourcegraph': 'ph:graph', 'azure-governance': 'ph:gavel', 'azure-cost': 'ph:currency-dollar',
  'azure-files': 'ph:folder-open', github: 'ph:git-branch',
  // Databases & enterprise
  adbc: 'ph:database', elasticsearch: 'ph:magnifying-glass-plus', odata: 'ph:plugs-connected',
  cdc: 'ph:arrows-clockwise', kinesis: 'ph:wave-sine', graphql: 'ph:share-network',
  grpc: 'ph:plugs', soap: 'ph:envelope', ldap: 'ph:tree-structure', scim: 'ph:users-three', cache: 'ph:lightning',
  // AI & language
  llm: 'ph:sparkle', embed: 'ph:vector-three', rerank: 'ph:sort-ascending', tiktoken: 'ph:coins',
  tantivy: 'ph:binoculars', nlp: 'ph:text-aa', translate: 'ph:translate', grammar: 'ph:pencil-line',
  pii: 'ph:eye-slash', typesafe: 'ph:list-checks',
  // Statistics & ML
  statsmodels: 'ph:chart-scatter', survival: 'ph:heartbeat', causal: 'ph:arrows-split',
  anomaly: 'ph:warning-circle', explain: 'ph:lightbulb', recommender: 'ph:thumbs-up',
  'scikit-learn': 'ph:brain', ortools: 'ph:path', sympy: 'ph:math-operations', match: 'ph:link-simple',
  // Science & health
  chem: 'ph:atom', 'scikit-bio': 'ph:dna', hl7: 'ph:heartbeat', fhir: 'ph:first-aid-kit',
  // Security & forensics
  yara: 'ph:bug', ioc: 'ph:crosshair', cve: 'ph:shield-warning', threatintel: 'ph:detective',
  sigma: 'ph:siren', evtx: 'ph:list-bullets', mft: 'ph:hard-drives', reghive: 'ph:tree-structure',
  disasm: 'ph:cpu', pe: 'ph:file-code', secretscan: 'ph:key', saml: 'ph:identification-card',
  x509: 'ph:certificate', tlsfp: 'ph:fingerprint', mask: 'ph:password',
  // File formats & encodings
  asn1: 'ph:brackets-curly', bson: 'ph:brackets-curly', cbor: 'ph:brackets-square', compress: 'ph:file-zip',
  charset: 'ph:text-t', fixedformat: 'ph:columns', x12: 'ph:receipt', jolt: 'ph:arrows-left-right',
  xslt: 'ph:code', feed: 'ph:rss', sourcemap: 'ph:map-trifold', ical: 'ph:calendar', grok: 'ph:text-align-left',
  // Documents & media
  tika: 'ph:file-text', pdf: 'ph:file-pdf', poi: 'ph:table', docgen: 'ph:file-doc',
  chart: 'ph:chart-bar', image: 'ph:image', barcode: 'ph:barcode', audio: 'ph:waveform',
  media: 'ph:film-strip', vision: 'ph:eye',
  // Dates, units & validation
  conform: 'ph:check-circle', units: 'ph:ruler', color: 'ph:palette', useragent: 'ph:browser',
  calendar: 'ph:calendar-dots', rules: 'ph:flow-arrow', opa: 'ph:lock-key', fsm: 'ph:graph',
  // Developer & observability
  code: 'ph:code', pprof: 'ph:flame', perf: 'ph:gauge', symbols: 'ph:hash', netflow: 'ph:network',
  bgp: 'ph:globe-hemisphere-west',
};
