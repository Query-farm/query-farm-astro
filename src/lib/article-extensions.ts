import { extensions } from '../data/extensions';
import { getCollection, type CollectionEntry } from 'astro:content';
import { getPublishedPosts } from './blog-tags';

export type RelatedArticle = CollectionEntry<'blog'> | CollectionEntry<'tutorials'>;


let index: Promise<Map<string, RelatedArticle[]>> | undefined;

/** Published articles per extension slug, newest first. Built once per build.
 *  A post is linked from every slug in its `extensions` list, where an unknown
 *  slug fails the build (a typo would otherwise drop the link silently), and
 *  from its nextStep extension when that has a docs page here — nextStep may
 *  name a repository-only extension such as grainlift, which has none. */
function buildIndex(): Promise<Map<string, RelatedArticle[]>> {
  index ??= Promise.all([getPublishedPosts(), getCollection('tutorials')]).then(([blog, tutorials]) => {
    const posts: RelatedArticle[] = [...blog, ...tutorials.filter(tutorial => !tutorial.data.draft)]
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
    const known = new Set(extensions.map(e => e.id));
    const bySlug = new Map<string, RelatedArticle[]>();
    for (const post of posts) {
      // The frontmatter field is optional. Dev content records can omit the
      // schema's default, so normalize it before validating or indexing links.
      const slugs = new Set(post.data.extensions ?? []);
      for (const slug of slugs) {
        if (!known.has(slug)) {
          throw new Error(`Article "${post.id}" names unknown extension "${slug}"`);
        }
      }
      const fromNextStep = post.data.nextStep?.extension;
      if (fromNextStep && known.has(fromNextStep)) slugs.add(fromNextStep);
      for (const slug of slugs) {
        (bySlug.get(slug) ?? bySlug.set(slug, []).get(slug)!).push(post);
      }
    }
    return bySlug;
  });
  return index;
}

export async function getArticlesForExtension(slug: string): Promise<RelatedArticle[]> {
  return (await buildIndex()).get(slug) ?? [];
}
