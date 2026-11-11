// Article-specific paper collages, using the same drawing kit as Lindel.
// Run after editing the drafts: node design/extension-updates-2026-11/artwork.mjs
// Optional arguments select extension names. No network requests are needed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { C, canvas, svgDoc } from '../haybarn-2-0/paper.mjs';
import { renderToPng, wordmark, COLORS } from '../../scripts/og-images/render.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../../', import.meta.url);
const names = ['a5', 'cronjob', 'evalexpr-rhai', 'fuzzycomplete', 'geosilo', 'httpserver', 'inflector', 'json-schema', 'jsonata', 'minijinja', 'openprompt', 'quickjs', 'radio', 'redis', 'shellfs', 'tera', 'textplot', 'tsid', 'webmacro'];
const selected = process.argv.slice(2);
const palette = [C.ochre, C.moss, C.terra, C.sage];
const descriptions = {};

function draw(name) {
  const { out, paper, raw, j } = canvas([...name].reduce((seed, letter) => seed + letter.charCodeAt(0) * 31, 137));
  const rect = (x, y, w, h, fill = C.cream, angle = 0) => paper(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" transform="rotate(${angle} ${x+w/2} ${y+h/2})"/>`);
  const circle = (x, y, r, fill = C.ochre) => paper(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`);
  const line = (d, color = C.ink, width = 2.2, dash = '') => raw(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
  const thread = (x, y, xx, yy) => {
    line(`M${x} ${y} C${(x+xx)/2} ${y},${(x+xx)/2} ${yy},${xx} ${yy}`, C.umber, 1.8);
    circle(x,y,3.5,C.umber); circle(xx,yy,3.5,C.umber);
  };
  const ticks = (x,y,r,n=12) => {
    for(let i=0;i<n;i++){const a=i*2*Math.PI/n;line(`M${x+Math.sin(a)*(r-10)} ${y-Math.cos(a)*(r-10)} L${x+Math.sin(a)*r} ${y-Math.cos(a)*r}`,C.umber,2);}
  };
  const clock = (x,y,r,fill=C.cream) => {
    circle(x,y,r,fill); ticks(x,y,r-10);
    line(`M${x-r*.35} ${y-r*.28} L${x} ${y} L${x+r*.35} ${y-r*.48}`,C.ink,4); circle(x,y,5,C.ink);
  };
  const rows = (x,y,count=4,w=240) => {
    for(let i=0;i<count;i++){
      rect(x+j(3),y+i*54,w,38,C.cream,j(1));
      rect(x+12,y+i*54+9,18,20,palette[i%4]);
      line(`M${x+44} ${y+i*54+14} h${w*.55} M${x+44} ${y+i*54+24} h${w*.35}`,C.umber,2.5);
    }
  };
  const card = (x,y,w=230,h=150,color=C.cream) => {
    rect(x,y,w,h,color,j(1.2));
    for(let k=0;k<3;k++)line(`M${x+22} ${y+28+k*24} h${w-(k%2?75:50)}`,C.umber,2.4);
  };
  const frame = (x,y,w,h) => raw(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="8 7"/>`);
  const polygon = (cx,cy,r,n,fill,turn=-Math.PI/2) => paper(`<polygon points="${Array.from({length:n},(_,i)=>`${cx+Math.cos(turn+i*2*Math.PI/n)*r},${cy+Math.sin(turn+i*2*Math.PI/n)*r}`).join(' ')}" fill="${fill}"/>`);

  switch(name) {
    case 'a5': {
      circle(310,240,166,C.cream);
      for(let r=0;r<5;r++)for(let c=0;c<5;c++){
        const x=198+c*56+(r%2)*15,y=120+r*57;
        if(Math.hypot(x-310,y-240)<134)polygon(x,y,29,5,palette[(r+c)%4]);
      }
      line('M310 72 C200 160 200 320 310 408 M310 72 C420 160 420 320 310 408',C.umber,1.5);
      thread(488,240,650,240);
      polygon(790,238,163,5,C.ochre);
      for(let i=0;i<5;i++)polygon(790+Math.cos(i*1.257)*84,238+Math.sin(i*1.257)*84,43,5,palette[i%4]);
      thread(952,240,1085,240);
      for(let i=0;i<4;i++){
        rect(1110,95+i*80,230,55,C.cream,j(2));
        polygon(1140,122+i*80,15,5,palette[i]);
        line(`M1175 ${115+i*80} h130 M1175 ${130+i*80} h85`,C.umber,3);
      }
      descriptions[name]='An ochre and green paper globe connects to a magnified pentagonal cell and a stack of newly encoded cell identifiers.';
      break;
    }
    case 'cronjob': {
      rect(100,75,375,330); rect(100,75,375,52,C.terra);
      for(let r=0;r<4;r++)for(let c=0;c<6;c++)rect(122+c*56,152+r*54,38,34,(r*6+c)%7===0?C.ochre:C.bg,j(2));
      clock(730,240,155); thread(485,238,557,238); thread(902,238,987,238);
      rows(1010,108,5,315);
      [0,1,2,3].forEach(i=>circle(1300,127+i*54,7,i===2?C.terra:C.moss));
      descriptions[name]='A paper calendar, clock, and dated execution records connect scheduled SQL to its run history.';
      break;
    }
    case 'fuzzycomplete': {
      const offsets=[0,55,15,90,35];
      for(let i=0;i<5;i++){
        rect(90+offsets[i],84+i*64,360-offsets[i],45,C.cream,j(2));
        for(let k=0;k<7;k++)rect(110+offsets[i]+k*36,97+i*64,24,18,k===i?C.terra:C.sage);
        thread(470,106+i*64,700,95+i*67);
      }
      rect(716,60,68,360,C.ochre,-1);
      for(let i=0;i<5;i++){
        const yy=89+i*65;rect(860,yy,450,47,i===0?C.moss:C.cream,j(1));
        for(let k=0;k<8;k++)rect(878+k*33,yy+13,23,20,i===0?C.bg:C.sage);
        circle(1250,yy+23,13,i===0?C.ochre:C.sage);
      }
      descriptions[name]='Uneven rows of paper letter tiles pass a ranking strip and settle into an ordered list with the closest completion highlighted.';
      break;
    }
    case 'geosilo': {
      const path='M110 325 L145 170 L260 95 L350 182 L430 140 L482 330 L350 388 L250 340 Z';
      paper(`<path d="${path}" fill="${C.sage}"/>`);line(path+' Z',C.moss,4);
      for(const [x,y] of [[110,325],[145,170],[260,95],[350,182],[430,140],[482,330],[350,388],[250,340]])circle(x,y,6,C.ink);
      thread(500,240,632,240);
      for(let i=0;i<5;i++)rect(650+i*18,105+i*27,220,210-i*18,palette[i%4],-4+i*2);
      thread(960,240,1060,240);
      frame(1070,70,280,340);polygon(1210,210,100,6,C.sage);circle(1210,210,30,C.bg);
      line('M1150 350 l28 25 58 -63',C.moss,9);
      descriptions[name]='A polygon with marked vertices folds into a compact stack, then emerges inside a checked boundary as a polygon with a hole.';
      break;
    }
    case 'textplot': {
      rows(85,110,5,300);
      thread(410,238,580,238);
      rect(620,70,700,342,C.cream,-.5);
      const values=[[20,42,36,65,60,92,53,68,102,115],[30,25,80,45,105,80,70,105,75,90],[10,50,85,45,65,30,110,50,80,120]];
      values.forEach((v,i)=>{
        const y=165+i*95;circle(665,y-10,14,palette[i]);
        line(v.map((v,k)=>`${k?'L':'M'}${720+k*57} ${y-v*.55}`).join(' '),palette[i],5);
        line(`M710 ${y+10} h540`,C.umber,1);
      });
      descriptions[name]='Rows of observations collect into three small paper-backed sparklines, one line for each group.';
      break;
    }
    case 'tsid': {
      clock(235,235,139);
      line('M420 240 H1320',C.umber,3);
      for(let i=0;i<5;i++){
        const x=477+i*178,yy=i%2?267:88;
        rect(x-35,yy,145,130,C.cream,j(2));
        for(let k=0;k<4;k++)rect(x-17+k*28,yy+23,18,45,k<2?C.ochre:palette[i%4]);
        line(`M${x-17} ${yy+92} h92`,C.umber,3);
        line(`M${x+36} 240 V${i%2?yy:yy+130}`,C.umber,1.5);circle(x+36,240,7,C.moss);
      }
      descriptions[name]='A clock feeds a timeline of paper ID cards whose shared timestamp bands sit beside distinct random suffixes.';
      break;
    }
    case 'httpserver': {
      circle(710,240,190,C.cream);frame(484,28,452,424);
      rows(582,126,4,255);
      circle(485,240,46,C.ochre);line('M467 238 v-16 a18 18 0 0 1 36 0 v16',C.ink,4);rect(460,238,50,37,C.moss);
      card(95,146,240,170);thread(350,232,435,232);
      for(let i=0;i<3;i++){card(1080+i*12,90+i*100,220,80,i===1?C.sage:C.cream);}
      thread(940,240,1050,240);
      descriptions[name]='A local database sits within a dashed boundary, with a lock at the entrance and separate request cards outside.';
      break;
    }
    case 'openprompt': {
      for(let i=0;i<4;i++){
        const y=60+i*100;card(90,y,265,74);
        rect(308,y+17,24,36,palette[i]);
        thread(378,y+37,575,y+37);
        circle(718,y+37,36,palette[i]);
        thread(770,y+37,1020,y+37);
        card(1050,y,285,74);circle(1300,y+36,9,palette[i]);
      }
      frame(556,32,311,414);
      descriptions[name]='Four prompt cards carry their own colored options through separate requests to four corresponding response cards.';
      break;
    }
    case 'radio': {
      for(let i=0;i<4;i++)line(`M${170-i*28} ${135-i*20} Q${305+i*38} 240 ${170-i*28} ${345+i*20}`,C.terra,8-i);
      rect(355,150,570,180,C.cream,-1);
      for(let i=0;i<7;i++)rect(380+i*74,190,56,100,palette[i%4],j(3));
      line('M382 354 C500 440 800 440 920 354',C.umber,2,'6 5');
      line('M920 354 l-25 1 10 21',C.umber,2);
      rows(1070,125,4,270);thread(946,240,1046,240);
      descriptions[name]='Radio waves feed a queue of colored message tiles, a return loop, and a stack of received rows.';
      break;
    }
    case 'redis': {
      for(let i=0;i<3;i++){
        const y=75+i*120;
        circle(170,y+38,30,palette[i]);rect(190,y+27,190,22,palette[i]);rect(325,y+46,18,28,palette[i]);
        thread(410,y+38,585,y+38);
        rect(615,y,450,85,C.cream,j(1));
        for(let k=0;k<5;k++)rect(650+k*75,y+25,50,36,palette[(i+k)%4]);
        clock(1225,y+42,45,i===1?C.ochre:C.cream);
      }
      descriptions[name]='Three differently colored keys connect to separate cached value rows, each paired with a small timeout clock.';
      break;
    }
    case 'shellfs': {
      rows(90,114,5,255);
      paper(`<path d="M390 238 H650 V125 H915 V238 H1070" fill="none" stroke="${C.sage}" stroke-width="68" stroke-linejoin="round"/>`);
      line('M390 238 H650 V125 H915 V238 H1070',C.moss,3,'10 14');
      circle(780,125,54,C.ochre);line('M780 70 V180 M725 125 H835',C.ink,5);
      rows(1110,116,5,240);
      line('M670 375 h220',C.terra,8);rect(748,331,62,88,C.terra);
      descriptions[name]='Paper records flow through a bent pipe with a prominent valve and a separate stop control.';
      break;
    }
    case 'webmacro': {
      card(100,107,295,265);line('M145 270 l-18 20 18 20 M245 270 l18 20 -18 20 M190 265 l-18 50',C.moss,5);
      thread(420,240,575,240);
      rect(615,80,260,320,C.ochre,-2);rect(663,144,165,190,C.bg);
      line('M692 214 l-16 24 16 24 M795 214 l16 24 -16 24',C.ink,4);
      thread(905,240,1030,240);card(1070,120,260,240,C.sage);
      circle(1300,115,32,C.cream);line('M1284 114 l10 11 20 -24',C.moss,4);
      descriptions[name]='A downloaded code sheet passes through a single-statement paper stencil and becomes one checked macro card.';
      break;
    }
    case 'evalexpr-rhai': {
      rows(85,119,5,260);thread(365,240,480,240);
      frame(500,55,480,370);rect(525,80,430,320,C.cream,-.5);
      for(let i=0;i<4;i++){
        rect(565,120+i*62,44,28,palette[i]);
        line(`M640 ${134+i*62} h28 M654 ${120+i*62} v28 M710 ${128+i*62} h24 M710 ${139+i*62} h24`,C.ink,3);
        circle(810,134+i*62,20,palette[i]);
      }
      thread(1000,240,1080,240);clock(1220,168,75);rect(1110,300,225,60,C.sage);
      descriptions[name]='Rows feed arithmetic pieces inside a bounded evaluation frame, with a clock and reusable result card beside it.';
      break;
    }
    case 'inflector': {
      const nested=(x,base)=>{
        rect(x,65,455,350,C.cream,j(1));
        rect(x+30,95,280,35,base);
        for(let i=0;i<3;i++){
          frame(x+55,155+i*73,365,57);rect(x+78,170+i*73,120,25,palette[i]);
          line(`M${x+235} ${182+i*73} h145`,C.umber,3);
        }
      };
      nested(100,C.terra);nested(890,C.moss);
      thread(580,240,860,240);
      circle(720,240,65,C.ochre);line('M693 239 h54 M720 213 v53',C.ink,4);
      descriptions[name]='Two nested paper tables preserve their structure as differently styled field-name strips are renamed between them.';
      break;
    }
    case 'json-schema': {
      for(let i=0;i<4;i++){
        rect(95,60+i*101,280,76,C.cream,j(2));
        [0,1,2].forEach(k=>polygon(150+k*81,98+i*101,21,3+(i+k)%4,palette[k]));
      }
      rect(585,55,280,370,C.ochre,-1);
      [0,1,2].forEach(i=>polygon(725,132+i*107,39,3+i,C.bg));
      thread(395,240,555,240);
      for(let i=0;i<3;i++){
        rect(1055,70+i*120,280,86,C.cream,j(1));
        if(i<2)line(`M1090 ${109+i*120} l18 20 32 -38`,C.moss,7);
        else {line('M1090 335 l34 34 M1124 335 l-34 34',C.terra,6);line('M1160 345 h135 M1160 362 h90',C.terra,3);}
      }
      thread(895,240,1020,240);
      descriptions[name]='Rows of different paper shapes meet a schema stencil, producing accepted records and one record with a marked validation error.';
      break;
    }
    case 'jsonata': {
      const nodes=[[175,240],[330,135],[330,345],[485,70],[485,195],[485,310],[485,420]];
      for(const [a,b] of [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]])thread(...nodes[a],...nodes[b]);
      nodes.forEach(([x,y],i)=>rect(x-25,y-22,50,44,palette[i%4],j(3)));
      thread(550,240,675,240);circle(755,240,68,C.cream);
      line('M727 208 l-22 32 22 32 M782 208 l22 32 -22 32',C.ink,5);
      thread(835,240,945,240);rows(985,110,5,340);
      descriptions[name]='A branching tree of JSON values passes through expression brackets and is reshaped into selected result rows.';
      break;
    }
    case 'minijinja': {
      rect(95,83,360,310,C.cream,-2);
      for(let i=0;i<4;i++){line(`M130 ${125+i*65} h${i%2?185:280}`,C.umber,3);rect(280,144+i*52,125,24,C.bg);}
      [0,1,2].forEach(i=>rect(540,105+i*110,130,65,palette[i],j(3)));
      thread(475,240,710,240);frame(735,48,620,386);
      [0,1,2].forEach(i=>{card(785+i*157,118+i*35,214,230);rect(807+i*157,239+i*35,145,43,palette[i]);});
      descriptions[name]='A template sheet with empty slots combines with colored context pieces to make filled documents inside a bounded rendering area.';
      break;
    }
    case 'tera': {
      [0,1,2].forEach(i=>{card(105+i*28,90+i*35,280,240);rect(130+i*28,210+i*35,150,42,palette[i]);});
      thread(490,240,625,240);
      rect(645,70,230,340,C.ochre,-1);rect(685,113,150,255,C.bg);
      for(let i=0;i<3;i++)rect(709,140+i*76,104,39,palette[i]);
      thread(905,240,1050,240);card(1080,100,260,280,C.cream);frame(1056,67,308,346);
      for(let i=0;i<3;i++)rect(1102,225+i*40,210,24,palette[i]);
      descriptions[name]='Layered template sheets pass through a paper stencil, filling one output document within a rendering boundary.';
      break;
    }
    case 'quickjs': {
      circle(190,130,38,C.ochre);rect(155,213,75,67,C.moss,-5);polygon(190,362,46,3,C.terra);
      [130,245,362].forEach(y=>thread(255,y,500,y));
      frame(530,65,410,350);rect(558,90,354,300,C.cream,1);
      line('M630 164 C590 164 620 224 595 240 C620 254 590 315 630 315 M840 164 C880 164 850 224 875 240 C850 254 880 315 840 315',C.ink,6);
      circle(735,239,39,C.sage);thread(965,240,1070,240);
      clock(1210,140,65);rows(1085,253,3,250);
      descriptions[name]='A circle, square, and triangle retain their distinct types as they enter JavaScript braces, with a clock limiting the call.';
      break;
    }
    default: throw new Error(`Missing artwork for ${name}`);
  }
  return svgDoc(1440,480,out.join('\n'));
}

