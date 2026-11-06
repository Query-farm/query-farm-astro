#!/usr/bin/env node
// Film the labeled replay of real agent tool calls. No simulated terminal typing.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import story from '../src/data/vgi-agent-story.json' with { type: 'json' };
const baseURL = process.argv[2] || 'http://127.0.0.1:4347';
const scratch = resolve('.cache/vgi-agent-video');
const output = resolve('public/vgi/agents');
await mkdir(scratch, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width:1280, height:900 }, reducedMotion:'reduce', recordVideo:{ dir:scratch, size:{ width:1280, height:900 } } });
const started = Date.now();
const page = await context.newPage();
await page.goto(`${baseURL}/vgi/agent-build-recording/`);
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: `
  header, nav, footer, astro-dev-toolbar, [data-replay-intro], [data-replay-links] { display:none!important; }
  html, body { margin:0!important; padding:0!important; background:#1a1512!important; overflow:hidden!important; }
  main, [data-replay-page] { margin:0!important; padding:0!important; max-width:none!important; }
  .session-replay { display:flex; flex-direction:column; width:1280px; height:900px; border:0!important; border-radius:0!important; }
  .session-top { padding:24px 48px!important; }.session-top>span { font-size:19px!important; }.session-top small { font-size:14px!important; }
  .session-progress { padding:0 48px!important; }
  .session-frame { flex:1; min-height:0!important; padding:36px 48px 90px!important; position:relative; }
  .session-frame h2 { font-size:40px!important; margin-bottom:24px!important; }
  .frame-label { font-size:13px!important; margin-bottom:24px!important; }
  .session-frame pre { font-size:21px!important; line-height:1.65!important; }
  .frame-footer { position:absolute; bottom:20px; left:48px; right:48px; font-size:15px!important; max-width:none!important; }
  .session-controls { padding:18px 48px!important; font-size:14px!important; }
  .session-controls button { visibility:hidden; }
` });
const video = page.video();
const firstFrame = (Date.now() - started) / 1000;
for (let i=0; i<story.frames.length; i++) {
  if (i) await page.locator('[data-next]').evaluate(button => { if (button instanceof HTMLElement) button.click(); });
  if (i===0) await page.screenshot({ path:`${output}/agent-build-poster.png` });
  await page.screenshot({ path:`${scratch}/chapter-${i+1}.png` });
  await page.waitForTimeout(story.frames[i].seconds*1000);
}
await context.close();
const recording = await video.path();
await browser.close();
const duration = story.frames.reduce((total, frame) => total + frame.seconds, 0);
execFileSync('ffmpeg', ['-y','-ss',firstFrame.toFixed(3),'-i',recording,'-t',String(duration),'-an','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',`${output}/agent-build.mp4`], { stdio:'ignore' });
const timestamp = seconds => `00:${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.000`;
let cursor = 0;
await writeFile(`${output}/agent-build.vtt`, 'WEBVTT\n\n'+story.frames.map(frame => {
  const cue = `${timestamp(cursor)} --> ${timestamp(cursor+frame.seconds)}\n${frame.caption}\n`; cursor += frame.seconds; return cue;
}).join('\n'));
console.log(JSON.stringify({ duration, output:`${output}/agent-build.mp4`, captions:story.frames.length }));
