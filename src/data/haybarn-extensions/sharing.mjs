// Page copy and sharing cards use the same metadata. The image generator can
// import this module without loading Astro's extension data pipeline.
const image = slug => `/og/haybarn-extensions/${slug}.png`;

export const directoryPage = {
  name: 'Community extensions',
  title: 'Community extensions — Haybarn',
  description: 'Find extensions for the data you work with and the tools you use. Connect a database, open a new file format, or add a new way to analyze your data in Haybarn.',
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
    title: 'SheetReader extension for Haybarn',
    description: 'Read Excel workbooks as SQL tables. Choose a worksheet, handle header rows, and control column types.',
    ogImage: image('sheetreader'),
  },
  gsheets: {
    name: 'Google Sheets', icon: 'table',
    title: 'Google Sheets extension for Haybarn',
    description: 'Read and write Google Sheets with SQL. Join a spreadsheet to your data or send query results back to a sheet.',
    ogImage: image('gsheets'),
  },
};

export const categoryPage = category => ({
  name: category.name,
  title: `${category.name} — Haybarn extensions`,
  description: category.description,
  ogImage: image(`category-${category.id}`),
});
