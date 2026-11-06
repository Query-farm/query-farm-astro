#!/usr/bin/env node
// Record the real page's controls and verified fixtures. This is an explanatory
// walkthrough, not a recording of an agent session or a live browser SQL engine.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const baseURL = process.argv[2] || 'http://127.0.0.1:4347';
const scratch = resolve('.cache/vgi-story-video');
const output = resolve('public/vgi/agents');
await mkdir(scratch, { recursive: true });
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir: scratch, size: { width: 1280, height: 900 } } });
const started = Date.now();
const page = await context.newPage();
await page.goto(`${baseURL}/vgi/build-with-an-agent/`);
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: `
  header, nav, astro-dev-toolbar { display:none!important; }
  html { scroll-behavior:auto!important; scroll-padding:100px 0; }
  #film-title { position:fixed; z-index:9999; top:0; inset-inline:0; padding:22px 60px; background:#f5f1e7; border-bottom:1px solid #cfc1aa; color:#211a12; font-size:25px; font-weight:600; }
  #film-title small { display:block; font-size:12px; color:#7d5714; font-weight:400; margin-bottom:4px; }
  .story-tabs { scroll-margin-top:120px; }
` });
await page.evaluate(() => { const title = document.createElement('div'); title.id = 'film-title'; document.body.append(title); });
const video = page.video();
const cues = [];
let elapsed = 0;
async function scene(title, caption, target, seconds, action) {
  await page.evaluate(title => { document.querySelector('#film-title').innerHTML = `<small>Query.Farm · VGI explained · recorded example</small>${title}`; }, title);
  if (action) await action();
  await page.locator(target).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  cues.push({ from: elapsed, to: elapsed + seconds, text: caption });
  elapsed += seconds;
  await page.waitForTimeout(seconds * 1000);
}
const firstFrame = (Date.now() - started) / 1000;
await scene('The query is missing a piece of code.', 'DuckDB has the orders. But shipping logic lives in application code. A VGI worker makes that function callable from SQL.', '[data-story-panel="0"]', 8);
await scene('VGI connects the query to your worker.', 'DuckDB sends typed columns to the worker. The worker runs your library and sends a column of answers back.', '[data-worker-flow]', 12, async () => {
  await page.locator('[data-worker-flow]').screenshot({ path: `${output}/worker-story-poster.png` });
  await page.locator('[data-flow-play]').click();
});
await scene('But one quote is not an order report.', 'Therefore, call the function with every order’s destination and weight. These are recorded results from the real SQL test.', '[data-story-panel="1"]', 8, () => page.getByRole('tab', { name: 'Every order' }).click());
await scene('Use the answers in the query you already have.', 'Two orders lose money after shipping. But a missing quote is not free shipping, so that order stays in the review queue.', '[data-story-panel="2"]', 9, () => page.getByRole('tab', { name: 'Orders at risk' }).click());
await scene('Give your agent a result it can prove.', 'The agent writes the worker and tests its actual SQL behavior. A failure feeds back into a repair and another test.', '.build-loop', 7);
await scene('Your agent. Your language. Your source and tests.', 'Choose your tools and describe the capability. Start with this fictional shipping example, then replace the rule with your own library.', '[data-agent-quickstart] .language-options', 7, () => page.getByRole('radio', { name: 'TypeScript', exact: true }).check());
await context.close();
const recording = await video.path();
await browser.close();
execFileSync('ffmpeg', ['-y', '-ss', firstFrame.toFixed(3), '-i', recording, '-t', String(elapsed), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${output}/worker-story.mp4`], { stdio: 'ignore' });
const timestamp = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`;
await writeFile(`${output}/worker-story.vtt`, 'WEBVTT\n\n' + cues.map(cue => `${timestamp(cue.from)} --> ${timestamp(cue.to)}\n${cue.text}\n`).join('\n'));
console.log(JSON.stringify({ duration: elapsed, output: `${output}/worker-story.mp4`, captions: cues.length }));
