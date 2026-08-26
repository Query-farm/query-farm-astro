// The list of extensions is auto-discovered from
// src/data/extensions/<slug>/augment/metadata.json. To add a new extension,
// create that file (or run extension-diff.py --init from the extension repo).
import type { ExtensionMetadata } from './extension-types';

export type ExtensionCategory =
  | 'connectors' | 'transformation' | 'analytics' | 'performance' | 'devtools' | 'quality';
export type ExtensionStatus = 'stable' | 'beta' | 'experimental';

export interface Extension {
  id: string;
  name: string;
  description: string;
  category: ExtensionCategory;
  status: ExtensionStatus;
  icon?: string;
  githubUrl?: string;
  docsUrl?: string;
  features?: string[];
  /** Usage count from generated/usage.json (Cloudflare AE snapshot). */
  usageCount?: number;
  /** Human label for the usageCount window, e.g. "last 90 days". */
  usagePeriod?: string;
}

const metadataModules = import.meta.glob<ExtensionMetadata>(
  './extensions/*/augment/metadata.json',
  { eager: true, import: 'default' },
);

const usageModules = import.meta.glob<{ count: number; period: string; asOf?: string }>(
  './extensions/*/generated/usage.json',
  { eager: true, import: 'default' },
);
const usageBySlug: Record<string, { count: number; period: string }> = {};
for (const [path, data] of Object.entries(usageModules)) {
  const m = path.match(/\.\/extensions\/([^/]+)\//);
  if (m) usageBySlug[m[1]] = { count: data.count, period: data.period };
}

function slugFromPath(path: string): string {
  const m = path.match(/\.\/extensions\/([^/]+)\//);
  if (!m) throw new Error(`Cannot derive slug from ${path}`);
  return m[1];
}

function toListingEntry(slug: string, m: ExtensionMetadata): Extension {
  if (!m.category) throw new Error(`metadata.json for "${slug}" missing required field: category`);
  if (!m.status) throw new Error(`metadata.json for "${slug}" missing required field: status`);
  return {
    id: slug,
    name: m.displayName,
    description: m.description,
    category: m.category as ExtensionCategory,
    status: m.status as ExtensionStatus,
    icon: m.icon,
    githubUrl: m.githubUrl || undefined,
    docsUrl: m.docsUrl,
    features: m.features,
    usageCount: m.usageStats?.count ?? usageBySlug[slug]?.count,
    usagePeriod: m.usageStats?.period ?? usageBySlug[slug]?.period,
  };
}

export const extensions: Extension[] = Object.entries(metadataModules)
  .map(([path, m]) => toListingEntry(slugFromPath(path), m))
  .sort((a, b) => a.name.localeCompare(b.name));

// Public-catalog filter:
//   - 'example' is a docs reference template, not a real installable extension.
//   - Anything still carrying a "TODO: ..." description is a scaffold that hasn't
//     been authored yet — don't advertise it.
// Internal data tooling and lookups still see the full `extensions` set. Public
// listing/detail routes and their JSON endpoints are generated exclusively from
// `publicExtensions`, so held-back records cannot leak through a guessed URL.
// 'chsql' and 'quackscale' are authored but held back from the site for now.
const HIDDEN_FROM_LISTING = new Set(['example', 'chsql', 'quackscale']);
export const publicExtensions: Extension[] = extensions.filter(
  (e) => !HIDDEN_FROM_LISTING.has(e.id) && !/^\s*TODO\b/i.test(e.description),
);

export const publicExtensionsByCategory = () =>
  publicExtensions.reduce((acc, ext) => {
    (acc[ext.category] ??= []).push(ext);
    return acc;
  }, {} as Record<ExtensionCategory, Extension[]>);

export const getExtensionById = (id: string): Extension | undefined =>
  extensions.find((e) => e.id === id);

export const getExtensionsByIds = (ids: string[]): Extension[] =>
  ids.map(getExtensionById).filter(Boolean) as Extension[];

export const extensionsByCategory = () =>
  extensions.reduce((acc, ext) => {
    (acc[ext.category] ??= []).push(ext);
    return acc;
  }, {} as Record<ExtensionCategory, Extension[]>);

export const categoryInfo: Record<ExtensionCategory, { title: string; description: string; icon: string }> = {
  connectors: {
    title: 'Data Connectors',
    description: 'Connect DuckDB to various data sources and destinations',
    icon: '🔌',
  },
  transformation: {
    title: 'Data Transformation',
    description: 'Transform and process data with specialized functions',
    icon: '🔄',
  },
  analytics: {
    title: 'Analytics & ML',
    description: 'Advanced analytics and machine learning capabilities',
    icon: '🧠',
  },
  performance: {
    title: 'Performance & Optimization',
    description: 'Enhance query performance and resource utilization',
    icon: '⚡',
  },
  devtools: {
    title: 'Developer Tools',
    description: 'Tools for debugging, validation, and development',
    icon: '🛠️',
  },
  quality: {
    title: 'Data Quality',
    description: 'Ensure data quality and consistency',
    icon: '✨',
  },
};