const block=(children,style={})=>({type:'div',props:{style:{display:'flex',...style},children}});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:480},deviceScaleFactor:2});
  for(const name of names.filter(n=>!selected.length||selected.includes(n))) {
    const slug=`${name}-for-duckdb-2`;
    const source=new URL(`src/content/blog/${slug}.md`,root);
    if(!existsSync(source)){console.log(`Waiting for draft: ${slug}`);continue;}
    let article=readFileSync(source,'utf8');
    const title=JSON.parse(article.match(/^title: (".*")$/m)[1]);
    const svg=draw(name);
    writeFileSync(new URL(`${slug}.svg`,import.meta.url),svg);
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const master=await page.screenshot();
    const directory=new URL(`public/media/posts/${slug}/`,root);
    mkdirSync(directory,{recursive:true});
    await sharp(master).resize(1440,480).webp({quality:88}).toFile(new URL('artwork.webp',directory).pathname);
    const art=await sharp(master).resize(1200,400).png().toBuffer();
    const card=block([
      block([wordmark({size:'sm'}),block('DUCKDB / EXTENSION UPDATE',{fontSize:17,fontWeight:600,color:COLORS.sun700})],{alignItems:'center',justifyContent:'space-between'}),
      block(title,{fontFamily:'Petrona',fontWeight:600,fontSize:title.length>95?42:48,lineHeight:1.08,marginTop:26,maxWidth:1090}),
      {type:'img',props:{src:`data:image/png;base64,${art.toString('base64')}`,width:1200,height:400,style:{position:'absolute',bottom:0,left:0}}},
    ],{position:'relative',width:1200,height:630,padding:'40px 54px 0',flexDirection:'column',backgroundColor:COLORS.soilPaper,color:COLORS.soil900,fontFamily:'Noto Sans'});
    writeFileSync(new URL('social.png',directory),await renderToPng(card));
    article=article.replace(/^heroImageAlt: .*$/m,`heroImageAlt: ${JSON.stringify(`${title}. ${descriptions[name]}`)}`);
    writeFileSync(source,article);
    console.log(`Generated ${slug}: artwork and social card`);
  }
} finally { await browser.close(); }
