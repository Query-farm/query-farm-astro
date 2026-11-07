// Render the actual article visual, so review thumbnails and social cards stay
// in step with the interactive version. Start the local dev server first.
import {chromium} from 'playwright';
import {writeFile,unlink} from 'node:fs/promises';
import sharp from 'sharp';
const origin=process.env.ARTICLE_PREVIEW_URL??'http://127.0.0.1:4438';
const figures=[
 ['fuzzy-matching-duckdb',['A perfect score.','The wrong','customer?'],'Match names. Keep the evidence.'],
 ['compare-parquet-duckdb',['Five rows.','Four changes.','Spot them all.'],'Compare Parquet with DuckDB.'],
 ['duckdb-postgresql-query-pushdown',['8,000 rows.','Or just four.','Same answer.'],'Move the work. Inspect the plan.'],
];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:2,reducedMotion:'reduce'});
 for(const [slug,lines,subtitle] of figures){
  await page.goto(`${origin}/tutorials/${slug}/`);
  await page.evaluate(()=>document.fonts.ready);
  const figure=page.locator('[data-tutorial-visual]');
  if(slug==='compare-parquet-duckdb')await figure.locator('button').click();
  const rendered=await figure.screenshot();
  const dir=new URL(`../../public/media/posts/${slug}/`,import.meta.url);
  // Buffer all outputs before writing: writing public assets can trigger HMR.
  const workflow=await sharp(rendered).resize({width:1200}).png().toBuffer();
  const preview=await sharp(rendered).resize({width:730,height:550,fit:'inside'}).png().toBuffer();
  const size=await sharp(preview).metadata();
  const social=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f8f5ed"/><g font-family="Arial,sans-serif"><text x="42" y="60" fill="#45632f" font-weight="700" font-size="18" letter-spacing="2">QUERY.FARM</text>${lines.map((line,i)=>`<text x="42" y="${220+i*61}" fill="#28221b" font-size="46" font-weight="700">${esc(line)}</text>`).join('')}<text x="42" y="450" fill="#695b49" font-size="18">${esc(subtitle)}</text><text x="42" y="570" fill="#45632f" font-size="17">A hands-on SQL experiment →</text></g></svg>`);
  const card=await sharp(social).composite([{input:preview,left:455+Math.floor((730-size.width)/2),top:Math.floor((630-size.height)/2)}]).png().toBuffer();
  await writeFile(new URL('workflow.png',dir),workflow);
  await writeFile(new URL('social.png',dir),card);
  for(const file of ['workflow.svg','workflow-mobile.svg'])await unlink(new URL(file,dir)).catch(e=>{if(e.code!=='ENOENT')throw e});
  console.log(slug);
 }
}finally{await browser.close()}
