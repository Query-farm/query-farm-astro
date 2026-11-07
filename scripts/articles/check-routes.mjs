import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const slugs=['compare-parquet-duckdb','fuzzy-matching-duckdb','duckdb-postgresql-query-pushdown'];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.goto(`${origin}/tutorials/`)).status(),200);
 await expect(page.locator('[data-tutorial-card]')).toHaveCount(13);
 await expect(page.locator('[data-catalog-ready]')).toHaveAttribute('data-catalog-ready','true');
 assert.deepEqual(await page.locator('[data-tutorial-card]:visible').evaluateAll(cards=>cards.slice(0,3).map(card=>card.dataset.tutorialCard)),slugs);
 await expect(page.locator('header nav[aria-label="Main"] a[href="/tutorials"]')).toHaveAttribute('aria-current','page');
 assert.deepEqual(await page.locator('header nav[aria-label="Main"] a').evaluateAll(links=>links.map(a=>a.textContent.trim()).filter(name=>['Blog','Tutorials'].includes(name))),['Blog','Tutorials']);
 await page.screenshot({path:'/tmp/query-farm-articles-review/tutorials-index-desktop.png',fullPage:true});
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Index overflow at ${width}`);
 }
 await page.locator('#mobile-menu-button').click();
 await expect(page.locator('nav[aria-label="Mobile"] a[href="/tutorials"]')).toBeVisible();
 assert.deepEqual(await page.locator('nav[aria-label="Mobile"] a').evaluateAll(links=>links.map(a=>a.textContent.trim()).filter(name=>['Blog','Tutorials'].includes(name))),['Blog','Tutorials']);
 await page.locator('#mobile-menu-close').click();
 await page.screenshot({path:'/tmp/query-farm-articles-review/tutorials-index-mobile.png'});
 await page.setViewportSize({width:1440,height:1100});
 for(const slug of slugs){
  assert.equal((await page.goto(`${origin}/tutorials/${slug}/`)).status(),200);
  await expect(page.locator('article[data-content-type="tutorial"]')).toBeVisible();
  await expect(page.locator('.tutorial-intro')).toContainText("What you'll build");
  const crumbs=page.getByRole('navigation',{name:'Breadcrumb',exact:true});
  await expect(crumbs).toBeVisible();
  await expect(crumbs.locator('li')).toHaveCount(3);
  await expect(crumbs.getByRole('link',{name:'Tutorials',exact:true})).toHaveAttribute('href','/tutorials/');
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(await page.locator('h1').innerText());
  assert.match(await crumbs.locator('a').nth(1).getAttribute('href'),/^\/tutorials\/\?category=/);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1100});
   await expect(crumbs).toBeVisible();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug}: breadcrumb overflow at ${width}`);
   await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qf-blog-nav-h'))-document.querySelector('[data-tutorial-breadcrumbs]').getBoundingClientRect().height)<1);
  }
  if(slug==='duckdb-postgresql-query-pushdown'){
   await page.screenshot({path:'/tmp/query-farm-articles-review/tutorial-breadcrumb-mobile.png'});
   await expect(page.locator('#optional-run-a-real-postgresql-lab')).toHaveCount(0);
   await expect(page.locator('.tutorial-byline')).toContainText('4 min read');
   assert.ok(await page.locator('#find-the-boundary-when-a-query-is-slow').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('[data-tutorial-challenge]'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Diagnosis comes before the optional browser challenge');
   await expect(page.locator('.qf-prose')).not.toContainText('postgresql://localhost/qf_pushdown_demo');
  }
  await page.setViewportSize({width:1440,height:1100});
  if(slug==='duckdb-postgresql-query-pushdown')await page.screenshot({path:'/tmp/query-farm-articles-review/tutorial-breadcrumb-desktop.png'});
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`https://query.farm/tutorials/${slug}/`);
  const schemas=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.textContent)));
  assert.ok(schemas.some(s=>s['@type']==='Article'));
  assert.equal((await page.request.get(`${origin}/blog/${slug}/`)).status(),404);
 }
 assert.equal((await page.goto(`${origin}/blog/rapidfuzz-for-duckdb-2/`)).status(),200);
 await expect(page.locator('.blog-subnav')).toBeVisible();
 await expect(page.locator('article[data-content-type="blog"]')).toBeVisible();
 assert.ok((await page.locator('script[type="application/ld+json"]').allTextContents()).some(s=>JSON.parse(s)['@type']==='BlogPosting'));
 await page.goto(`${origin}/blog/`);
 for(const slug of slugs)await expect(page.locator(`main a[href*="${slug}"]`)).toHaveCount(0);
 await page.goto(`${origin}/vgi/docs/python/`);
 assert.deepEqual(await page.locator('nav[aria-label="Site"] a').evaluateAll(links=>links.map(a=>a.textContent.trim()).filter(name=>['Blog','Tutorials'].includes(name))),['Blog','Tutorials']);
 assert.deepEqual(errors,[]);
 console.log('Tutorial index, Blog/Tutorials order across headers, responsive breadcrumbs, short diagnostic lesson, canonical metadata and blog regression checks passed.');
}finally{await browser.close()}
