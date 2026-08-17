/**
 * Starlight route middleware — scope the sidebar to one SDK at a time.
 *
 * astro.config.mjs declares every section (Concepts + five languages) in a
 * single `sidebar` tree, because that is the only place Starlight accepts one.
 * Shipping all of it on every page is both unreadable — 179 links, five
 * languages deep, when a reader wants one — and expensive: it was ~53 KB, about
 * two thirds of the markup of every docs page.
 *
 * So the config tree is the *catalogue* and this middleware is the *view*: for
 * a page under /vgi/docs/go/, it keeps the Concepts group and the Go group and
 * drops the rest. The language group is then unwrapped, so its items sit at the
 * top level rather than nested one pointless level inside a heading that repeats
 * what the switcher above already says.
 *
 * Because prev/next were computed from the full tree before this runs, they are
 * recomputed here too — otherwise the last Python page still paginates into the
 * first Go page, which is no longer anywhere on screen.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { SidebarEntry, SidebarLink } from '@astrojs/starlight/utils/routing/types';
import { CONCEPTS, DOCS_ROOT, sectionFor } from './lib/vgi-docs';

/** Depth-first list of the links in a sidebar tree, in reading order. */
function flatten(entries: SidebarEntry[]): SidebarLink[] {
  const out: SidebarLink[] = [];
  for (const e of entries) {
    if (e.type === 'group') out.push(...flatten(e.entries));
    else out.push(e);
  }
  return out;
}

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  if (!route) return;

  const path = context.url.pathname;
  const section = sectionFor(path);
  const isDocsHome = path === DOCS_ROOT || path === DOCS_ROOT.slice(0, -1);
  if (!section && !isDocsHome) return;

  const top = route.sidebar;
  const concepts = top.find((e) => e.type === 'group' && e.label === CONCEPTS.group);

  // The landing page and the Concepts pages keep only Concepts — the landing
  // page's own body is the directory of languages, so listing them twice would
  // be noise. A language page gets Concepts plus its own group, unwrapped.
  let scoped: SidebarEntry[];
  if (!section || section.slug === CONCEPTS.slug) {
    scoped = concepts ? [concepts] : top;
  } else {
    const mine = top.find((e) => e.type === 'group' && e.label === section.group);
    if (!mine) return;
    scoped = [...(concepts ? [concepts] : []), ...(mine.type === 'group' ? mine.entries : [mine])];
  }

  route.sidebar = scoped;

  // Name the section in the browser tab: "Scalar functions | VGI Go" rather
  // than the global "| VGI Documentation". `head` is built before middleware
  // runs, so the composed <title> has to be rewritten rather than re-derived
  // from `siteTitle`.
  // The landing page's own H1 is already the site title, so the composed
  // "VGI Documentation | VGI Documentation" is just a stutter.
  if (isDocsHome) {
    for (const tag of route.head) {
      if (tag.tag === 'title') tag.content = 'VGI Documentation';
    }
  }

  if (section && section.slug !== CONCEPTS.slug) {
    const siteTitle = `VGI ${section.name}`;
    route.siteTitle = siteTitle;
    for (const tag of route.head) {
      if (tag.tag === 'title' && typeof tag.content === 'string') {
        tag.content = tag.content.replace(/VGI Documentation$/, siteTitle);
      } else if (tag.tag === 'meta' && tag.attrs?.property === 'og:site_name') {
        tag.attrs.content = siteTitle;
      }
    }
  }

  // Re-derive pagination from what the reader can actually see.
  const links = flatten(scoped);
  const i = links.findIndex((l) => l.isCurrent);
  route.pagination = {
    prev: i > 0 ? links[i - 1] : undefined,
    next: i >= 0 && i < links.length - 1 ? links[i + 1] : undefined,
  };
});
