import sharp from 'sharp';
import { resolve } from 'node:path';
for(const speed of [1,1.5,2]){
 const text=speed===1?'EDITED CAPTURE · ORIGINAL SPEED':`EDITED CAPTURE · ${speed}× SPEED`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="54"><rect width="400" height="54" fill="#121212"/><text x="15" y="33" fill="#dddddd" font-family="Arial,sans-serif" font-size="16">${text}</text></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(resolve('.cache/vgi-live-capture',`speed-${speed}.png`));
}
