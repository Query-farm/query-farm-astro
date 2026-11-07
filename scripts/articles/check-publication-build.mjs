import {readdir,readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parse} from 'parse5';
const root=new URL('../../',import.meta.url);
const exists=async path=>{try{await stat(path);return true}catch(error){if(error.code==='ENOENT')return false;throw error}};
function elements(html){const result=[];const visit=node=>{if(node.tagName)result.push({tag:node.tagName,attrs:Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value])),text:(node.childNodes??[]).filter(n=>n.nodeName==='#text').map(n=>n.value).join('')});for(const child of node.childNodes??[])visit(child)};visit(parse(html));return result;}
function indexable(nodes){return !nodes.some(n=>n.tag==='meta'&&n.attrs.name==='robots'&&/\b(noindex|none)\b/i.test(n.attrs.content??''));}
const tutorials=[];
for(const filename of await readdir(new URL('src/content/tutorials/',root))){
 if(!filename.endsWith('.mdx'))continue;
 const source=await readFile(new URL('src/content/tutorials/'+filename,root),'utf8');
 const frontmatter=source.split('---')[1];
 tutorials.push({slug:filename.slice(0,-4),draft:/^draft:\s*true\s*$/m.test(frontmatter),date:frontmatter.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1]});
}
const indexHTML=await readFile(new URL('dist/tutorials/index.html',root),'utf8');
assert.equal(indexable(elements(indexHTML)),tutorials.some(t=>!t.draft),'Catalog indexing must follow publication state');
const sitemaps=(await Promise.all((await readdir(new URL('dist/',root))).filter(name=>/^sitemap.*\.xml$/.test(name)).map(name=>readFile(new URL('dist/'+name,root),'utf8')))).join('\n');
for(const tutorial of tutorials){
 const {slug,draft,date}=tutorial;
 const path=new URL(`dist/tutorials/${slug}/index.html`,root);
 assert.equal(await exists(path),!draft,`${slug}: publication visibility`);
 assert.equal(indexHTML.includes(`/tutorials/${slug}/`),!draft,`${slug}: catalog link`);
 const canonical=`https://query.farm/tutorials/${slug}/`;
 assert.equal(sitemaps.includes(`<loc>${canonical}</loc>`),!draft,`${slug}: sitemap inclusion`);
 if(draft)continue;
 const html=await readFile(path,'utf8'),nodes=elements(html);
 assert.ok(indexable(nodes),`${slug}: unexpected noindex`);
 assert.ok(nodes.some(n=>n.tag==='link'&&n.attrs.rel==='canonical'&&n.attrs.href===canonical),`${slug}: canonical`);
 assert.ok(!nodes.some(n=>'data-tutorial-draft' in n.attrs),`${slug}: draft badge`);
 const article=nodes.filter(n=>n.tag==='script'&&n.attrs.type==='application/ld+json').map(n=>JSON.parse(n.text)).find(n=>n['@type']==='Article');
 assert.ok(article,`${slug}: Article schema`);
 assert.equal(article.mainEntityOfPage['@id'],canonical);
 assert.ok(article.datePublished.startsWith(date),`${slug}: publication date`);
 assert.ok(nodes.some(n=>n.tag==='script'&&n.text.includes('G-EZ01WJETLF')&&n.text.includes('location.hostname')),`${slug}: production analytics gate`);
 assert.ok(nodes.some(n=>'data-pagefind-body' in n.attrs),`${slug}: site search body`);
 const sitemapEntry=sitemaps.match(new RegExp(`<url>\\s*<loc>${canonical.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</loc>[\\s\\S]*?</url>`))?.[0];
 assert.ok(sitemapEntry?.includes(`<lastmod>${date}`),`${slug}: authored sitemap date`);
}
for(const name of ['next-tutorials','search-tutorials','practical-tutorials']){
 assert.equal(await exists(new URL(`dist/review/${name}/index.html`,root)),false,`${name}: review route leaked`);
 assert.ok(!sitemaps.includes(`/review/${name}/`));
}
for(const [extension,slug] of [['jsonata','duckdb-jsonata-api-responses'],['hashfuncs','duckdb-repeatable-experiment-groups'],['datasketches','duckdb-overall-p95']]){
 const html=await readFile(new URL(`dist/products/extensions/${extension}/index.html`,root),'utf8');
 assert.ok(html.includes(`/tutorials/${slug}/`),`${extension}: published tutorial backlink`);
}
console.log(`${tutorials.filter(t=>!t.draft).length} published tutorials: routes, indexability, canonicals, Article schema, sitemap dates, analytics gates, search markup and extension backlinks verified. Review routes excluded.`);
