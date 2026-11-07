// Snapshot objects for the Pages Functions bundle. See
// src/haybarn-functions/data/function-data-paths.mjs for why the data is not
// bundled.
//
// Each object carries the snapshot's metadata. Its `functions` property throws
// until loadSnapshotData() has fetched the static copy, so a route that forgot
// to load fails loudly instead of rendering an empty catalog.
import { snapshotAssetPath } from '../data/function-data-paths.mjs';

type FetchJson = (path: string) => Promise<unknown>;

export function edgeSnapshotModules<T extends { id: string }>(metadata: T[]) {
  const snapshotModules = metadata.map(meta => Object.defineProperty({ ...meta }, 'functions', {
    configurable: true,
    enumerable: true,
    get() { throw new Error(`Snapshot ${meta.id} has not been loaded. Call loadSnapshotData() first.`); },
  }) as T & { functions: unknown[] });

  let pending: Promise<void> | undefined;
  /** Fetch every snapshot's functions once per isolate. A failed load is retried on the next request. */
  function loadSnapshotData(fetchJson: FetchJson): Promise<void> {
    pending ??= Promise.all(snapshotModules.map(async snapshot => {
      const data = await fetchJson(snapshotAssetPath(snapshot.id)) as { id?: string; functions?: unknown };
      if (data?.id !== snapshot.id || !Array.isArray(data.functions)) throw new Error(`Bad static snapshot for ${snapshot.id}`);
      Object.defineProperty(snapshot, 'functions', { value: data.functions, enumerable: true, writable: true, configurable: true });
    })).then(() => undefined, error => {
      pending = undefined;
      throw error;
    });
    return pending;
  }

  return { snapshotModules, loadSnapshotData };
}
