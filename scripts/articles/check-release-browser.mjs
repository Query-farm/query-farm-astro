// Run against a normal production build served by preview-test.mjs.
// ARTICLE_PREVIEW_URL=http://127.0.0.1:4439 node scripts/articles/check-release-browser.mjs --browser=webkit
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {captureTerminal,terminalText,waitForPrompt,runSQL} from '../../tests/extensions/wasm-helpers.ts';
const browserName=process.argv.find(arg=>arg.startsWith('--browser='))?.split('=')[1]??'chromium';
assert.ok(['chromium','webkit'].includes(browserName));
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4439';
const selected=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const output=`/tmp/query-farm-articles-review/release-${browserName}`;await mkdir(output,{recursive:true});
const allFixtures=await Promise.all((await readdir(new URL('../../src/data/tutorials/',import.meta.url))).filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(new URL('../../src/data/tutorials/'+n,import.meta.url)))));
const fixtures=allFixtures.filter(d=>!selected.length||selected.includes(d.slug));
const version=JSON.parse(await readFile(new URL('../../package.json',import.meta.url))).dependencies['@haybarn/haybarn-wasm'];
const browser=await ({chromium,webkit}[browserName]).launch();
const results=[],runtimeRequests=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 await context.addInitScript(()=>{window.releaseEvents=[];window.gtag=(...args)=>window.releaseEvents.push(args)});
 for(const data of fixtures){
  const page=await context.newPage(),errors=[],analytics=[],fakeExtension=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=r.url();if(/google-analytics.com|googletagmanager.com/.test(u))analytics.push(u);if(u.includes('@haybarn/haybarn-wasm@'))runtimeRequests.push(u);if(/\/duckdb\.duckdb_extension/i.test(u))fakeExtension.push(u)});
  await captureTerminal(page);
  try {
   assert.equal((await page.goto(`${origin}/tutorials/${data.slug}/`)).status(),200);
   await expect(page.locator('[data-challenge-ready]')).toHaveCount(1);
   await expect(page.locator('[data-tutorial-draft]')).toHaveCount(0);
   for(const content of await page.locator('meta[name=robots]').evaluateAll(nodes=>nodes.map(n=>n.content)))assert.doesNotMatch(content,/\b(noindex|none)\b/i);
   const active=data.examples.filter(e=>e.browser!==false);
   await expect(page.locator('.example-toolbar-run-button')).toHaveCount(active.length,{timeout:30000});
   const words=await page.locator('.qf-prose').evaluate(e=>{const c=e.cloneNode(true);c.querySelectorAll('script,style,noscript').forEach(n=>n.remove());return c.textContent.trim().split(/\s+/).length});
   assert.ok(words<1800,`${data.slug}: ${words} words`);
   const experiment=page.locator('[data-tutorial-experiment]');
   if(await experiment.count()){
    await expect(experiment).toHaveAttribute('data-experiment-ready','true');
    for(const button of await experiment.locator('[data-experiment-choice]').all()){
     const choice=await button.getAttribute('data-experiment-choice');await button.focus();await page.keyboard.press('Enter');
     await expect(experiment).toHaveAttribute('data-choice',choice);
     await expect(experiment.locator(`[data-experiment-scene="${choice}"]`)).toBeVisible();
    }
   }else{
    const visual=page.locator('[data-tutorial-visual]');
    for(const button of await visual.locator('[data-visual-choice]').all()){
     await button.focus();await page.keyboard.press('Enter');
     await expect(button).toHaveAttribute('aria-pressed','true');
    }
   }
   for(const sample of data.sampleTables??[]){
    const host=page.locator(`[data-sample-table="${sample.table}"]`);
    await expect(host.locator('thead th')).toHaveText(sample.columns);
    assert.deepEqual(await host.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(c=>c.textContent))),sample.rows.map(row=>row.map(v=>v===null?'NULL':String(v))));
   }
   for(const href of await page.locator('[data-tutorial-download]').evaluateAll(links=>[...new Set(links.map(a=>a.href))]))assert.equal((await page.request.get(href)).status(),200,href);
   for(const width of [390,320,1440]){
    await page.setViewportSize({width,height:1100});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${data.slug}: overflow at ${width}`);
   }
   const executed=[];
   for(const example of active){
    const section=page.locator(`[data-article-example="${example.id}"]`);
    await section.locator('.example-toolbar-run-button').click();
    await expect(section.locator('.example-shell')).toHaveAttribute('data-example-status','succeeded',{timeout:120000});
    await waitForPrompt(page);
    assert.doesNotMatch(await terminalText(page),/(?:Error|Exception):/);
    if(example.expectedRows){
     const literal=v=>v===null?'NULL':typeof v==='string'?"'"+v.replaceAll("'","''")+"'":String(v);
     const sql=example.sql.replace(/;\s*$/,'').replace(/\s+/g,' ');
     let check;
     if(example.expectedRows.length){
      const values=example.expectedRows.map(row=>'('+row.map(literal).join(',')+')').join(',');
      check=`WITH actual AS (${sql}), expected AS (SELECT * FROM (VALUES ${values})) SELECT CASE WHEN NOT EXISTS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) THEN 'qf-verified' ELSE 'qf-mismatch' END AS result;`;
     }else check=`WITH actual AS (${sql}) SELECT CASE WHEN NOT EXISTS (SELECT * FROM actual) THEN 'qf-verified' ELSE 'qf-mismatch' END AS result;`;
     assert.match(await runSQL(page,check),/│\s*qf-verified\s*│/,data.slug+': '+example.id);
    }
    executed.push(example.id);
    await section.locator('.example-toolbar-run-button').click();
   }
   const challenge=page.locator('[data-tutorial-challenge]'),check=challenge.locator('[data-challenge-check]');
   const config=JSON.parse(await challenge.locator('[data-challenge-config]').textContent());
   await check.click();await expect(check).toBeEnabled({timeout:120000});
   assert.equal(await challenge.getAttribute('data-state'),'mismatch',`${data.slug}: starter: ${await challenge.locator('[data-challenge-status]').textContent()}`);
   await challenge.locator('textarea').fill(config.solution);await check.click();await expect(check).toBeEnabled({timeout:120000});
   assert.equal(await challenge.getAttribute('data-state'),'passed',`${data.slug}: solution: ${await challenge.locator('[data-challenge-status]').textContent()}`);
   await page.setViewportSize({width:390,height:1000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${data.slug}: checked result overflow`);
   await challenge.screenshot({path:`${output}/${data.slug}-challenge.png`});
   const events=await page.evaluate(()=>window.releaseEvents);
   assert.equal(events.filter(e=>e[1]==='tutorial_challenge_complete').length,1);
   assert.ok(events.some(e=>e[1]==='tutorial_visual_interaction'&&e[2].post===data.slug));
   for(const example of active)assert.ok(events.some(e=>e[1]==='try_extension_ready'&&e[2].post===data.slug&&e[2].example_id===example.id&&e[2].example_ok),`${data.slug}: missing successful-run analytics`);
   for(const event of events)for(const field of ['sql','query','results','error'])assert.ok(!(field in (event[2]??{})),`Raw ${field} in analytics`);
   assert.deepEqual(errors,[]);assert.deepEqual(analytics,[]);assert.deepEqual(fakeExtension,[]);
   results.push({slug:data.slug,words,executed,challenge:true,errors,analyticsRequests:analytics});
   await writeFile(`${output}/results${selected.length?'-focused':''}.json`,JSON.stringify(results,null,2));
   console.log(`${browserName}: ${data.slug}: ${executed.length} examples, challenge, layouts and analytics passed`);
  }catch(error){await page.screenshot({path:`${output}/${data.slug}-failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${output}/${data.slug}-terminal.txt`,await terminalText(page).catch(()=>''));throw error;}
  finally{await page.close();}
 }
 assert.ok(runtimeRequests.some(u=>u.includes(`@haybarn/haybarn-wasm@${version}/`)),`Expected pinned runtime ${version}`);
 assert.ok(!runtimeRequests.some(u=>u.includes('@haybarn/haybarn-wasm@')&&!u.includes(`@haybarn/haybarn-wasm@${version}/`)));
 const page=await context.newPage();await page.goto(`${origin}/tutorials/`);await expect(page.locator('[data-catalog-ready]')).toHaveCount(1);
 await expect(page.locator('[data-tutorial-card]')).toHaveCount(allFixtures.length);
 await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(12);
 await page.locator('[data-catalog-next]').click();await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(allFixtures.length-12);
 await page.getByRole('checkbox',{name:'JSONata',exact:true}).check();await expect(page.locator('[data-tutorial-card]:visible')).toHaveCount(1);
 const searchURLs=await page.evaluate(async()=>{const pf=await import('/pagefind/pagefind.js');const response=await pf.search('retention cohort');return Promise.all(response.results.slice(0,10).map(async r=>(await r.data()).url));});
 assert.ok(searchURLs.some(url=>url.includes('/tutorials/duckdb-retention-cohorts/')),`Published tutorial absent from site search: ${searchURLs}`);
 for(const slug of ['haybarn-2-0','lindel-duckdb-2-curve-keys','duckdb-2-upstream-contributions','duckdb-2-extension-availability']){
  assert.equal((await page.goto(`${origin}/blog/${slug}/`)).status(),200);
  await expect(page.locator('article[data-content-type=blog]')).toHaveCount(1);
  const missingImages=await page.locator('article img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src));assert.deepEqual(missingImages,[]);
 }
 const plain=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:1000}});
 await plain.goto(`${origin}/tutorials/`);await expect(plain.locator('[data-tutorial-card]:visible')).toHaveCount(allFixtures.length);
 await plain.goto(`${origin}/tutorials/duckdb-parquet-metadata/`);await expect(plain.locator('[data-article-example]')).toHaveCount(3);
 console.log(`${browserName}: ${results.length} tutorials; pinned ${version}; catalog, site search, blog regression and no-JavaScript reading passed.`);
} finally {await browser.close()}
