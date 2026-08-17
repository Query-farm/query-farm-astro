import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export interface TagGroup {
  /** Display casing — the first spelling seen in publication order. */
  label: string;
  /** URL segment, e.g. "web-assembly" → /blog/tags/web-assembly. */
  slug: string;
  /** Posts carrying the tag, newest first. */
  posts: BlogPost[];
}

/**
 * A tag archive only earns indexing once it collects more than one post. Below
 * that it is a second copy of a single post's card — thin, and a duplicate of
 * the post itself in the eyes of a crawler. The page still renders and is still
 * linked; it just carries noindex and stays out of the sitemap until it fills.
 */
export const TAG_INDEX_MIN_POSTS = 2;

/** Tags are authored free-form in frontmatter, so slugs must survive spaces,
 *  punctuation, and casing: "Query.Farm Team" → "query-farm-team". */
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Published posts, newest first. Drafts never reach any public surface. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  return posts
    .filter(post => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/**
 * Group published posts by tag, keyed on the slug so "DuckDB" and "duckdb"
 * collapse into one archive instead of two that differ only in casing.
 * Returned alphabetically by label; posts inside each group stay newest-first.
 */
export async function getTagGroups(posts?: BlogPost[]): Promise<TagGroup[]> {
  const published = posts ?? (await getPublishedPosts());
  const groups = new Map<string, TagGroup>();

  for (const post of published) {
    for (const tag of post.data.tags) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      const group = groups.get(slug);
      if (group) {
        // Same slug, different casing — keep the first label, add the post once.
        if (!group.posts.includes(post)) group.posts.push(post);
      } else {
        groups.set(slug, { label: tag, slug, posts: [post] });
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Reading time from the raw markdown body. 200 wpm, floored at one minute. */
export function readingTime(body: string | undefined): number {
  return Math.max(1, Math.round((body ?? '').trim().split(/\s+/).length / 200));
}
