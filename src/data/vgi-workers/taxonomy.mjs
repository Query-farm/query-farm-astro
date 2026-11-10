// Orchard worker taxonomy — curated, purpose-first (what you'd reach for the
// worker to do), never quality or availability. Every listed worker must sit
// in at least one category: index.ts fails the build if one is unclassified,
// the same contract pages/products/extensions.astro enforces for extensions.
//
// `members` are worker slugs (repo name without the `vgi-` prefix). A worker
// may appear in two categories when it genuinely serves both audiences
// (e.g. evtx is forensics AND log analytics), but keep that rare: the first
// category listed for a worker is its primary one, used for the card tint.

export const categories = [
  {
    id: 'finance', name: 'Finance & markets', icon: 'ph:chart-line-up', tint: 'gold',
    description: 'Market data, ETF holdings, trading calendars and quantitative pricing.',
    members: 'yfinance etf-schwab etf-first-trust etf-globalx etf-invesco etf-ishares etf-jpmorgan etf-spdr etf-vanguard etf-wisdomtree trading-calendar quant iso20022',
  },
  {
    id: 'security', name: 'Security & forensics', icon: 'ph:shield-check', tint: 'clay',
    description: 'Threat intel, detection rules, DFIR artefacts, secrets and certificates.',
    members: 'yara ioc cve threatintel sigma evtx mft reghive disasm pe secretscan saml x509 tlsfp mask',
  },
  {
    id: 'formats', name: 'Formats & parsing', icon: 'ph:file-code', tint: 'slate',
    description: 'Decode binary and legacy formats into rows: EDI, ASN.1, CBOR, fixed-width and more.',
    members: 'asn1 bson cbor compress charset fixedformat x12 jolt xslt ical feed sourcemap',
  },
  {
    id: 'documents', name: 'Documents & media', icon: 'ph:files', tint: 'plum',
    description: 'Extract text, tables and metadata from PDFs, Office files, images, audio and video.',
    members: 'tika pdf poi docgen chart image barcode audio media vision',
  },
  {
    id: 'ai', name: 'AI & language', icon: 'ph:brain', tint: 'plum',
    description: 'LLMs, embeddings, reranking, tokenisation, NLP and translation from SQL.',
    members: 'llm embed rerank tiktoken tantivy nlp translate grammar pii',
  },
  {
    id: 'analytics', name: 'Statistics & ML', icon: 'ph:chart-scatter', tint: 'moss',
    description: 'Regression, survival, causal inference, anomaly detection, optimisation and recommenders.',
    members: 'statsmodels survival causal anomaly explain recommender ortools sympy match',
  },
  {
    id: 'geo', name: 'Geo & places', icon: 'ph:globe-hemisphere-west', tint: 'field',
    description: 'Geocoding, address parsing, coordinate systems and calendars of places.',
    members: 'geocode libpostal proj calendar',
  },
  {
    id: 'quality', name: 'Data quality', icon: 'ph:check-square', tint: 'field',
    description: 'Validate and normalise identifiers, units, colours and user agents.',
    members: 'conform units color useragent',
  },
  {
    id: 'science', name: 'Science & health', icon: 'ph:flask', tint: 'moss',
    description: 'Cheminformatics and clinical data standards (HL7, FHIR).',
    members: 'chem hl7 fhir',
  },
  {
    id: 'web', name: 'Web & public data', icon: 'ph:newspaper', tint: 'gold',
    description: 'Web search, news, Wikipedia and scholarly literature.',
    members: 'search news wikipedia scholar google mlb',
  },
  {
    id: 'cloud', name: 'Cloud & enterprise', icon: 'ph:cloud', tint: 'slate',
    description: 'Microsoft Entra, Defender, Azure Monitor, cost and resource inventory; enterprise services.',
    members: 'azure-directory azure-signins azure-defender azure-risk azure-loganalytics azure-resourcegraph azure-governance azure-cost azure-files elasticsearch odata',
  },
  {
    id: 'devtools', name: 'Developer & systems', icon: 'ph:code', tint: 'slate',
    description: 'Source code, profiles, symbolication and network telemetry.',
    members: 'github code pprof perf symbols netflow bgp',
  },
].map(c => ({ ...c, members: c.members.split(/\s+/).filter(Boolean) }));

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
