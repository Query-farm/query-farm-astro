import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../../lib/blog-tags';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();

  return rss({
    title: 'Query.Farm Blog',
    description: 'DuckDB extensions, Apache Arrow, SQL, and data engineering from the builders at Query.Farm.',
    site: new URL('/blog/', site),
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>en-us</language><atom:link href="${new URL('/blog/rss.xml', site)}" rel="self" type="application/rss+xml" />`,
    items: posts.map(post => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: new URL(`/blog/${post.id}/`, site).href,
      categories: post.data.tags,
    })),
  });
};
