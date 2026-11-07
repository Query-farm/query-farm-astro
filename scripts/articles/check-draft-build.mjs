import {readdir,readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const slugs=(await readdir(new URL('src/data/tutorials/',root))).filter(file=>file.endsWith('.json')).map(file=>file.slice(0,-5));
const exists=async path=>{try{await stat(path);return true}catch(error){if(error.code==='ENOENT')return false;throw error}};
for(const slug of slugs)assert.equal(await exists(new URL(`dist/tutorials/${slug}/index.html`,root)),false,`Draft route leaked: ${slug}`);
assert.equal(await exists(new URL('dist/review/next-tutorials/index.html',root)),false);
assert.equal(await exists(new URL('dist/review/search-tutorials/index.html',root)),false);
assert.equal(await exists(new URL('dist/review/practical-tutorials/index.html',root)),false);
const index=await readFile(new URL('dist/tutorials/index.html',root),'utf8');
assert.match(index,/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/);
for(const slug of slugs)assert.ok(!index.includes(`/tutorials/${slug}/`),`Draft link leaked: ${slug}`);
for(const filename of (await readdir(new URL('dist/',root))).filter(name=>/^sitemap.*\.xml$/.test(name))){
 const text=await readFile(new URL('dist/'+filename,root),'utf8');
 for(const slug of slugs)assert.ok(!text.includes(`/tutorials/${slug}/`),`Draft sitemap entry: ${slug}`);
 assert.ok(!text.includes('/review/next-tutorials/'));
 assert.ok(!text.includes('/review/practical-tutorials/'));
}
console.log(`All ${slugs.length} draft routes and three review pages excluded from production; empty catalog noindex; no draft catalog or sitemap links.`);
