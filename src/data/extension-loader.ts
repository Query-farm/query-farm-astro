import type { ExtensionData, ExtensionMetadata } from './extension-types';
import { ExtensionDataSchema } from './schemas';
import { mergeExtensionTree, type ExtensionTree } from './extension-merge';
import { getExtensionById } from './extensions';

// Eagerly load every JSON file under src/data/extensions/<slug>/{generated,augment}/.
// File presence drives availability — no per-extension boilerplate.
const generatedFiles = import.meta.glob<unknown>(
  './extensions/*/generated/*.json',
  { eager: true, import: 'default' },
);
const augmentFiles = import.meta.glob<unknown>(
  './extensions/*/augment/*.json',
  { eager: true, import: 'default' },
);
const technicalDetailsModules = import.meta.glob<{ Content: any }>(
  './extensions/*/technical-details.mdx',
);
const cookbookModules = import.meta.glob<{ Content: any }>(
  './extensions/*/cookbook.mdx',
);

interface ParsedPath { slug: string; tree: 'generated' | 'augment'; key: string }

function parsePath(path: string): ParsedPath | null {
  const m = path.match(/\.\/extensions\/([^/]+)\/(generated|augment)\/([^/]+)\.json$/);
  if (!m) return null;
  return { slug: m[1], tree: m[2] as 'generated' | 'augment', key: m[3] };
}

// JSON files are named with kebab-case; ExtensionTree fields are camelCase.
const FILE_KEY_TO_FIELD: Record<string, string> = {
  'metadata': 'metadata',
  'functions': 'functions',
  'pragmas': 'pragmas',
  'secrets': 'secrets',
  'macros': 'macros',
  'filesystems': 'filesystems',
  'storage-extensions': 'storageExtensions',
  'log-types': 'logTypes',
  'log-storage-types': 'logStorageTypes',
  'technical-overview': 'technicalOverview',
  'pricing': 'pricing',
  'types': 'types',
  'views': 'views',
  'categories': 'categoryDescriptions',
  'compatibility': 'compatibility',
  'usage': 'usage',
};

function buildExtensionTrees(): Record<string, ExtensionTree> {
  const trees: Record<string, ExtensionTree> = {};
  const ensure = (slug: string): ExtensionTree => {
    if (!trees[slug]) {
      trees[slug] = { generated: {}, augment: { metadata: undefined as unknown as ExtensionMetadata } };
    }
    return trees[slug];
  };

  for (const [path, data] of Object.entries({ ...generatedFiles, ...augmentFiles })) {
    const parsed = parsePath(path);
    if (!parsed) continue;
    const field = FILE_KEY_TO_FIELD[parsed.key];
    if (!field) continue;
    const tree = ensure(parsed.slug);
    (tree[parsed.tree] as Record<string, unknown>)[field] = data;
  }
  return trees;
}

const extensionTrees = buildExtensionTrees();

function slugFromPath(path: string): string {
  const m = path.match(/\.\/extensions\/([^/]+)\//);
  if (!m) throw new Error(`Cannot derive slug from path: ${path}`);
  return m[1];
}

function buildSlugMap<T>(modules: Record<string, () => Promise<T>>): Record<string, () => Promise<T>> {
  const out: Record<string, () => Promise<T>> = {};
  for (const [path, loader] of Object.entries(modules)) {
    out[slugFromPath(path)] = loader;
  }
  return out;
}

const extensionMdxRegistry = buildSlugMap(technicalDetailsModules);
const cookbookMdxRegistry = buildSlugMap(cookbookModules);

export async function loadExtensionData(extensionId: string): Promise<ExtensionData | null> {
  const tree = extensionTrees[extensionId];
  if (!tree || !tree.augment.metadata) return null;

  const merged = mergeExtensionTree(tree);
  const result = ExtensionDataSchema.safeParse(merged);
  if (!result.success) {
    // Hard-fail. A schema mismatch silently dropping content (entire function
    // lists vanishing because one secret had a missing field) is much worse
    // than a build error pointing at the offending field.
    const issues = result.error.issues
      .map((i) => `  - [${i.path.join('.') || '<root>'}]: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid ExtensionData for "${extensionId}":\n${issues}\n` +
      `Fix the schema, the augment files, or the diff-tool output. ` +
      `Don't silently render partial data.`
    );
  }
  return result.data;
}

export function createMinimalExtensionData(extensionId: string): ExtensionData | null {
  const extension = getExtensionById(extensionId);
  if (!extension) return null;

  const metadata: ExtensionMetadata = {
    name: extension.id,
    displayName: extension.name,
    icon: extension.icon || '📦',
    description: extension.description,
    githubUrl: extension.githubUrl || '',
    cta: {
      title: `Start Using ${extension.name}`,
      description: `Install the ${extension.name} extension and explore its capabilities.`,
    },
  };
  return { metadata };
}

export async function getExtensionData(extensionId: string): Promise<ExtensionData | null> {
  const detailedData = await loadExtensionData(extensionId);
  if (detailedData) return detailedData;
  return createMinimalExtensionData(extensionId);
}

export function hasDetailedData(extensionId: string): boolean {
  return extensionId in extensionTrees;
}

export function getExtensionIdsWithDetailedData(): string[] {
  return Object.keys(extensionTrees);
}

export async function loadExtensionMdx(extensionId: string): Promise<{ Content: any } | null> {
  const loader = extensionMdxRegistry[extensionId];
  if (!loader) return null;
  try {
    const module = await loader();
    return { Content: module.Content };
  } catch (error) {
    console.error(`Failed to load MDX content for "${extensionId}":`, error);
    return null;
  }
}

export function hasExtensionMdx(extensionId: string): boolean {
  return extensionId in extensionMdxRegistry;
}

export async function loadCookbookMdx(extensionId: string): Promise<{ Content: any } | null> {
  const loader = cookbookMdxRegistry[extensionId];
  if (!loader) return null;
  try {
    const module = await loader();
    return { Content: module.Content };
  } catch (error) {
    console.error(`Failed to load cookbook MDX content for "${extensionId}":`, error);
    return null;
  }
}

export function hasCookbookMdx(extensionId: string): boolean {
  return extensionId in cookbookMdxRegistry;
}
