// The data farm's product catalog — shared between /products (the full
// card grid) and Header.astro (the top-nav "Products" dropdown), so the two
// never drift the way VGI's per-page nav lists did before they got
// consolidated. Add a new product here once, and it shows up in both places.
export interface ProductTile {
  title: string;
  eyebrow: string;
  outcome: string;
  description: string;
  href: string;
  cta: string;
  status: 'available' | 'preview' | 'development';
  img?: string;
  emoji?: string;
}

export const platformComponents: ProductTile[] = [
  {
    img: '/images/duckdb-icon.svg',
    title: 'Extensions',
    eyebrow: 'Installable SQL capabilities',
    outcome: 'Connect systems and add SQL capabilities.',
    description: 'Install connectors, transformations, sketches, scripting, geospatial, JSON, text, and operational tools without building native extension plumbing yourself.',
    href: '/products/extensions',
    cta: 'Browse extensions',
    status: 'available',
  },
  {
    emoji: '🌳',
    title: 'Orchard',
    eyebrow: 'Connector marketplace',
    outcome: 'Discover, subscribe to, and reuse connectors.',
    description: 'The marketplace for VGI workers and connectors — find a connector, subscribe, and attach it from DuckDB or Haybarn with one line of SQL.',
    href: '/products/orchard',
    cta: 'Visit the Orchard',
    status: 'preview',
  },
  {
    img: '/vgi/vgi-logo.png',
    title: 'VGI',
    eyebrow: 'Vector Gateway Interface',
    outcome: 'Run custom or reusable workers from SQL.',
    description: 'Make APIs, services, models, and business logic available as SQL-accessible tables and functions through Apache Arrow–based workers — in Python, TypeScript, Go, Rust, or Java.',
    href: '/vgi',
    cta: 'Learn about VGI',
    status: 'available',
  },
  {
    img: '/rowfence/rowfence-icon.svg',
    title: 'Rowfence',
    eyebrow: 'Row & column security for VGI',
    outcome: 'Enforce row, column, and function access.',
    description: 'A Cedar-policy proxy that sits in front of any VGI worker and decides, on every query, which rows, columns, and functions a caller can touch — hosted or on your own infrastructure.',
    href: '/products/rowfence',
    cta: 'Explore Rowfence',
    status: 'preview',
  },
  {
    img: '/products/haybarn/haybarn-mark.svg',
    title: 'Haybarn',
    eyebrow: 'Independent distribution',
    outcome: 'Bring DuckDB into the enterprise.',
    description: 'Same SQL and database files as DuckDB, with faster object-store reads, signed artifacts, build provenance, curated extension defaults, and mirrorable npm / PyPI channels.',
    href: '/products/haybarn',
    cta: 'Explore Haybarn',
    status: 'available',
  },
  {
    img: '/cupola/cupola-mark.svg',
    title: 'Cupola',
    eyebrow: 'Web workspace for VGI',
    outcome: 'Browse and query workers in the browser.',
    description: 'An open-source, WASM-powered web workspace for VGI: browse catalogs, run SQL, pivot data, and use a built-in AI agent — free and available now.',
    href: '/products/cupola',
    cta: 'Explore Cupola',
    status: 'available',
  },
];
