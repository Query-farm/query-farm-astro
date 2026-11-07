// Check the reader-facing contract: visible data precedes SQL, the interactive
// explanations work with a keyboard, and fixed interaction IDs reach analytics.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const output='/tmp/query-farm-articles-review';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
try{
 for(const [slug,kind,choices] of [
  ['fuzzy-matching-duckdb','matching',['split','tie','reordered']],
  ['compare-parquet-duckdb','snapshots',['revealed','hidden']],
  ['duckdb-postgresql-query-pushdown','pushdown',['remote','local']],
 ]){
  const data=JSON.parse(await readFile(new URL(`../../src/data/tutorials/${slug}.json`,import.meta.url)));
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/google-analytics.com|googletagmanager.com/.test(r.url()))requests.push(r.url())});
  await page.addInitScript(()=>{window.articleEvents=[];window.gtag=(...args)=>window.articleEvents.push(args)});
  assert.equal((await page.goto(`${origin}/tutorials/${slug}/`)).status(),200);
  await page.evaluate(()=>document.fonts.ready);
  const inputs=page.locator('[data-tutorial-data]');
  await expect(inputs).toBeVisible();
  assert.ok(await inputs.evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('.qf-prose pre'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Show input data before the first SQL block');
  for(const sample of data.sampleTables){
   const table=inputs.locator(`[data-sample-table="${sample.table}"]`);
   const shown=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent)));
   assert.deepEqual(shown,sample.rows.map(row=>row.map(value=>value===null?'NULL':String(value))));
   for(const file of sample.downloads){
    const response=await page.request.get(`${origin}/media/posts/${slug}/${file.file}`);
    assert.equal(response.status(),200);
    assert.ok((await response.body()).length>0);
   }
  }
  for(const example of data.examples.filter(example=>example.browser!==false)){
   const section=page.locator(`[data-article-example="${example.id}"]`);
   const output=section.locator('[data-tutorial-result]');
   await expect(output).toBeVisible();
   assert.ok(await output.evaluate(e=>Boolean(e.compareDocumentPosition(e.parentElement.querySelector('pre[data-language="sql"]'))&Node.DOCUMENT_POSITION_PRECEDING)),'Expected output must follow its SQL');
   if(example.expectedRows!==undefined){
    await expect(output.locator('thead th')).toHaveText(example.expectedColumns);
    const shown=await output.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent.trim())));
    assert.deepEqual(shown,example.expectedRows.map(row=>row.map(value=>value===null?'NULL':String(value))));
    if(!example.expectedRows.length)await expect(output).toContainText('No invalid keys found');
   }else{
    await expect(output.locator('pre')).toHaveText(example.planExcerpt);
   }
  }
  for(const [name,result] of Object.entries(data.nativeResults??{})){
   const plan=page.locator(`[data-result-id="native-${name}-plan"]`);
   const rows=page.locator(`[data-result-id="native-${name}-rows"]`);
   if(['aggregate','local_control'].includes(name))await expect(plan.locator('pre')).toHaveText(result.planExcerpt);
   if(name==='aggregate'){
    await expect(rows.locator('thead th')).toHaveText(result.columns);
    const shown=await rows.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent.trim())));
    assert.deepEqual(shown,result.rows.map(row=>row.map(String)));
   }
  }
  const figure=page.locator('[data-tutorial-visual]');
  for(const choice of choices){
   const button=figure.locator(`[data-visual-choice="${kind==='snapshots'?'revealed':choice}"]`);
   await button.focus();await page.keyboard.press('Enter');
   await expect(figure).toHaveAttribute('data-state',choice);
   if(kind==='matching'){
    await expect(figure.locator(`[data-visual-scene="${choice}"]`)).toBeVisible();
    if(choice==='split')await expect(figure.locator(`[data-visual-scene="${choice}"] .score-stamp b`)).toHaveText(['96.3','66.7']);
    if(choice==='tie')await expect(figure.locator(`[data-visual-scene="${choice}"] .score-stamp b`)).toHaveText(['100','100']);
   }
   if(kind==='snapshots')await expect(figure.locator('.snapshot-findings')).toBeVisible({visible:choice==='revealed'});
   if(kind==='pushdown')await expect(figure.locator('[data-transfer-count]')).toHaveText(choice==='remote'?'4':'8,000');
   const event=await page.evaluate(()=>window.articleEvents.filter(e=>e[1]==='tutorial_visual_interaction').at(-1));
   assert.deepEqual(event,['event','tutorial_visual_interaction',{post:slug,content_type:'tutorial',visual:kind,choice}]);
   await figure.screenshot({path:`${output}/${slug}-${choice}.png`});
  }
  const firstDownload=inputs.locator('[data-tutorial-download]').first();
  const resource=await firstDownload.getAttribute('data-tutorial-download');
  const download=page.waitForEvent('download');await firstDownload.click();await download;
  assert.ok(await page.evaluate(({slug,resource})=>window.articleEvents.some(e=>e[1]==='tutorial_download'&&e[2].post===slug&&e[2].resource===resource),{slug,resource}));
  const words=await page.locator('.qf-prose').evaluate(e=>{const content=e.cloneNode(true);content.querySelectorAll('script,style,noscript').forEach(node=>node.remove());return content.textContent.trim().split(/\s+/).length});
  assert.ok(words<1800,`${slug}: ${words} words`);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug}: overflow at ${width}`);
   if(width===390){
    for(const result of await page.locator('[data-tutorial-result="table"] .result-scroll').all()){
     // The table may be wider than a phone; keyboard focus must reach its
     // scroll container and the final column must be reachable.
     await result.focus();
     await result.evaluate(e=>{e.scrollLeft=e.scrollWidth});
     assert.ok(await result.evaluate(e=>Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2));
    }
   }
   await figure.screenshot({path:`${output}/${slug}-visual-${width}.png`});
   await inputs.screenshot({path:`${output}/${slug}-data-${width}.png`});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  results.push({slug,words,minutes:Math.ceil(words/200),inputTables:data.sampleTables.length,keyboardChoices:choices,errors,productionAnalyticsRequests:requests});
  console.log(`${slug}: visible inputs and outputs, downloads, keyboard diagrams, analytics and mobile checks passed; ${words} words`);
  await page.close();
 }
 await writeFile(`${output}/presentation-results.json`,JSON.stringify(results,null,2));
}finally{await browser.close()}
