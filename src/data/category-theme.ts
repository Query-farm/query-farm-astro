import type { ExtensionCategory } from './extensions';

/**
 * Per-category color theme for extension icons. The icon is a monochrome
 * Phosphor glyph (see ExtensionIcon.astro) that inherits color from `ink`;
 * `tile` is the rounded background it sits on in card/grid contexts.
 *
 * Class strings are full literals (not interpolated) so Tailwind's JIT keeps
 * them — same pattern as the TAXONOMY theme in pages/products/extensions.astro.
 */
export const categoryIconTheme: Record<ExtensionCategory, { tile: string; ink: string }> = {
  connectors:     { tile: 'bg-sky-100',     ink: 'text-sky-700' },
  transformation: { tile: 'bg-violet-100',  ink: 'text-violet-700' },
  analytics:      { tile: 'bg-fuchsia-100', ink: 'text-fuchsia-700' },
  performance:    { tile: 'bg-amber-100',   ink: 'text-amber-700' },
  devtools:       { tile: 'bg-teal-100',    ink: 'text-teal-700' },
  quality:        { tile: 'bg-emerald-100', ink: 'text-emerald-700' },
};
