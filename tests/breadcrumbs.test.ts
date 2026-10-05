import assert from 'node:assert/strict';
import test from 'node:test';
import { breadcrumbData, serializeJsonLd, withBreadcrumbs } from '../src/lib/breadcrumbs';

const url = (path: string) => new URL(path, 'https://query.farm');

test('blog posts use real parent pages and their canonical URL', () => {
  const data = breadcrumbData(url('/blog/a-post/'), 'A post')!;
  assert.deepEqual(data.itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://query.farm/' },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://query.farm/blog' },
    { '@type': 'ListItem', position: 3, name: 'A post', item: 'https://query.farm/blog/a-post/' },
  ]);
});

test('nested routes omit URL segments that are not navigation destinations', () => {
  for (const [path, names] of [
    ['/company/contact', ['Home', 'Current page']],
    ['/blog/tags/sql', ['Home', 'Blog', 'Current page']],
    ['/products/grainlift/', ['Home', 'Products', 'Current page']],
    ['/products/haybarn/functions/releases/duckdb-1.4/abs/', ['Home', 'Products', 'Haybarn', 'Functions', 'Current page']],
    ['/products/haybarn/extensions/category/data/', ['Home', 'Products', 'Haybarn', 'Extensions', 'Current page']],
  ] as const) {
    assert.deepEqual(breadcrumbData(url(path), 'Current page')!.itemListElement.map(item => item.name), names);
  }
});

test('docs include the SDK landing page without duplicating the current page', () => {
  assert.deepEqual(
    breadcrumbData(url('/vgi/docs/csharp/api/aggregate/'), 'Aggregate')!.itemListElement.map(item => item.name),
    ['Home', 'VGI', 'VGI Docs', 'C#', 'Aggregate'],
  );
  assert.deepEqual(
    breadcrumbData(url('/vgi/docs/csharp/'), 'C#')!.itemListElement.map(item => item.name),
    ['Home', 'VGI', 'VGI Docs', 'C#'],
  );
});

test('existing schemas are retained and authored breadcrumbs are not duplicated', () => {
  const article = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'Post' };
  const breadcrumb = breadcrumbData(url('/blog/post'), 'Post')!;
  assert.deepEqual(withBreadcrumbs(article, url('/blog/post'), 'Post'), [article, breadcrumb]);
  for (const existing of [breadcrumb, [article, breadcrumb], { '@graph': [article, breadcrumb] }]) {
    assert.equal(withBreadcrumbs(existing, url('/blog/post'), 'Post'), existing);
  }
});

test('home, error, and noindex pages do not acquire breadcrumbs', () => {
  for (const path of ['/', '/404', '/404/', '/404.html']) {
    assert.equal(withBreadcrumbs(undefined, url(path), 'Page'), undefined);
  }
  const schema = { '@type': 'CollectionPage' };
  assert.equal(withBreadcrumbs(schema, url('/blog/tags/thin'), 'Thin', true), schema);
});

test('titles cannot terminate the JSON-LD script element', () => {
  const title = 'Example </script><script>alert(1)</script>';
  const data = breadcrumbData(url('/blog/example'), title)!;
  const serialized = serializeJsonLd(data);
  assert.ok(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), data);
});
