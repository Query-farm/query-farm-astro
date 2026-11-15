// Orchard worker taxonomy — curated, purpose-first (what you'd reach for the
// worker to do), never quality or availability. Every listed worker must sit
// in at least one category: index.ts fails the build if one is unclassified,
// the same contract pages/products/extensions.astro enforces for extensions.
//
// `members` are worker slugs (repo name without the `vgi-` prefix). A worker
// may appear in two categories when it genuinely serves both audiences
// (e.g. evtx is forensics AND log analytics), but keep that rare: the first
// category listed for a worker is its primary one, used for the card tint.

// Two groups answer the first question a visitor has: does this connector bring
// data in from somewhere, or does it work on data I already have?
export const groups = [
  { id: 'sources', name: 'Bring data in', description: 'Connectors that fetch from a service, an API or a published dataset.' },
  { id: 'compute', name: 'Work on your data', description: 'Functions and parsers you apply to your own rows and files.' },
];

export const categories = [
  // ── Bring data in ──────────────────────────────────────────────────────────
  {
    id: 'sports', group: 'sources', name: 'Sports', icon: 'ph:trophy', tint: 'field',
    description: 'Scores, standings, box scores, play-by-play and player stats across leagues.',
    members: 'mlb nfl nba nhl ncaa-football ncaa-basketball soccer us-soccer cricket rugby tennis golf f1 nascar ufc',
  },
  {
    id: 'finance', group: 'sources', name: 'Markets & finance', icon: 'ph:chart-line-up', tint: 'gold',
    description: 'Market data, ETF holdings, prediction markets, trading calendars, pricing and payments messages.',
    members: 'yfinance etf-schwab etf-first-trust etf-globalx etf-invesco etf-ishares etf-jpmorgan etf-spdr etf-vanguard etf-wisdomtree kalshi quant trading-calendar iso20022 ccxt perps polymarket',
  },
  {
    id: 'economy', group: 'sources', name: 'Economic & government data', icon: 'ph:bank', tint: 'moss',
    description: 'Official statistics from central banks and statistical agencies: national accounts, prices, labour, energy and public finance.',
    members: 'fred bea bls eia treasury ecb boe boj',
  },
  {
    id: 'web', group: 'sources', name: 'News, social & research', icon: 'ph:newspaper', tint: 'gold',
    description: 'Web search, news, social networks, Wikipedia and scholarly literature.',
    members: 'search news wikipedia scholar hackernews bluesky opengraph',
  },
  {
    id: 'geo', group: 'sources', name: 'Maps & places', icon: 'ph:map-trifold', tint: 'field',
    description: 'Geocoding, addresses, map services and tiles, coordinate systems, elevation, point clouds and spatial statistics.',
    members: 'geocode libpostal proj arcgis mvt terrain lidar trajectory ducks pysal',
  },
  {
    id: 'weather', group: 'sources', name: 'Weather, ocean & earth', icon: 'ph:cloud-sun', tint: 'moss',
    description: 'Forecasts and observations, ocean buoys and tides, river gauges and satellite imagery.',
    members: 'open-meteo nws buoys tides hydrology earth-observation',
  },
  {
    id: 'cloud', group: 'sources', name: 'Microsoft Azure', icon: 'ph:cloud', tint: 'slate',
    description: 'Microsoft Entra, Defender, Azure Monitor, cost and resource inventory, governance and file shares.',
    members: 'azure-directory azure-signins azure-defender azure-risk azure-loganalytics azure-resourcegraph azure-governance azure-cost azure-files',
  },
  {
    id: 'saas', group: 'sources', name: 'SaaS & APIs', icon: 'ph:plugs-connected', tint: 'plum',
    description: 'Your accounts on hosted services: GitHub, Cloudflare, Slack, Google APIs, Analytics and Search Console.',
    members: 'github cloudflare slack google google-analytics google-search-console',
  },
  {
    id: 'enterprise', group: 'sources', name: 'Databases & enterprise', icon: 'ph:database', tint: 'slate',
    description: 'Other databases, search clusters, streams, directories and enterprise APIs.',
    members: 'elasticsearch odata cdc kinesis graphql grpc soap ldap scim cache rdf',
  },
  // ── Work on your data ──────────────────────────────────────────────────────
  {
    id: 'ai', group: 'compute', name: 'AI & language', icon: 'ph:brain', tint: 'plum',
    description: 'LLMs (including Anthropic\'s API), embeddings, reranking, tokenisation, search indexes, NLP and translation from SQL.',
    members: 'llm anthropic embed rerank tiktoken tantivy nlp translate grammar pii typesafe',
  },
  {
    id: 'analytics', group: 'compute', name: 'Statistics & ML', icon: 'ph:chart-scatter', tint: 'moss',
    description: 'Regression, survival, causal inference, anomaly detection, machine learning, optimisation and recommenders.',
    members: 'statsmodels survival causal anomaly explain recommender scikit-learn ortools sympy match lightgbm xgboost pysal',
  },
  {
    id: 'science', group: 'compute', name: 'Science & health', icon: 'ph:flask', tint: 'moss',
    description: 'Cheminformatics, bioinformatics and clinical data standards (HL7, FHIR).',
    members: 'chem scikit-bio hl7 fhir',
  },
  {
    id: 'security', group: 'compute', name: 'Security & forensics', icon: 'ph:shield-check', tint: 'clay',
    description: 'Threat intel, detection rules, DFIR artefacts, secrets and certificates.',
    members: 'yara ioc cve threatintel sigma evtx mft reghive disasm pe secretscan saml x509 tlsfp mask',
  },
  {
    id: 'formats', group: 'compute', name: 'File formats & encodings', icon: 'ph:file-code', tint: 'slate',
    description: 'Decode binary, legacy and log formats into rows: EDI, ASN.1, CBOR, fixed-width and more.',
    members: 'asn1 bson cbor compress charset fixedformat x12 jolt xslt feed sourcemap ical grok',
  },
  {
    id: 'documents', group: 'compute', name: 'Documents & media', icon: 'ph:files', tint: 'plum',
    description: 'Extract text, tables and metadata from PDFs, Office files, images, audio and video.',
    members: 'tika pdf poi docgen chart image barcode audio media vision',
  },
  {
    id: 'quality', group: 'compute', name: 'Dates, units & validation', icon: 'ph:check-square', tint: 'field',
    description: 'Validate and normalise identifiers, units, colours, dates and user agents; evaluate rules and policies.',
    members: 'conform units color useragent calendar rules opa fsm',
  },
  {
    id: 'devtools', group: 'compute', name: 'Developer, network & observability', icon: 'ph:code', tint: 'slate',
    description: 'Source code, profiles, symbolication, logs, and network telemetry: NetFlow, BGP and SNMP devices.',
    members: 'code pprof perf symbols netflow bgp snmp evtx',
  },
].map(c => ({ ...c, members: c.members.split(/\s+/).filter(Boolean) }));

