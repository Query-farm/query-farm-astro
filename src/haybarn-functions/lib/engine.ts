import type { AsyncDuckDB, AsyncDuckDBConnection } from '@haybarn/haybarn-wasm';
import { haybarnBundles } from '../../lib/repl/haybarn-bundles';

export { wasmVersion } from '../data/settings';
export interface Engine { db: AsyncDuckDB; worker: Worker; version: string; bundle: 'eh' | 'mvp'; }
let pending: Promise<Engine> | undefined;
let generation = 0;
let sessionId = 0;

export function ensureEngine(): Promise<Engine> {
  if (!pending) {
    const current = generation;
    pending = boot().then(engine => {
      if (current !== generation) { engine.worker.terminate(); throw new Error('Engine stopped. Run again to restart.'); }
      return engine;
    }).catch(error => { if (current === generation) pending = undefined; throw error; });
  }
  return pending;
}
async function boot(): Promise<Engine> {
  const duckdb = await import('@haybarn/haybarn-wasm');
  const bundle = await duckdb.selectBundle(haybarnBundles);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();
    try { await conn.query("SET TimeZone='UTC';"); } finally { await conn.close(); }
    return { db, worker, version: await db.getVersion(), bundle: bundle.mainModule === haybarnBundles.eh!.mainModule ? 'eh' : 'mvp' };
  } catch (error) { worker.terminate(); throw error; }
}

// Terminating the worker also stops queries on browsers without shared memory.
// All editors are told to discard their connections before the next run.
export async function resetEngine() {
  const old = pending;
  generation++;
  pending = undefined;
  document.dispatchEvent(new CustomEvent('engine-reset'));
  if (old) { try { (await old).worker.terminate(); } catch { /* Boot already failed or was superseded. */ } }
}
export async function createConnection(): Promise<{ conn: AsyncDuckDBConnection; version: string }> {
  const engine = await ensureEngine();
  const conn = await engine.db.connect();
  const database = `example_${++sessionId}`;
  try {
    await conn.query(`ATTACH ':memory:' AS ${database}; USE ${database};`);
    return { conn, version: engine.version };
  } catch (error) { await conn.close(); throw error; }
}

interface ResultType {
  typeId: number;
  scale?: number;
  timezone?: string | null;
  unit?: number;
  children?: { name: string; type: ResultType }[];
}
interface ResultColumn {
  type: ResultType;
  length: number;
  get(index: number): unknown;
  getChildAt(index: number): ResultColumn | null;
  data: readonly { length: number; values: ArrayLike<unknown> }[];
}

export function formatColumnValue(column: ResultColumn, index: number, nested = false): string {
  const value = column.get(index);
  if (value === null || value === undefined) return 'NULL';
  if (column.type.typeId === 10 && column.type.unit !== undefined) {
    let position = index;
    for (const chunk of column.data) {
      if (position >= chunk.length) { position -= chunk.length; continue; }
      const raw = chunk.values[position];
      if (typeof raw === 'bigint') {
        const nanos = raw * [1_000_000_000n, 1_000_000n, 1_000n, 1n][column.type.unit];
        let seconds = nanos / 1_000_000_000n;
        let fraction = nanos % 1_000_000_000n;
        if (fraction < 0n) { seconds--; fraction += 1_000_000_000n; }
        const date = new Date(Number(seconds * 1000n));
        if (!Number.isNaN(date.valueOf())) {
          const base = date.toISOString().replace('T', ' ').replace(/\.000Z$/, '');
          const tail = String(fraction).padStart(9, '0').replace(/0+$/, '');
          return `${base}${tail ? `.${tail}` : ''}${column.type.timezone ? '+00' : ''}`;
        }
        return `${raw} (timestamp outside JavaScript date range)`;
      }
      break;
    }
  }
  if (column.type.typeId === 13 && column.type.children) {
    return `{${column.type.children.map((field, i) => `${JSON.stringify(field.name)}: ${formatColumnValue(column.getChildAt(i)!, index, true)}`).join(', ')}}`;
  }
  return formatValue(value, column.type, nested);
}
export function formatValue(value: unknown, type: ResultType, nested = false): string {
  if (value === null || value === undefined) return 'NULL';
  if ([12, 16].includes(type.typeId) && type.children?.[0]) {
    const values = value as ResultColumn;
    return `[${Array.from({ length: values.length }, (_, i) => formatColumnValue(values, i, true)).join(', ')}]`;
  }
  if (type.typeId === 13 && type.children) {
    return `{${type.children.map(field => `${JSON.stringify(field.name)}: ${formatValue((value as Record<string, unknown>)[field.name], field.type, true)}`).join(', ')}}`;
  }
  if (type.typeId === 17 && type.children?.[0]?.type.children) {
    const [key, item] = type.children[0].type.children;
    return `MAP {${Array.from(value as Iterable<[unknown, unknown]>).map(([k, v]) => `${formatValue(k, key.type, true)}: ${formatValue(v, item.type, true)}`).join(', ')}}`;
  }
  if (type.typeId === 10 || type.typeId === 8) {
    const date = new Date(Number(value));
    if (!Number.isNaN(date.valueOf())) return type.typeId === 8 ? date.toISOString().slice(0, 10) : date.toISOString().replace('T', ' ').replace('Z', type.timezone ? '+00' : '');
  }
  if (type.typeId === 9 && type.unit !== undefined) {
    const nanos = BigInt(String(value)) * [1_000_000_000n, 1_000_000n, 1_000n, 1n][type.unit];
    const seconds = nanos / 1_000_000_000n;
    const hours = String(seconds / 3600n).padStart(2, '0');
    const minutes = String(seconds / 60n % 60n).padStart(2, '0');
    const remainder = String(seconds % 60n).padStart(2, '0');
    const fraction = String(nanos % 1_000_000_000n).padStart(9, '0').replace(/0+$/, '');
    return `${hours}:${minutes}:${remainder}${fraction ? `.${fraction}` : ''}`;
  }
  // Arrow Decimal values store an unscaled integer in a BigNum typed array.
  if (type.typeId === 7 && type.scale !== undefined) {
    const unscaled = String(value);
    if (/^-?\d+$/.test(unscaled) && type.scale > 0) {
      const digits = unscaled.replace('-', '').padStart(type.scale + 1, '0');
      return `${unscaled.startsWith('-') ? '-' : ''}${digits.slice(0, -type.scale)}.${digits.slice(-type.scale)}`;
    }
    return unscaled;
  }
  if (typeof value !== 'object') return nested && typeof value === 'string' ? JSON.stringify(value) : String(value);
  if (value instanceof Date) return value.toISOString();
  const replacer = (_key: string, item: unknown): unknown => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object' && 'toArray' in item && typeof item.toArray === 'function') return Array.from(item.toArray());
    if (ArrayBuffer.isView(item)) return Array.from(item as unknown as ArrayLike<number>);
    return item;
  };
  return JSON.stringify(value, replacer) ?? String(value);
}
