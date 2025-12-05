import type { ExtensionData, ExtensionMetadata } from './extension-types';
import { getExtensionById } from './extensions';

/**
 * Extension registry mapping extension IDs to their data modules.
 * Add new extensions here as they get detailed data files.
 */
const extensionDataRegistry: Record<string, () => Promise<{ default: ExtensionData }>> = {
  crypto: () => import('./extensions/crypto'),
  // Future extensions:
  // 'postgres-connector': () => import('./extensions/postgres-connector'),
  // 'mysql-connector': () => import('./extensions/mysql-connector'),
};

/**
 * Extension MDX registry mapping extension IDs to their MDX content modules.
 * Add new extensions here when they have technical details MDX files.
 */
const extensionMdxRegistry: Record<string, () => Promise<{ default: any; Content: any }>> = {
  crypto: () => import('./extensions/crypto.mdx'),
  // Future extensions:
  // 'hashfunctions': () => import('./extensions/hashfunctions.mdx'),
};

/**
 * Cookbook MDX registry mapping extension IDs to their cookbook content modules.
 * Add new extensions here when they have cookbook MDX files.
 */
const cookbookMdxRegistry: Record<string, () => Promise<{ default: any; Content: any }>> = {
  crypto: () => import('./extensions/crypto-cookbook.mdx'),
  // Future extensions:
  // 'hashfunctions': () => import('./extensions/hashfunctions-cookbook.mdx'),
};

/**
 * Loads detailed extension data for a given extension ID.
 * Returns null if no detailed data exists (only basic metadata available).
 */
export async function loadExtensionData(extensionId: string): Promise<ExtensionData | null> {
  const loader = extensionDataRegistry[extensionId];

  if (!loader) {
    return null;
  }

  try {
    const module = await loader();
    return module.default;
  } catch (error) {
    console.error(`Failed to load extension data for "${extensionId}":`, error);
    return null;
  }
}

/**
 * Creates a minimal ExtensionData object from basic extension metadata.
 * Used as fallback when detailed data doesn't exist.
 */
export function createMinimalExtensionData(extensionId: string): ExtensionData | null {
  const extension = getExtensionById(extensionId);

  if (!extension) {
    return null;
  }

  const metadata: ExtensionMetadata = {
    name: extension.id,
    displayName: extension.name,
    icon: extension.icon || '📦',
    description: extension.description,
    githubUrl: extension.githubUrl || '',
    cta: {
      title: `Start Using ${extension.name}`,
      description: `Install the ${extension.name} extension and explore its capabilities.`
    }
  };

  return { metadata };
}

/**
 * Gets extension data with automatic fallback to minimal data.
 * Returns null only if extension ID doesn't exist in extensions.ts.
 */
export async function getExtensionData(extensionId: string): Promise<ExtensionData | null> {
  // Try to load detailed data first
  const detailedData = await loadExtensionData(extensionId);

  if (detailedData) {
    return detailedData;
  }

  // Fallback to minimal data from extensions.ts
  return createMinimalExtensionData(extensionId);
}

/**
 * Checks if an extension has detailed data available.
 */
export function hasDetailedData(extensionId: string): boolean {
  return extensionId in extensionDataRegistry;
}

/**
 * Gets list of all extension IDs that have detailed data.
 */
export function getExtensionIdsWithDetailedData(): string[] {
  return Object.keys(extensionDataRegistry);
}

/**
 * Loads MDX content component for a given extension ID.
 * Returns null if no MDX content exists for the extension.
 */
export async function loadExtensionMdx(extensionId: string): Promise<{ Content: any } | null> {
  const loader = extensionMdxRegistry[extensionId];

  if (!loader) {
    return null;
  }

  try {
    const module = await loader();
    return { Content: module.Content };
  } catch (error) {
    console.error(`Failed to load MDX content for "${extensionId}":`, error);
    return null;
  }
}

/**
 * Checks if an extension has MDX content available.
 */
export function hasExtensionMdx(extensionId: string): boolean {
  return extensionId in extensionMdxRegistry;
}

/**
 * Loads Cookbook MDX content component for a given extension ID.
 * Returns null if no cookbook content exists for the extension.
 */
export async function loadCookbookMdx(extensionId: string): Promise<{ Content: any } | null> {
  const loader = cookbookMdxRegistry[extensionId];

  if (!loader) {
    return null;
  }

  try {
    const module = await loader();
    return { Content: module.Content };
  } catch (error) {
    console.error(`Failed to load cookbook MDX content for "${extensionId}":`, error);
    return null;
  }
}

/**
 * Checks if an extension has cookbook content available.
 */
export function hasCookbookMdx(extensionId: string): boolean {
  return extensionId in cookbookMdxRegistry;
}
