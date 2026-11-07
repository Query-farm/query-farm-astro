import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {parse,parseFragment,serialize,serializeOuter} from 'parse5';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const browser=await chromium.launch();
function* elements(node){if(node.tagName)yield node;for(const child of node.childNodes??[])yield* elements(child)}
const attr=(node,name)=>node.attrs?.find(attr=>attr.name===name)?.value;
const setAttr=(node,name,value)=>{const found=node.attrs.find(attr=>attr.name===name);if(found)found.value=value;else node.attrs.push({name,value})};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.catalogEvents=[];window.gtag=(...args)=>window.catalogEvents.push(args)});
 await page.goto(`${origin}/tutorials/`);
 await expect(page.locator('[data-catalog-ready]')).toHaveAttribute('data-catalog-ready','true');
 await expect(page.locator('[data-tutorial-catalog] select')).toHaveCount(0);
 await expect(page.locator('[data-catalog-controls] input[type=search]')).toHaveCount(1);
 await expect(page.getByRole('checkbox',{name:'DuckDB',exact:true})).toHaveCount(0);
 const facet=(name)=>page.getByRole('checkbox',{name,exact:true});
 await facet('Files & formats').check();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(2);
 await expect(facet('RapidFuzz')).toBeDisabled();
 await expect(facet('RapidFuzz')).toHaveAttribute('aria-description','0 matching tutorials');
 await facet('Files & formats').uncheck();
 await facet('RapidFuzz').check();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveAttribute('data-tutorial-card','fuzzy-matching-duckdb');
 await page.goBack();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(12);
 await expect(facet('RapidFuzz')).not.toBeChecked();
 await facet('Files & formats').check();
 await facet('Clean & match data').check();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(6);
 await page.getByRole('button',{name:'Remove Files & formats',exact:true}).click();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(4);
 await page.locator('[data-catalog-clear]').click();
 await page.getByLabel('Search tutorials',{exact:true}).fill('customer names');
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(1);
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveAttribute('data-tutorial-card','fuzzy-matching-duckdb');
 assert.ok((await page.evaluate(()=>window.catalogEvents)).some(e=>e[1]==='tutorial_catalog_filter'&&e[2].has_query));
 assert.ok(!(await page.evaluate(()=>JSON.stringify(window.catalogEvents))).includes('customer names'),'Do not send raw search text in custom events');
 await page.goto(`${origin}/tutorials/?category=files-formats&tool=rapidfuzz`);
 await expect(page.locator('[data-catalog-empty]')).toBeVisible();
 await expect(facet('RapidFuzz')).toBeEnabled();
 await facet('RapidFuzz').uncheck();
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(2);
 await page.locator('[data-catalog-clear]').click();
 await page.screenshot({path:'/tmp/query-farm-articles-review/tutorial-catalog-desktop.png',fullPage:true});
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:1100});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390)await page.screenshot({path:'/tmp/query-farm-articles-review/tutorial-catalog-mobile.png',fullPage:true});
 }
 // Inject synthetic records into the HTTP response only. No fake content is
 // written to the repository, and the real catalog controller handles all 125.
 await page.route(url=>url.origin===origin&&url.pathname==='/tutorials/',async route=>{
  const response=await route.fetch();const document=parse(await response.text());
  const list=[...elements(document)].find(node=>attr(node,'data-catalog-items')!==undefined);
  const template=list.childNodes.find(node=>attr(node,'data-tutorial-card')!==undefined);
  const markup=serializeOuter(template);const original=JSON.parse(attr(template,'data-catalog-item'));
  list.childNodes=Array.from({length:125},(_,i)=>{
   const node=parseFragment(markup).childNodes[0];
   const item={...original,id:`lesson-${i}`,title:`Lesson ${String(i).padStart(3,'0')}`,outcome:i<60?'Compare Parquet exports':'Match customer names',category:i<60?'files-formats':'clean-match',technologies:i<60?['duckdb','parquet']:['duckdb','rapidfuzz'],level:i%2?'Intermediate':'Beginner',runtime:i%3?'browser':'browser-and-native',order:undefined,keywords:[]};
   setAttr(node,'data-tutorial-card',item.id);setAttr(node,'data-catalog-item',JSON.stringify(item));
   const heading=[...elements(node)].find(n=>n.tagName==='h3');const link=[...elements(heading)].find(n=>n.tagName==='a');
   link.childNodes=[{nodeName:'#text',value:item.title,parentNode:link}];node.parentNode=list;return node;
  });
  await route.fulfill({response,body:serialize(document)});
 });
 await page.goto(`${origin}/tutorials/`);
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(12);
 await expect(page.locator('[data-catalog-count]')).toHaveText('Showing 1–12 of 125 tutorials');
 await page.locator('[data-catalog-next]').click();
 await expect(page.locator('[data-catalog-page]')).toHaveText('Page 2 of 11');
 await expect(page.locator('[data-tutorial-card]:visible').first()).toHaveAttribute('data-tutorial-card','lesson-12');
 await page.goto(`${origin}/tutorials/?page=11`);
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(5);
 await expect(page.locator('[data-catalog-next]')).toBeDisabled();
 await facet('Files & formats').check();
 await expect(page.locator('[data-catalog-count]')).toHaveText('Showing 1–12 of 60 tutorials');
 await expect(facet('Clean & match data')).toHaveAttribute('aria-description','65 matching tutorials');
 await facet('Clean & match data').check();
 await expect(page.locator('[data-catalog-count]')).toHaveText('Showing 1–12 of 125 tutorials');
 await facet('Parquet').check();
 await expect(page.locator('[data-catalog-count]')).toHaveText('Showing 1–12 of 60 tutorials');
 await facet('RapidFuzz').check();
 await expect(page.locator('[data-catalog-count]')).toHaveText('Showing 1–12 of 125 tutorials');
 assert.deepEqual(errors,[]);
 await page.close();
 const plain=await browser.newPage({javaScriptEnabled:false});
 await plain.goto(`${origin}/tutorials/`);
 await expect(plain.locator('[data-tutorial-card]:visible')).toHaveCount(13);
 console.log('Visible multi-select facets, live counts, removable selections, one search box, no dropdowns, bookmarks, mobile layout and 125-entry pagination passed.');
}finally{await browser.close()}
