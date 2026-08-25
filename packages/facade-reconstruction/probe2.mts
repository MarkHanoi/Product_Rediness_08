import { caseA } from './src/testing/syntheticFacades.js';
import { toGray } from './src/contracts/RasterImage.js';
import { blur, sobel, cannyEdges, percentile } from './src/reconstruction/preprocess/filters.js';
import { houghLines } from './src/reconstruction/facadePlane/hough.js';
import { resolveOptions } from './src/contracts/Options.js';

const opts = resolveOptions();
const c = caseA();
const g = toGray(c.image);
const b = blur(g, opts.blurSigma);
const s = sobel(b);
console.log('mag p50', percentile(s.magnitude, 0.5).toFixed(1), 'p90', percentile(s.magnitude, 0.9).toFixed(1), 'max', percentile(s.magnitude, 1).toFixed(1));
const { edges, highThreshold } = cannyEdges(s, opts.edgeHighPercentile, opts.edgeLowRatio);
console.log('highThreshold', highThreshold.toFixed(1));
let count=0; for (let i=0;i<edges.data.length;i++) if (edges.data[i]! > 128) count++;
console.log('edge pixels', count);
// count edge pixels on row 30 (wall top) and row 45 (window top)
const rowCount = (y:number)=>{let n=0;for(let x=0;x<edges.width;x++) if(edges.data[y*edges.width+x]!>128) n++; return n;};
const colCount = (x:number)=>{let n=0;for(let y=0;y<edges.height;y++) if(edges.data[y*edges.width+x]!>128) n++; return n;};
for (const y of [29,30,31,44,45,46,329,330,331]) console.log('row',y,'edge px',rowCount(y));
for (const x of [39,40,41,55,56,57,439,440]) console.log('col',x,'edge px',colCount(x));
const lines = houghLines(edges, opts);
console.log('top 14 lines:');
for (const l of lines.slice(0,14)) console.log(`  votes=${l.votes} theta=${(l.theta*180/Math.PI).toFixed(1)} rho=${l.rho} fam=${l.family}`);
