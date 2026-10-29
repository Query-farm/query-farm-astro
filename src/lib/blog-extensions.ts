import { extensions } from '../data/extensions';
import { getPublishedPosts, type BlogPost } from './blog-tags';


let index: Promise<Map<string, BlogPost[]>> | undefined;

/** Published posts per extension slug, newest first. Built once per build.
 *  A post is linked from every slug in its `extensions` list, where an unknown
 *  slug fails the build (a typo would otherwise drop the link silently), and
 *  from its nextStep extension when that has a docs page here — nextStep may
 *  name a repository-only extension such as grainlift, which has none. */
function buildIndex(): Promise<Map<string, BlogPost[]>> {
  index ??= getPublishedPosts().then(posts => {
    const known = new Set(extensions.map(e => e.id));
    const bySlug = new Map<string, BlogPost[]>();
    for (const post of posts) {
      for (const slug of post.data.extensions) {
        if (!known.has(slug)) {
          throw new Error(`Blog post "${post.id}" names unknown extension "${slug}"`);
        }
      }
      const fromNextStep = post.data.nextStep?.extension;
      const slugs = new Set(post.data.extensions);
      if (fromNextStep && known.has(fromNextStep)) slugs.add(fromNextStep);
      for (const slug of slugs) {
        (bySlug.get(slug) ?? bySlug.set(slug, []).get(slug)!).push(post);
      }
    }
    return bySlug;
  });
  return index;
}

export async function getPostsForExtension(slug: string): Promise<BlogPost[]> {
  return (await buildIndex()).get(slug) ?? [];
}
