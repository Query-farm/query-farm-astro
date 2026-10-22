import assert from 'node:assert/strict';
import test from 'node:test';
import { matchingExtensions, mergeSearchResults, popularExtensions, type SearchExtension } from '../../src/lib/site-search';

function extension(id: string, name: string, usageCount = 0): SearchExtension {
  return { id, name, usageCount, url: `/products/extensions/${id}/`, category: 'Connectors', icon: '', description: '' };
}

test('exact names outrank prefixes regardless of popularity; equally relevant names use usage', () => {
  const catalog = [extension('httpserver', 'HTTP Server', 10), extension('http_client', 'HTTP Client', 1000), extension('http', 'HTTP', 1)];
  assert.deepEqual(matchingExtensions(catalog, 'http').map(item => item.id), ['http', 'http_client', 'httpserver']);
  assert.deepEqual(matchingExtensions(catalog, 'HTTP_CLIENT').map(item => item.id), ['http_client']);
  assert.deepEqual(matchingExtensions(catalog, 'http-client').map(item => item.id), ['http_client']);
  assert.deepEqual(matchingExtensions(catalog, 'h'), []);
});

test('display-name words and install names match without promoting unrelated extensions', () => {
  const catalog = [extension('datasketches', 'Apache DataSketches'), extension('a5', 'A5 Geospatial Index'), extension('redis', 'Redis')];
  assert.equal(matchingExtensions(catalog, 'datasketches')[0].id, 'datasketches');
  assert.equal(matchingExtensions(catalog, 'geospatial')[0].id, 'a5');
  assert.deepEqual(matchingExtensions(catalog, 'redis authentication'), []);
  assert.deepEqual(matchingExtensions(catalog, '""'), []);
});

test('direct extension matches precede full-text mentions, deduplicate URLs, and preserve function anchors', () => {
  const airport = extension('airport', 'Airport');
  const documents = [
    { url: '/blog/airport', excerpt: '', meta: { title: 'Airport announcement' } },
    { url: '/products/extensions/airport', excerpt: '', meta: { title: 'Airport | Query Farm' } },
    ...['first', 'second'].map(name => ({ url: `/products/extensions/airport/functions/category/functions#${name}`, excerpt: '', meta: { title: name } })),
  ];
  assert.deepEqual(mergeSearchResults([airport], documents).map(item => item.url), [
    airport.url, documents[0].url, documents[2].url, documents[3].url,
  ]);
  assert.deepEqual(mergeSearchResults([], documents), documents);
});

test('popular shortcuts use recorded loads, omit unknown counts, and do not mutate the catalog', () => {
  const catalog = [extension('unknown', 'Unknown'), extension('small', 'Small', 10), extension('large', 'Large', 1000)];
  assert.deepEqual(popularExtensions(catalog).map(item => item.id), ['large', 'small']);
  assert.equal(catalog[0].id, 'unknown');
});
