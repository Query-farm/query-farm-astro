/**
 * Shared layout metrics for the VGI section's docs/reference pages
 * (DESIGN_BRIEF §6, family C).
 *
 * These were copy-pasted into every page, and drifted: the nine subpages sat on
 * a 1360px measure while /vgi — and Haybarn, Orchard and Cupola — all sat on
 * 1200px. At a 1440px viewport that put the section landing's left edge at
 * 141px and its own subpages' at 61px, so the whole page jumped sideways when
 * you followed a subnav tab. Worse, within a subpage the hero spanned the full
 * measure while the prose started after a 220px rail, leaving the page title
 * 264px left of the text it introduced.
 *
 * One measure, defined once. 1200px is not a new number — it is what every
 * other product section already uses.
 *
 * NOTE the subnav is deliberately NOT on this measure: `.section-container`
 * (1024px) is what all six `*SubNav.astro` components and the site header use,
 * so changing it here would misalign VGI from every other section.
 *
 * Every value below is a LITERAL class string, never assembled by
 * interpolation. Tailwind extracts classes by scanning source text, so a class
 * built at runtime from parts is a class that never reaches the stylesheet —
 * the rule would silently not exist. If you change the rail width or the gap,
 * change it in BOTH `GRID` and `HEAD_CONTAINER`; the comment on each says what
 * the other has to match.
 */

/** The section measure. Matches /vgi, /haybarn, /products/orchard, /products/cupola. */
export const WRAP = 'mx-auto w-full max-w-[1200px] px-6 sm:px-7';

/**
 * Two columns, not three. The left rail used to carry "In this section" — a
 * second copy of the subnav's own tabs and panels — with the page TOC squeezed
 * into a 200px rail on the right. Every VGI route is reachable from the subnav,
 * so the duplicate list is gone and the rail now carries the TOC, which both
 * removes the duplication and gives the prose the third column's width back.
 *
 * Rail 220px, gap 2.75rem (`lg:gap-11`) — HEAD_CONTAINER's indent must match.
 */
export const GRID =
  'mx-auto w-full max-w-[1200px] px-6 sm:px-7 grid gap-10 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-11';

/**
 * Container for `PageHead` on these pages, passed as its `container` override.
 *
 * Indents the hero to the prose column's left edge at `lg`, so the page title
 * sits directly above the text it introduces rather than out over the rail.
 * Below `lg` the rail is hidden and this collapses back to the plain measure.
 *
 * The indent is (container padding 1.75rem + rail 220px + gap 2.75rem) and must
 * track `GRID` above.
 */
export const HEAD_CONTAINER =
  'mx-auto w-full max-w-[1200px] px-6 sm:px-7 lg:pl-[calc(1.75rem+220px+2.75rem)]';

/** Sticky "On this page" rail, first column of `GRID`. */
export const TOC_ASIDE =
  'hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto';
