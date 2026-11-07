import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const slug of ['fuzzy-matching-duckdb','compare-parquet-duckdb','duckdb-postgresql-query-pushdown']){
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();
  const requests=[];page.on('request',r=>{if(/google-analytics.com|googletagmanager.com/.test(r.url()))requests.push(r.url())});
  await page.clock.install();
  await page.addInitScript(()=>{window.articleEvents=[];window.gtag=(...args)=>window.articleEvents.push(args)});
  await page.goto(`${origin}/tutorials/${slug}/`);
  if(await page.locator('.tutorial-example .copy-button').count()){
   await page.locator('.tutorial-example .copy-button').first().click();
   await expect.poll(()=>page.evaluate(()=>window.articleEvents.filter(e=>e[1]==='tutorial_copy').length)).toBe(1);
  }
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-tutorial-download="walkthrough"]').click();
  await downloadPromise;
  await page.evaluate(()=>{
   const link=document.querySelector('[data-post-next-step] a');
   link.addEventListener('click',event=>event.preventDefault(),{once:true});link.click();
   scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
  });
  await page.clock.fastForward(5000);
  const readEvents=()=>page.evaluate(()=>window.articleEvents.filter(e=>e[1]==='tutorial_read_progress'));
  assert.deepEqual(await readEvents(),[],'Scrolling to the end immediately is not qualified reading');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))});
  await page.clock.fastForward(60000);
  assert.deepEqual(await readEvents(),[],'Hidden-tab time must not accrue reading progress');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))});
  await page.clock.fastForward(46000);
  assert.deepEqual((await readEvents()).map(e=>e[2].percent),[25,50,90]);
  await page.clock.fastForward(60000);
  assert.equal((await readEvents()).length,3,'Each milestone fires once');
  const events=await page.evaluate(()=>window.articleEvents);
  assert.ok(events.some(e=>e[1]==='tutorial_download'&&e[2].post===slug&&e[2].resource==='walkthrough'));
  assert.ok(events.some(e=>e[1]==='post_next_step_click'&&e[2].post===slug));
  for(const event of events.filter(event=>event[1]?.startsWith('tutorial_')||event[1]==='post_next_step_click'))assert.equal(event[2].content_type,'tutorial');
  assert.deepEqual(requests,[]);
  results.push({slug,events,productionAnalyticsRequests:requests});
  console.log(`${slug}: copies, downloads, product CTA, visible-time milestones, and local GA exclusion passed`);
  await context.close();
 }
 await mkdir('/tmp/query-farm-articles-review',{recursive:true});
 await writeFile('/tmp/query-farm-articles-review/analytics-results.json',JSON.stringify(results,null,2));
}finally{await browser.close()}
