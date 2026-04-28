import type {
  ExtensionData,
  ExtensionMetadata,
  FunctionDocData,
  Pragma,
  Secret,
  Macro,
  Filesystem,
  StorageExtension,
  LogType,
  LogStorageType,
  TechnicalOverview,
  PricingInfo,
} from './extension-types';

type Keyed = { name: string };

function mergeByName<G extends Keyed, A extends Keyed>(
  generated: G[],
  augment: A[],
  augmentOnlyDefaults?: (a: A) => Partial<G>,
): (G & Partial<A>)[] {
  const augMap = new Map(augment.map((a) => [a.name, a]));
  const merged = generated.map((g) => {
    const a = augMap.get(g.name);
    return a ? { ...g, ...stripUndefined(a) } : g;
  }) as (G & Partial<A>)[];

  // Augment-only entries (site additions for things DuckDB didn't introspect).
  // Apply per-shape defaults so partial augment files validate cleanly without
  // forcing authors to copy-paste boilerplate.
  const seen = new Set(generated.map((g) => g.name));
  for (const a of augment) {
    if (!seen.has(a.name)) {
      const defaults = augmentOnlyDefaults ? augmentOnlyDefaults(a) : ({} as Partial<G>);
      merged.push({ ...defaults, ...a } as unknown as G & Partial<A>);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));
  return merged;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// ----- Polymorphic overload collapsing ---------------------------------------
//
// Many extensions register the same function across many input types
// (datasketches has 88 unique names but 588 overload rows). Listing each
// (name, parameter-types) row as its own card is misleading — the user-facing
// API is one function that happens to be polymorphic over input type.
//
// Rule: collapse all overloads that share `name` AND `parameters.length`.
// Within a cluster, any parameter slot whose types differ across rows becomes
// "polymorphic": its `type` is replaced with a human label and the concrete
// types are recorded in `typeUnion` for display. Same logic applies to
// `returnType` -> `returnTypeUnion`. Augment fields (description, examples,
// categories, ...) come from the first augment-merged entry of the cluster.
//
// Overloads with different parameter counts (varargs, optional trailing args
// like a5_cell_to_boundary) stay as separate cards — they're meaningfully
// different shapes, not just type variation.

const NUMERIC_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT',
  'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'UHUGEINT',
  'FLOAT', 'DOUBLE', 'DECIMAL',
]);
const TEXT_TYPES = new Set(['VARCHAR', 'CHAR', 'TEXT']);
const TEMPORAL_TYPES = new Set([
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP_MS', 'TIMESTAMP_NS', 'TIMESTAMP_S', 'INTERVAL',
]);

function familyLabel(types: string[]): string {
  const upper = types.map((t) => t.toUpperCase());
  const allIn = (s: Set<string>) => upper.every((t) => s.has(t));
  if (allIn(NUMERIC_TYPES)) return '<numeric>';
  if (allIn(TEXT_TYPES)) return '<text>';
  if (allIn(TEMPORAL_TYPES)) return '<temporal>';
  if (upper.every((t) => t.startsWith('SKETCH_'))) return '<sketch>';
  if (upper.every((t) => t.endsWith('[]'))) {
    // Recursive: family of element types.
    const elements = types.map((t) => t.slice(0, -2));
    const elementLabel = familyLabel(elements);
    if (elementLabel.startsWith('<')) return `${elementLabel}[]`;
  }
  // No clean family — show pipe-joined list, truncated for sanity.
  if (types.length > 4) return `${types.slice(0, 3).join(' | ')} | …`;
  return types.join(' | ');
}

// Two-pass collapse:
//   1. Group by (name, arity, arg-name-tuple) — the "shape". Within a shape,
//      type-only variation collapses into family labels (typeUnion preserves
//      the concrete list).
//   2. Group those shapes by name. If a name has only one shape, emit a flat
//      FunctionDocData unchanged. If it has multiple shapes (e.g. 1-arg vs
//      2-arg), emit a single FunctionDocData with `forms[]` listing every
//      shape; the top-level parameters/returnType mirror the simplest form so
//      non-form-aware code paths still render something sensible.
function collapseOverloads<T extends FunctionDocData>(fns: T[]): T[] {
  interface Shape { head: T; params: T['parameters']; returnType?: string; returnTypeUnion?: string[] }

  const shapeGroups = new Map<string, T[]>();
  const shapeOrder: string[] = [];
  for (const f of fns) {
    const params = f.parameters ?? [];
    const argNames = params.map((p) => p.name).join('|');
    const key = `${f.name}|${params.length}|${argNames}`;
    if (!shapeGroups.has(key)) {
      shapeGroups.set(key, []);
      shapeOrder.push(key);
    }
    shapeGroups.get(key)!.push(f);
  }

  const shapes: { name: string; shape: Shape }[] = [];
  for (const key of shapeOrder) {
    const cluster = shapeGroups.get(key)!;
    const head = cluster[0];
    const params = (head.parameters ?? []).map((p, i) => {
      const types = Array.from(new Set(
        cluster.map((c) => c.parameters?.[i]?.type).filter((t): t is string => !!t),
      ));
      if (types.length <= 1) return p;
      return { ...p, type: familyLabel(types), typeUnion: types.sort() };
    });
    const returns = Array.from(new Set(
      cluster.map((c) => c.returnType).filter((t): t is string => !!t),
    ));
    const shape: Shape = { head, params };
    if (returns.length === 1) {
      shape.returnType = returns[0];
    } else if (returns.length > 1) {
      shape.returnType = familyLabel(returns);
      shape.returnTypeUnion = returns.sort();
    } else {
      shape.returnType = head.returnType;
    }
    shapes.push({ name: head.name, shape });
  }

  const byName = new Map<string, Shape[]>();
  const nameOrder: string[] = [];
  for (const { name, shape } of shapes) {
    if (!byName.has(name)) {
      byName.set(name, []);
      nameOrder.push(name);
    }
    byName.get(name)!.push(shape);
  }

  const out: T[] = [];
  for (const name of nameOrder) {
    const shapes = byName.get(name)!;
    // Surface simplest form first (lowest arity wins, then alphabetical on
    // arg-name signature for stability across runs).
    shapes.sort((a, b) => {
      const aLen = a.params.length, bLen = b.params.length;
      if (aLen !== bLen) return aLen - bLen;
      return a.params.map((p) => p.name).join('|').localeCompare(b.params.map((p) => p.name).join('|'));
    });
    const head = shapes[0].head;
    if (shapes.length === 1) {
      const s = shapes[0];
      const merged: T = { ...head, parameters: s.params };
      if (s.returnType !== undefined) merged.returnType = s.returnType;
      if (s.returnTypeUnion) merged.returnTypeUnion = s.returnTypeUnion;
      else delete merged.returnTypeUnion;
      out.push(merged);
      continue;
    }
    const merged: T = {
      ...head,
      parameters: shapes[0].params,
      returnType: shapes[0].returnType,
    };
    if (shapes[0].returnTypeUnion) merged.returnTypeUnion = shapes[0].returnTypeUnion;
    else delete merged.returnTypeUnion;
    merged.forms = shapes.map((s) => ({
      parameters: s.params,
      returnType: s.returnType,
      ...(s.returnTypeUnion ? { returnTypeUnion: s.returnTypeUnion } : {}),
    }));
    out.push(merged);
  }
  return out;
}

