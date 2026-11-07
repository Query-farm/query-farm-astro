// Shared paper-collage kit for the Haybarn 2.0 artwork: the palette, the SVG
// filters that give shapes their torn edges, grain and shadow, a seeded
// jitter, and a Chromium renderer that writes the .svg and a 2x .png master.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const C = {
  bg: '#efe9dc',
  ochre: '#d4a03c',
  sage: '#a6ae8e',
  moss: '#566b45',
  terra: '#c1603b',
  umber: '#6e4a2c',
  cream: '#e6d9bd',
  ink: '#3a2a1c',
};

export const defs = `
<filter id="paper" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="cut"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="9" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 -1.6 0.82" result="speck"/>
  <feComposite in="speck" in2="cut" operator="in" result="speckIn"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="21" result="blot"/>
  <feColorMatrix in="blot" type="matrix" values="0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.9  0 0 0 -0.9 0.55" result="light"/>
  <feComposite in="light" in2="cut" operator="in" result="lightIn"/>
  <feMerge result="tex"><feMergeNode in="cut"/><feMergeNode in="lightIn"/><feMergeNode in="speckIn"/></feMerge>
  <feGaussianBlur in="cut" stdDeviation="2.2" result="sb"/>
  <feOffset in="sb" dx="1.5" dy="2.5" result="so"/>
  <feColorMatrix in="so" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.14  0 0 0 0 0.08  0 0 0 0.28 0" result="shadow"/>
  <feMerge><feMergeNode in="shadow"/><feMergeNode in="tex"/></feMerge>
</filter>
<filter id="fibre" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.003 0.22" numOctaves="2" seed="5" result="streak"/>
  <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 -2.4 1.18" result="lines"/>
  <feComposite in="lines" in2="SourceGraphic" operator="in" result="linesIn"/>
  <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="linesIn"/></feMerge>
</filter>
<filter id="ground" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="2" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 -1.1 0.62"/>
</filter>`;

// A canvas collects paper pieces in draw order. `j(n)` is a seeded ±n jitter
// so each piece looks hand-cut but regenerates identically.
export function canvas(seed = 11) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  return {
    out,
    rnd,
    j: (n) => (rnd() - 0.5) * 2 * n,
    raw: (svg) => out.push(svg),
    paper: (inner, fibre = false) =>
      out.push(`<g filter="url(#paper)">${fibre ? `<g filter="url(#fibre)">${inner}</g>` : inner}</g>`),
  };
}

export const svgDoc = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect width="${W}" height="${H}" filter="url(#ground)" opacity="0.5"/>
${body}
</svg>`;

export async function render(pieces) {
  const dir = new URL('./', import.meta.url);
  const browser = await chromium.launch();
  for (const { name, W, H, svg } of pieces) {
    writeFileSync(new URL(`${name}.svg`, dir), svg);
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: new URL(`${name}.png`, dir).pathname, clip: { x: 0, y: 0, width: W, height: H } });
    await page.close();
    console.log(`wrote design/haybarn-2-0/${name}.{svg,png} (${W * 2} × ${H * 2})`);
  }
  await browser.close();
}
