// Explicit generation; uses the same native Bézier artwork as the article.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
import {renderToPng,wordmark,COLORS} from './og-images/render.mjs';
const output=fileURLToPath(new URL('../public/media/posts/cache-control-for-remote-functions/',import.meta.url));
const article=readFileSync(new URL('../src/content/blog/http-caching-duckdb-vgi.md',import.meta.url),'utf8');
const title=article.match(/^title: "(.+)"$/m)?.[1];
if(!title) throw new Error('Article title missing');
const node=(type,style,children,extra={})=>({type,props:{style,children,...extra}});
// Rasterize nested SVG text with our brand fonts before Satori embeds it.
const artwork=new Resvg(readFileSync(new URL('../public/blog/cache-control-for-remote-functions/cache-bezier-lead.svg',import.meta.url)),{
  fitTo:{mode:'width',value:2184},
  font:{fontFiles:['Commissioner-400.ttf','Commissioner-500.ttf'].map(name=>fileURLToPath(new URL('./og-images/fonts/'+name,import.meta.url))),loadSystemFonts:false,defaultFontFamily:'Commissioner'},
}).render().asPng();
const card=node('div',{display:'flex',flexDirection:'column',width:1200,height:630,background:COLORS.soilPaper,color:COLORS.soil900,padding:'38px 54px 24px',fontFamily:'Commissioner',position:'relative'},[
 node('div',{display:'flex',justifyContent:'space-between',alignItems:'center'},[
  wordmark({size:'sm'}),
  node('div',{fontSize:18,letterSpacing:2,color:COLORS.soil700},'DUCKDB / VGI'),
 ]),
 node('div',{fontFamily:'Petrona',fontSize:64,fontWeight:600,lineHeight:1.03,maxWidth:990,marginTop:32},title),
 node('div',{fontSize:26,lineHeight:1.3,color:COLORS.soil700,marginTop:14},'Reuse valid API answers across repeated agent queries.'),
 node('img',{width:1092,height:346,marginTop:6},undefined,{src:'data:image/png;base64,'+artwork.toString('base64')}),
]);
mkdirSync(output,{recursive:true});
writeFileSync(output+'social.png',await renderToPng(card));
console.log(output+'social.png');
