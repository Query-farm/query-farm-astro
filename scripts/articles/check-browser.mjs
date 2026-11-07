import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {captureTerminal,terminalText,waitForPrompt,runSQL} from '../../tests/extensions/wasm-helpers.ts';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const output=new URL('file:///tmp/query-farm-articles-review/');
await mkdir(output,{recursive:true});
const slugs=process.argv.slice(2).length ? process.argv.slice(2) : ['fuzzy-matching-duckdb','compare-parquet-duckdb','duckdb-postgresql-query-pushdown'];
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const slug of slugs){
  const data=JSON.parse(await readFile(new URL(`../../src/data/tutorials/${slug}.json`,import.meta.url)));
  const activeExamples=data.examples.filter(example=>example.browser!==false);
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[],analyticsRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/google-analytics.com|googletagmanager.com/.test(r.url()))analyticsRequests.push(r.url())});
  await page.addInitScript(()=>{window.articleEvents=[];window.gtag=(...args)=>window.articleEvents.push(args)});
  await captureTerminal(page);
  const response=await page.goto(`${origin}/tutorials/${slug}/`);
  assert.equal(response.status(),200);
  if(activeExamples.length)await page.locator('.example-toolbar-run-button').first().waitFor({timeout:30000});
  else await expect(page.locator('[data-challenge-ready]')).toHaveAttribute('data-challenge-ready','true');
  await expect(page.locator('.example-toolbar-run-button')).toHaveCount(activeExamples.length,{timeout:30000});
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
  await page.screenshot({path:new URL(`${slug}-desktop.png`,output).pathname});
  const words=await page.locator('.qf-prose').evaluate(e=>{const content=e.cloneNode(true);content.querySelectorAll('script,style,noscript').forEach(node=>node.remove());return content.textContent.trim().split(/\s+/).length});
  assert.ok(words<1800,`${slug}: ${words} words; keep total prose + code under 9 minutes at 200 wpm`);
  const examples=[];
  for(const example of activeExamples){
   console.log(`${slug}: running ${example.id}`);
   const section=page.locator(`#${example.id}`);
   await section.locator('.example-toolbar-run-button').click();
   await section.locator('.example-shell').waitFor();
   await expect(section.locator('.example-shell')).not.toHaveAttribute('data-example-status','running',{timeout:90000});
   await waitForPrompt(page);
   assert.equal(await section.locator('.example-shell').getAttribute('data-example-status'),'succeeded',await terminalText(page));
   const text=await terminalText(page);
   assert.doesNotMatch(text,/may\s+not\s+have\s+a\s+WebAssembly\s+build|(?:Error|Exception):/);
   // Query each independent session again as a JSON result. These are the
   // exact displayed statements, not a mocked database or replacement query.
   if(example.expectedRows?.length){
    const literal=v=>v===null?'NULL':typeof v==='string'?"'"+v.replaceAll("'","''")+"'":String(v);
    const rows=example.expectedRows.map(r=>'('+r.map(literal).join(',')+')').join(',');
    const sql=example.sql.replace(/;\s*$/,'').replace(/\s+/g,' ');
    const verification=`WITH actual AS (${sql}), expected AS (SELECT * FROM (VALUES ${rows})) SELECT CASE WHEN NOT EXISTS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) THEN 'qf-verified' ELSE 'qf-mismatch' END AS check_result;`;
    const actual=await runSQL(page,verification);
    assert.match(actual,/│\s*qf-verified\s*│/,example.id+': '+actual);
   }

   examples.push({id:example.id,status:'passed',output:text});
   if(example===data.examples[0])await section.screenshot({path:new URL(`${slug}-running.png`,output).pathname});
   await section.locator('.example-toolbar-run-button').click();
  }
  const events=await page.evaluate(()=>window.articleEvents);
  for(const example of activeExamples){
   assert.ok(events.some(e=>e[1]==='try_extension_ready'&&e[2]?.post===slug&&e[2]?.example_id===example.id&&e[2]?.example_ok===true&&e[2]?.content_type==='tutorial'&&e[2]?.page_type==='tutorial'),JSON.stringify(events));
  }
  for(const event of events){assert.ok(!('sql' in (event[2]??{})));}
  const missingImages=await page.locator('.qf-prose img').evaluateAll(images=>images.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src));
  assert.deepEqual(missingImages,[]);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>scrollTo(0,0));
   await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug} overflows at ${width}px`);
   if(width===390)await page.screenshot({path:new URL(`${slug}-mobile.png`,output).pathname});
  }
  assert.deepEqual(analyticsRequests,[],'Local review must not send production GA events');
  assert.deepEqual(errors,[]);
  results.push({slug,words,conservativeMinutes:Math.ceil(words/200),examples,events,analyticsRequests,errors});
  await writeFile(new URL(process.argv.slice(2).length ? 'browser-results-focused.json' : 'browser-results.json',output),JSON.stringify(results,null,2));
  console.log(`${slug}: ${words} words, ${examples.length} real WASM examples passed`);
  await context.close();
 }
}finally{await browser.close()}
