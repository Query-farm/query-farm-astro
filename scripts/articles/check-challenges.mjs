import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {captureTerminal,waitForPrompt,runSQL} from '../../tests/extensions/wasm-helpers.ts';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const output='/tmp/query-farm-articles-review';
await mkdir(output,{recursive:true});
const alternatives={
 'compare-parquet-duckdb':'SELECT id, name FROM current WHERE id NOT IN (SELECT id FROM previous)',
 'fuzzy-matching-duckdb':'SELECT customer_id, customer, score FROM candidates WHERE lead_id = 105 QUALIFY dense_rank() OVER (ORDER BY score DESC) = 1 ORDER BY customer_id DESC',
 'duckdb-postgresql-query-pushdown':"WITH totals AS (SELECT region, sum(amount) AS total FROM orders WHERE status = 'cancelled' GROUP BY region) SELECT * FROM totals WHERE total > 25000 ORDER BY region DESC",
};
const browser=await chromium.launch();
const results=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 await context.addInitScript(()=>{window.challengeEvents=[];window.gtag=(...args)=>window.challengeEvents.push(args)});
 for(const [slug,alternative] of Object.entries(alternatives)){
  const page=await context.newPage();const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/google-analytics.com|googletagmanager.com/.test(request.url()))requests.push(request.url())});
  await captureTerminal(page);
  await page.goto(`${origin}/tutorials/${slug}/`);
  const challenge=page.locator('[data-tutorial-challenge]');
  await expect(challenge).toHaveAttribute('data-challenge-ready','true');
  const config=JSON.parse(await challenge.locator('[data-challenge-config]').textContent());
  const editor=challenge.locator('[data-challenge-editor]');
  const check=challenge.locator('[data-challenge-check]');
  const status=challenge.locator('[data-challenge-status]');
  const run=async(sql,expected)=>{
   if(sql!==undefined)await editor.fill(sql);
   await check.click();
   await expect(check).toBeEnabled({timeout:120000});
   assert.equal(await challenge.getAttribute('data-state'),expected,`${slug}: ${await status.textContent()}`);
  };
  await run(undefined,'mismatch');
  await expect(challenge.locator('[data-challenge-output]')).toBeVisible();
  await run('SELECT FROM broken syntax','error');
  await run(alternative,'passed');
  const expected=config.rows.map(row=>row.map(String).join('|')).sort();
  const actual=await challenge.locator('[data-challenge-table] tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent).join('|')).sort());
  assert.deepEqual(actual,expected);
  await run(`SELECT * FROM (${alternative}) UNION ALL SELECT * FROM (${alternative})`,'mismatch');
  for(const kind of ['hint','solution']){
   await challenge.locator(`[data-challenge-${kind}] summary`).focus();
   await page.keyboard.press('Enter');
   await expect(challenge.locator(`[data-challenge-${kind}]`)).toHaveAttribute('open','');
  }
  await challenge.locator('[data-challenge-load-solution]').click();
  await expect(editor).toHaveValue(config.solution);
  await run(undefined,'passed');
  // The existing terminal and the new challenge share the WASM engine but
  // must never share mutable tables or files.
  if(slug==='compare-parquet-duckdb'){
   const example=page.locator('[data-article-example]').first();
   await example.locator('.example-toolbar-run-button').click();
   await waitForPrompt(page);
   await expect(example.locator('.example-shell')).toHaveAttribute('data-example-status','succeeded',{timeout:90000});
   await runSQL(page,'CREATE OR REPLACE VIEW current AS SELECT * FROM previous WHERE false;');
   await run(alternative,'passed');
   const shellResult=await runSQL(page,'SELECT count(*) AS remaining FROM current;');
   assert.match(shellResult,/│\s*0\s*│/,'Challenge setup must not overwrite the terminal session');
   await example.locator('.example-toolbar-run-button').click();
  }
  await challenge.locator('[data-challenge-solution] summary').click();
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1100});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug}: overflow at ${width}`);
   await challenge.screenshot({path:`${output}/${slug}-challenge-${width}.png`});
  }
  await editor.fill(`${alternative} LIMIT 0`);
  await expect(challenge).toHaveAttribute('data-state','ready');
  await expect(challenge.locator('[data-challenge-output]')).toBeHidden();
  await challenge.locator('[data-challenge-reset]').click();
  await expect(editor).toHaveValue(config.starter);
  const events=await page.evaluate(()=>window.challengeEvents.filter(event=>event[1].startsWith('tutorial_challenge_')));
  assert.equal(events.filter(event=>event[1]==='tutorial_challenge_start').length,1);
  const completions=events.filter(event=>event[1]==='tutorial_challenge_complete');
  assert.equal(completions.length,1);
  assert.equal(completions[0][2].assisted,false);
  assert.ok(events.some(event=>event[1]==='tutorial_challenge_attempt'&&event[2].assisted&&event[2].outcome==='passed'));
  const allowed=['post','content_type','challenge_id','attempt','attempts','outcome','assisted'];
  for(const event of events){assert.ok(Object.keys(event[2]).every(key=>allowed.includes(key)));assert.equal(event[2].post,slug);}
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  results.push({slug,checks:'starter, syntax error, alternate solution, duplicate rows, supplied solution, reset, keyboard, analytics, mobile',events});
  console.log(`${slug}: real WASM challenge, equivalent SQL, feedback, analytics and mobile checks passed`);
  await page.close();
 }
 const page=await context.newPage();
 await page.goto(`${origin}/tutorials/`);
 const hero=page.locator('[data-tutorial-hero]');
 await expect(hero).toHaveAttribute('data-tutorial-hero-ready','true');
 await expect(page.locator('[data-tutorial-card] [data-tutorial-card-art]')).toHaveCount(13);
 const reveal=hero.locator('[data-hero-reveal]');
 await reveal.focus();await page.keyboard.press('Enter');
 await expect(hero).toHaveAttribute('data-revealed','true');
 await expect(hero.locator('[data-hero-answer]')).toContainText('Ada and Ben');
 await reveal.click();await expect(hero).toHaveAttribute('data-revealed','false');
 assert.equal(await hero.locator('.changed-mark').first().evaluate(element=>getComputedStyle(element).transitionDuration),'0s');
 const sizes=[];
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1100});await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  sizes.push({width,catalogTop:await page.locator('#tutorial-catalog').evaluate(element=>element.getBoundingClientRect().top)});
  await page.screenshot({path:`${output}/tutorial-library-updated-${width}.png`,fullPage:true});
 }
 const plain=await browser.newPage({javaScriptEnabled:false});
 await plain.goto(`${origin}/tutorials/`);
 await expect(plain.locator('[data-tutorial-hero]')).toHaveAttribute('data-revealed','true');
 await expect(plain.locator('[data-hero-reveal]')).toBeHidden();
 await plain.goto(`${origin}/tutorials/compare-parquet-duckdb/`);
 await plain.locator('[data-challenge-solution] summary').click();
 await expect(plain.locator('[data-challenge-solution] pre')).toBeVisible();
 results.push({hero:'keyboard reveal/reset, original SVG cards, reduced motion, no JS',sizes});
 await writeFile(`${output}/challenge-results.json`,JSON.stringify(results,null,2));
 console.log('Compact hero, illustrated cards, keyboard controls and no-JavaScript fallbacks passed.',sizes);
}finally{await browser.close()}
