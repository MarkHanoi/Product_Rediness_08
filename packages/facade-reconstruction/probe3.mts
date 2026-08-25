import { caseA } from './src/testing/syntheticFacades.js';
import { toGray } from './src/contracts/RasterImage.js';
import { blur, sobel, percentile } from './src/reconstruction/preprocess/filters.js';
const c = caseA();
const g = toGray(c.image);
const b = blur(g, 1.2);
const s = sobel(b);
for (const p of [0.5,0.7,0.75,0.8,0.85,0.88,0.9,0.95]) console.log('p'+p, percentile(s.magnitude,p).toFixed(1));
// magnitude at the wall outline
const idx=(x:number,y:number)=>y*g.width+x;
console.log('wall top (240,30):', s.magnitude[idx(240,30)]!.toFixed(1));
console.log('wall left (40,180):', s.magnitude[idx(40,180)]!.toFixed(1));
console.log('window top (240,45):', s.magnitude[idx(216,45)]!.toFixed(1));