// Families: workers that are one product line split per service or issuer. The
// directory shows a family as a single card listing its members, so nine Azure
// connectors read as one choice rather than nine near-duplicates.
export const families = [
  {
    id: 'azure', name: 'Microsoft Azure', icon: 'ph:cloud',
    description: 'Entra directory and sign-ins, Defender, risk, Log Analytics, Resource Graph, governance, cost and Microsoft 365 files.',
    members: 'azure-directory azure-signins azure-defender azure-risk azure-loganalytics azure-resourcegraph azure-governance azure-cost azure-files',
  },
  {
    id: 'etf', name: 'ETF holdings', icon: 'ph:chart-pie-slice',
    description: 'Fund lists, holdings, NAV history and distributions, one connector per issuer.',
    members: 'etf-vanguard etf-ishares etf-spdr etf-schwab etf-invesco etf-jpmorgan etf-first-trust etf-globalx etf-wisdomtree',
  },
].map(f => ({ ...f, members: f.members.split(/\s+/).filter(Boolean) }));

export function familyFor(slug) {
  return families.find(f => f.members.includes(slug));
}

// Terms people search for that a worker's own metadata may not say.
export const searchAliases = {
  poi: ['Excel', 'xlsx', 'spreadsheet', 'workbook'],
  tika: ['OCR', 'Word', 'docx', 'extract text'],
  llm: ['OpenAI', 'Claude', 'GPT', 'prompt', 'classify text'],
  embed: ['vector', 'RAG', 'semantic search', 'embeddings'],
  rerank: ['RAG', 'cross-encoder'],
  tantivy: ['full-text search', 'BM25', 'Lucene'],
  libpostal: ['address', 'street', 'postcode'],
  geocode: ['reverse geocode', 'city', 'timezone', 'lat lon'],
  conform: ['phone number', 'email', 'IBAN', 'VAT', 'validate'],
  yfinance: ['stocks', 'Yahoo', 'OHLCV', 'quotes', 'tickers'],
  'trading-calendar': ['NYSE', 'business days', 'market holidays'],
  sigma: ['SIEM', 'detection rules', 'SOC'],
  evtx: ['Windows event log', 'SIEM'],
  x12: ['EDI', 'EDIFACT', 'healthcare claims', '837'],
  'azure-directory': ['Entra ID', 'Active Directory', 'users', 'groups'],
  fhir: ['healthcare', 'patients', 'EHR'],
  hl7: ['healthcare', 'clinical messages'],
};

export const tintClasses = {
  gold:  { tile: 'bg-cat-gold',  ink: 'text-cat-gold-ink' },
  clay:  { tile: 'bg-cat-clay',  ink: 'text-cat-clay-ink' },
  slate: { tile: 'bg-cat-slate', ink: 'text-cat-slate-ink' },
  plum:  { tile: 'bg-cat-plum',  ink: 'text-cat-plum-ink' },
  moss:  { tile: 'bg-cat-moss',  ink: 'text-cat-moss-ink' },
  field: { tile: 'bg-cat-field', ink: 'text-cat-field-ink' },
};

export function categoriesFor(slug) {
  return categories.filter(c => c.members.includes(slug));
}
