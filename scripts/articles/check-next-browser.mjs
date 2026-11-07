import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {captureTerminal,terminalText,waitForPrompt,runSQL} from '../../tests/extensions/wasm-helpers.ts';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const output='/tmp/query-farm-articles-review';await mkdir(output,{recursive:true});
const selected=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const layoutOnly=process.argv.includes('--layout-only');
const batch=process.argv.find(arg=>arg.startsWith('--batch='))?.split('=')[1]??'next-ten';
const allFixtures=(await Promise.all((await readdir(new URL('../../src/data/tutorials/',import.meta.url))).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(new URL('../../src/data/tutorials/'+name,import.meta.url))))));
const fixtures=allFixtures.filter(data=>data.batch===batch&&(!selected.length||selected.includes(data.slug)));
assert.ok(fixtures.length,'No fixtures selected');
const browser=await chromium.launch();const results=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 await context.addInitScript(()=>{window.nextTutorialEvents=[];window.gtag=(...args)=>window.nextTutorialEvents.push(args)});
 for(const data of fixtures){
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/google-analytics.com|googletagmanager.com/.test(request.url()))requests.push(request.url())});
  await captureTerminal(page);
  assert.equal((await page.goto(`${origin}/tutorials/${data.slug}/`)).status(),200);
  await expect(page.locator('[data-experiment-ready]')).toHaveCount(1);
  await expect(page.locator('[data-challenge-ready]')).toHaveCount(1);
  await expect(page.locator('.example-toolbar-run-button')).toHaveCount(data.examples.length,{timeout:30000});
  const source=await readFile(new URL('../../src/content/tutorials/'+data.slug+'.mdx',import.meta.url),'utf8');
  const robots=await page.locator('meta[name=robots]').evaluateAll(nodes=>nodes.map(n=>n.content).join(' '));
  assert.equal(/noindex/.test(robots),/^draft:\s*true\s*$/m.test(source));
  const words=await page.locator('.qf-prose').evaluate(element=>{const clone=element.cloneNode(true);clone.querySelectorAll('script,style,noscript').forEach(node=>node.remove());return clone.textContent.trim().split(/\s+/).length});
  assert.ok(words<1800,`${data.slug}: ${words} words; shorten before review`);
  for(const sample of data.sampleTables){
   const host=page.locator(`[data-sample-table="${sample.table}"]`);
   await expect(host.locator('thead th')).toHaveText(sample.columns);
   assert.deepEqual(await host.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent))),sample.rows.map(row=>row.map(value=>value===null?'NULL':String(value))));
  }
  const downloads=await page.locator('[data-tutorial-download]').evaluateAll(links=>links.map(link=>link.href));
  for(const href of downloads){const response=await page.request.get(href);assert.equal(response.status(),200,href);assert.ok((await response.body()).length>0);}
  for(const href of await page.locator('.qf-prose a[href^="/tutorials/"]').evaluateAll(links=>[...new Set(links.map(link=>link.href))]))assert.equal((await page.request.get(href)).status(),200,href);
  const figure=page.locator('[data-tutorial-experiment]');
  for(const button of await figure.locator('[data-experiment-choice]').all()){
   const choice=await button.getAttribute('data-experiment-choice');await button.focus();await page.keyboard.press('Enter');
   await expect(figure).toHaveAttribute('data-choice',choice);
   await expect(figure.locator(`[data-experiment-scene="${choice}"]`)).toBeVisible();
   await expect(figure.locator('[data-experiment-scene]:visible')).toHaveCount(1);
   await figure.screenshot({path:`${output}/${data.slug}-${choice}.png`});
  }
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${data.slug}: overflow at ${width}`);
   await figure.screenshot({path:`${output}/${data.slug}-experiment-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/${data.slug}-article-top.png`});
  const executed=[];
  if(!layoutOnly){
   for(const example of data.examples){
    const section=page.locator(`[data-article-example="${example.id}"]`);
    if(example.expectedRows){
     await expect(section.locator('[data-tutorial-result] thead th')).toHaveText(example.expectedColumns);
     assert.deepEqual(await section.locator('[data-tutorial-result] tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent.trim()))),example.expectedRows.map(row=>row.map(value=>value===null?'NULL':String(value))));
    }
    await section.locator('.example-toolbar-run-button').click();
    await expect(section.locator('.example-shell')).toHaveAttribute('data-example-status','succeeded',{timeout:120000});
    await waitForPrompt(page);let text=await terminalText(page);
    assert.doesNotMatch(text,/(?:Error|Exception):/);
    if(example.expectedRows?.length){
     const literal=value=>value===null?'NULL':typeof value==='string'?"'"+value.replaceAll("'","''")+"'":String(value);
     const values=example.expectedRows.map(row=>'('+row.map(literal).join(',')+')').join(',');
     const sql=example.sql.replace(/;\s*$/,'').replace(/\s+/g,' ');
     text=await runSQL(page,`WITH actual AS (${sql}), expected AS (SELECT * FROM (VALUES ${values})) SELECT CASE WHEN NOT EXISTS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) THEN 'qf-verified' ELSE 'qf-mismatch' END AS result;`);
     assert.match(text,/│\s*qf-verified\s*│/,data.slug+': '+example.id+' '+text);
    }
    executed.push(example.id);
    await section.locator('.example-toolbar-run-button').click();
   }
   const challenge=page.locator('[data-tutorial-challenge]');const check=challenge.locator('[data-challenge-check]');
   await check.click();await expect(check).toBeEnabled({timeout:120000});
   assert.equal(await challenge.getAttribute('data-state'),'mismatch',`${data.slug}: starter: ${await challenge.locator('[data-challenge-status]').textContent()}`);
   await challenge.locator('textarea').fill(data.challenge.solution);await check.click();await expect(check).toBeEnabled({timeout:120000});
   assert.equal(await challenge.getAttribute('data-state'),'passed',`${data.slug}: solution: ${await challenge.locator('[data-challenge-status]').textContent()}`);
   await expect(challenge.locator('[data-challenge-output]')).toBeVisible();
   await page.setViewportSize({width:390,height:1000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${data.slug}: challenge output overflows at 390px`);
   await challenge.screenshot({path:`${output}/${data.slug}-checked-challenge.png`});
  }
  const events=await page.evaluate(()=>window.nextTutorialEvents);
  assert.ok(events.some(event=>event[1]==='tutorial_visual_interaction'&&event[2].post===data.slug));
  if(!layoutOnly){
   assert.equal(events.filter(event=>event[1]==='tutorial_challenge_complete').length,1);
   for(const example of data.examples)assert.ok(events.some(event=>event[1]==='try_extension_ready'&&event[2].post===data.slug&&event[2].example_id===example.id&&event[2].example_ok));
  }
  for(const event of events)for(const key of ['sql','query','results','error'])assert.ok(!(key in (event[2]??{})),`Raw ${key} must not be telemetry`);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  results.push({slug:data.slug,words,conservativeMinutes:Math.ceil(words/200),executed,challenge:!layoutOnly,errors,analyticsRequests:requests});
  await writeFile(`${output}/${batch}-${layoutOnly?'layout':'browser'}-results${selected.length?'-focused':''}.json`,JSON.stringify(results,null,2));
  console.log(`${data.slug}: ${words} words; ${layoutOnly?'layout, diagrams, downloads':executed.length+' real WASM examples and challenge'} passed`);
  await page.close();
 }
 const index=await context.newPage();await index.goto(`${origin}/tutorials/`);
 await expect(index.locator('[data-catalog-ready]')).toHaveCount(1);
 await expect(index.locator('[data-tutorial-card]')).toHaveCount(allFixtures.length);
 await expect(index.locator('[data-tutorial-card]:visible')).toHaveCount(12);
 await index.locator('[data-catalog-next]').click();await expect(index.locator('[data-tutorial-card]:visible')).toHaveCount(Math.min(12,allFixtures.length-12));
 await index.goto(`${origin}/review/${batch==='practical-ten'?'practical':'next'}-tutorials/`);await expect(index.locator('main article')).toHaveCount(10);
 await index.screenshot({path:`${output}/${batch}-review.png`,fullPage:true});
 const plain=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:1000}});
 await plain.goto(`${origin}/tutorials/${fixtures[0].slug}/`);await expect(plain.locator('[data-experiment-scene]:visible')).toHaveCount(1);
 await expect(plain.locator('[data-article-example]')).toHaveCount(3);
 console.log(`${allFixtures.length} tutorials, catalog pagination, ten-draft review page and no-JavaScript reading passed.`);
}finally{await browser.close()}
