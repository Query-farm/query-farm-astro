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
