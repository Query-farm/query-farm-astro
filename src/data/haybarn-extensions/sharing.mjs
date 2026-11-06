// Page copy and sharing cards use the same metadata. The image generator can
// import this module without loading Astro's extension data pipeline.
const image = slug => `/og/haybarn-extensions/${slug}.png`;

export const directoryPage = {
  name: 'DuckDB extensions for Haybarn',
  title: 'DuckDB community extensions for Haybarn',
  description: 'Find DuckDB community extensions rebuilt for Haybarn. Browse by task, compare published platforms, and follow installation guides for the current release.',
  ogImage: image('directory'),
};

export const installPage = {
  name: 'Installing extensions',
  title: 'Installing Haybarn extensions',
  description: 'Install and load signed core and community extensions in Haybarn. Learn how extension channels, signature verification, caching, and package pinning work.',
  ogImage: image('install'),
};

export const referencePages = {
  sheetreader: {
    name: 'SheetReader', icon: 'file-xls',
    title: 'SheetReader DuckDB extension — Excel in Haybarn',
    description: 'Read Excel workbooks as SQL tables. Choose a worksheet, handle header rows, and control column types.',
    ogImage: image('sheetreader'),
  },
  gsheets: {
    name: 'Google Sheets', icon: 'table',
    title: 'Google Sheets DuckDB extension for Haybarn',
    description: 'Read and write Google Sheets with SQL. Join a spreadsheet to your data or send query results back to a sheet.',
    ogImage: image('gsheets'),
  },
};

export const categoryPage = category => ({
  name: `${category.name} extensions`,
  title: `${category.name} extensions for DuckDB — Haybarn`,
  description: `${category.description} Browse DuckDB extensions with published Haybarn builds, installation guides, and platform availability.`,
  ogImage: image(`category-${category.id}`),
});

export const communityPage = (extension, category) => {
  const description = extension.description.replace(/\s+/g, ' ').trim();
  const excerpt = description.length > 120 ? `${description.slice(0, 117).replace(/\s+\S*$/, '')}…` : description;
  return {
    name: extension.displayName,
    title: `${extension.displayName} DuckDB extension for Haybarn`,
    description: `${excerpt} Installation and published platforms for Haybarn.`,
    ogImage: category ? image(`category-${category.id}`) : directoryPage.ogImage,
  };
};
