import phosphor from '@iconify-json/ph/icons.json';
import { publicExtensions, categoryInfo } from '../../data/extensions';
import type { SearchExtension } from '../../lib/site-search';

export function GET() {
  const icons = phosphor.icons as Record<string, { body: string; width?: number; height?: number }>;
  const extensions: SearchExtension[] = publicExtensions.map(extension => {
    const icon = icons[extension.icon ?? 'puzzle-piece'] ?? icons['puzzle-piece'];
    return {
      id: extension.id,
      name: extension.name,
      description: extension.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*]/g, ''),
      url: `/products/extensions/${extension.id}/`,
      category: categoryInfo[extension.category].title,
      categoryId: extension.category,
      // Only trusted, bundled icon markup is emitted; the icon set stays out
      // of the browser bundle and the catalog is fetched only on search open.
      icon: `<svg viewBox="0 0 ${icon.width ?? phosphor.width} ${icon.height ?? phosphor.height}" fill="currentColor" aria-hidden="true">${icon.body}</svg>`,
      usageCount: extension.usageCount,
      usagePeriod: extension.usagePeriod,
    };
  });
  return new Response(JSON.stringify(extensions), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
