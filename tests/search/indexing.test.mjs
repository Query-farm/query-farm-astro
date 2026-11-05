import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSearchHTML } from '../../scripts/search-html.mjs';

test('company and Starlight pages opt into the shared page index', () => {
  const company = prepareSearchHTML('<main data-pagefind-filter="kind:page"><h1>Airport</h1></main>');
  assert.match(company, /data-pagefind-body/);
  assert.equal(company.match(/data-pagefind-filter/g).length, 1);
  const docs = prepareSearchHTML('<main data-pagefind-body><h1>Scalar functions</h1></main>');
  assert.match(docs, /data-pagefind-body/);
  assert.match(docs, /data-pagefind-filter="kind:page"/);
});

test('existing scoped bodies and filters are preserved', () => {
  const html = '<main data-pagefind-filter="kind:haybarn-guide"><article data-pagefind-body data-pagefind-filter="kind:Guide">Guide</article></main>';
  assert.equal(prepareSearchHTML(html), html);
});

test('redirects and noindex reference pages cannot outrank their canonical pages', () => {
  assert.equal(prepareSearchHTML('<meta name="robots" content="noindex, follow"><main>Function category</main>'), null);
  assert.equal(prepareSearchHTML('<meta http-equiv="refresh" content="0;url=/airport"><main>Redirect</main>'), null);
  assert.equal(prepareSearchHTML('<body>Not a content page</body>'), null);
});
