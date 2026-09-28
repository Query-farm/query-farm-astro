// Explicit generation; commit the resulting card with the page.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, fileDataUri, wordmark, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const block = (children, style = {}) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const card = block([
  block([wordmark(), block('DEVELOPER PREVIEW', { fontSize: 16, color: COLORS.sun700, letterSpacing: 2 })],
    { justifyContent: 'space-between', alignItems: 'center' }),
  block([
    block([
      block('GRAINLIFT', { fontSize: 20, letterSpacing: 4, color: COLORS.sun700, marginBottom: 20 }),
      block('Make your data', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 66, letterSpacing: -2, lineHeight: 1.05 }),
      block('a service.', { fontFamily: 'Petrona', fontWeight: 600, fontSize: 66, letterSpacing: -2, lineHeight: 1.05, color: '#365b35' }),
      block('Proxy databases. Build ADBC services.', { fontSize: 23, lineHeight: 1.5, maxWidth: 390, marginTop: 24, color: COLORS.soil700 }),
    ], { flexDirection: 'column', width: 500, flexShrink: 0, justifyContent: 'center' }),
    { type: 'img', props: { src: fileDataUri(`${root}public/grainlift/grainlift-data-elevator.png`), width: 600, height: 400, style: { objectFit: 'contain', marginLeft: -32 } } },
  ], { alignItems: 'center', flex: 1 }),
  block([block('Rust · Go · Python · TypeScript'), block('query.farm/products/grainlift')],
    { justifyContent: 'space-between', borderTop: `1px solid ${COLORS.soil300}`, paddingTop: 20, fontSize: 17, color: COLORS.soil700 }),
], { width: WIDTH, height: HEIGHT, padding: '40px 48px', flexDirection: 'column', backgroundColor: COLORS.soilPaper, color: COLORS.soil900, fontFamily: 'Noto Sans', fontWeight: 400 });

writeFileSync(`${root}public/grainlift/grainlift-social.png`, await renderToPng(card));
console.log('Generated public/grainlift/grainlift-social.png (1200×630)');