export interface ExtensionTree {
  generated: {
    functions?: Partial<FunctionDocData>[];
    pragmas?: Partial<Pragma>[];
    secrets?: Partial<Secret>[];
    macros?: Partial<Macro>[];
    /** Tool-discovered platform/version matrix; merged into metadata. */
    compatibility?: {
      platforms?: ExtensionMetadata['platforms'];
      duckdbVersions?: string[];
      binarySizes?: ExtensionMetadata['binarySizes'];
    };
    /** Cloudflare AE snapshot; merged into metadata.usageStats. */
    usage?: { count: number; period: string; asOf?: string };
  };
  augment: {
    metadata: ExtensionMetadata;
    technicalOverview?: TechnicalOverview;
    pricing?: PricingInfo;
    categoryDescriptions?: Record<string, string>;
    functions?: Partial<FunctionDocData>[];
    pragmas?: Partial<Pragma>[];
    secrets?: Partial<Secret>[];
    macros?: Partial<Macro>[];
    filesystems?: Filesystem[];
    storageExtensions?: StorageExtension[];
    logTypes?: LogType[];
    logStorageTypes?: LogStorageType[];
  };
}

export function mergeExtensionTree(tree: ExtensionTree): ExtensionData {
  // Merge tool-discovered compatibility (generated) into metadata, with
  // hand-authored values in augment/metadata.json winning when both are set.
  const compat = tree.generated.compatibility;
  const usage = tree.generated.usage;
  const augMeta = tree.augment.metadata;
  const metadata: ExtensionMetadata = {
    ...augMeta,
    ...(compat ? {
      platforms: augMeta.platforms ?? compat.platforms,
      duckdbVersions: augMeta.duckdbVersions ?? compat.duckdbVersions,
      binarySizes: augMeta.binarySizes ?? compat.binarySizes,
    } : {}),
    ...(usage ? {
      usageStats: augMeta.usageStats ?? { count: usage.count, period: usage.period },
    } : {}),
  };
  const data: ExtensionData = { metadata };

  if (tree.augment.technicalOverview) data.technicalOverview = tree.augment.technicalOverview;
  if (tree.augment.pricing) data.pricing = tree.augment.pricing;
  if (tree.augment.categoryDescriptions) data.categoryDescriptions = tree.augment.categoryDescriptions;

  if (tree.generated.functions || tree.augment.functions) {
    data.functions = collapseOverloads(mergeByName(
      (tree.generated.functions ?? []) as FunctionDocData[],
      (tree.augment.functions ?? []) as FunctionDocData[],
      (a) => ({
        id: a.name,
        type: 'scalar',
        parameters: [],
        examples: [],
        description: '',
        categories: ['Uncategorized'],
      }) as Partial<FunctionDocData>,
    ));
  }
  if (tree.generated.pragmas || tree.augment.pragmas) {
    data.pragmas = mergeByName(
      (tree.generated.pragmas ?? []) as Pragma[],
      (tree.augment.pragmas ?? []) as Pragma[],
    );
  }
  if (tree.generated.secrets || tree.augment.secrets) {
    data.secrets = mergeByName(
      (tree.generated.secrets ?? []) as Secret[],
      (tree.augment.secrets ?? []) as Secret[],
    );
  }
  if (tree.generated.macros || tree.augment.macros) {
    data.macros = mergeByName(
      (tree.generated.macros ?? []) as Macro[],
      (tree.augment.macros ?? []) as Macro[],
    );
  }

  if (tree.augment.filesystems) data.filesystems = tree.augment.filesystems;
  if (tree.augment.storageExtensions) data.storageExtensions = tree.augment.storageExtensions;
  if (tree.augment.logTypes) data.logTypes = tree.augment.logTypes;
  if (tree.augment.logStorageTypes) data.logStorageTypes = tree.augment.logStorageTypes;

  return data;
}
