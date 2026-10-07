import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const block = (children, style = {}) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const card = block([
  block([wordmark(), block('GRAINLIFT', { color: COLORS.sun700, fontSize: 18, letterSpacing: 3 })], { justifyContent: 'space-between', alignItems: 'center' }),
  block('Your Cloudflare data,', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 72, letterSpacing: -2, marginTop: 58 }),
  block('in DuckDB.', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 84, letterSpacing: -2, color: '#45632f', marginTop: -10 }),
  block(['Durable Objects', 'D1', 'Analytics Engine'].map(label => block(label, { fontSize: 25, backgroundColor: '#eee6d8', border: `1px solid ${COLORS.soil300}`, borderRadius: 8, padding: '14px 22px' })), { gap: 16, marginTop: 34 }),
  block([block('Try it in your browser, terminal, or Python.'), block('query.farm')], { justifyContent: 'space-between', fontSize: 21, color: COLORS.soil700, borderTop: `1px solid ${COLORS.soil300}`, paddingTop: 24, marginTop: 'auto' }),
], { width: WIDTH, height: HEIGHT, padding: '42px 48px', flexDirection: 'column', backgroundColor: COLORS.soilPaper, color: COLORS.soil900, fontFamily: 'Noto Sans' });

const directory = fileURLToPath(new URL('../public/media/posts/query-cloudflare-from-duckdb/', import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}social.png`, await renderToPng(card));
console.log('Generated Cloudflare blog social card (1200 × 630)');
