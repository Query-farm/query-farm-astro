import { chromium } from '@playwright/test';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir=resolve(process.argv[2] || '.cache/vgi-live-capture');
await mkdir(dir,{recursive:true});
await rm(dir+'/stop',{force:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir,size:{width:1440,height:1000}}});
const page=await context.newPage();await page.goto('http://127.0.0.1:4348/');
await page.request.post('http://127.0.0.1:4348/start');
await writeFile(dir+'/recording-started.txt',new Date().toISOString());
for(let i=0;i<600;i++){
 await page.waitForTimeout(2000);
 await page.screenshot({path:dir+'/current.png'});
 const {existsSync}=await import('node:fs');
 if(existsSync(dir+'/stop'))break;
}
await context.close();const path=await page.video().path();await browser.close();await writeFile(dir+'/recording-path.txt',path);console.log(path);
