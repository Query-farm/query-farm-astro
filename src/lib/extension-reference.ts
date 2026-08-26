import type { FunctionDocData } from '../data/extension-types';
import { extensionNameAnchor } from './extension-anchors';

export interface ExtensionFunctionCategory {
  name: string;
  slug: string;
  functions: FunctionDocData[];
}

export const extensionFunctionPath = (extensionSlug: string, functionName: string): string =>
  `/products/extensions/${encodeURIComponent(extensionSlug)}/functions/${encodeURIComponent(extensionNameAnchor(functionName))}`;

export const extensionFunctionCategoryPath = (extensionSlug: string, categoryName: string): string =>
  `/products/extensions/${encodeURIComponent(extensionSlug)}/functions/category/${encodeURIComponent(extensionNameAnchor(categoryName))}`;

export const extensionFunctionCategoryAnchorPath = (
  extensionSlug: string,
  categoryName: string,
  functionAnchor: string,
): string => `${extensionFunctionCategoryPath(extensionSlug, categoryName)}#${encodeURIComponent(functionAnchor)}`;

/** Group function records once for both static routes and the progressive index. */
export function groupExtensionFunctions(functions: FunctionDocData[]): ExtensionFunctionCategory[] {
  const groups = new Map<string, FunctionDocData[]>();

  for (const fn of functions) {
    const categories = fn.categories.length > 0 ? fn.categories : ['Functions'];
    for (const category of categories) {
      const group = groups.get(category) ?? [];
      if (!group.some(existing => existing.id === fn.id)) group.push(fn);
      groups.set(category, group);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, categoryFunctions]) => ({
      name,
      slug: extensionNameAnchor(name),
      functions: categoryFunctions,
    }));
}

export function uniqueExtensionFunctionNames(functions: FunctionDocData[]): string[] {
  return [...new Set(functions.map(fn => fn.name))]
    .sort((a, b) => a.localeCompare(b));
}
