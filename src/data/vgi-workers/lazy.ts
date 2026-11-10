// Very large catalogs render each catalog-explorer row's body as its own static
// fragment, fetched on first open, instead of inlining megabytes of argument
// docs into the worker page. See CatalogExplorer.astro.
import { groupOverloads, type Worker } from './index';

export const LAZY_OVER = 200;

export const objectCount = (w: Worker) =>
  w.schemas.reduce((n, s) => n + s.tables.length + groupOverloads(s.functions).size, 0);

export const lazyCatalog = (w: Worker) => objectCount(w) > LAZY_OVER;

export const objectFragmentUrl = (slug: string, anchor: string) => `/products/orchard/connectors/${slug}/objects/${anchor}/`;

/** The explorer row id for an object — the same anchor search results deep-link to. */
export const objectAnchor = (schema: string, name: string) => `obj-${schema}-${name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
