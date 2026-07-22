import { readFileSync } from 'node:fs';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
const src = readFileSync('packages/site-parcel-data/__tests__/insetPolygon.test.ts','utf8');
const start = src.indexOf('const BLOCK_02309');
const body = src.slice(start, src.indexOf('];', start));
const RING = [...body.matchAll(/\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g)].map(m=>({x:+m[1]!,z:+m[2]!}));
const ar=(r:any[])=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p.x*q.z-q.x*p.z;}return Math.abs(a)/2;};
const res = insetPolygonPerEdge(RING as any, RING.map(()=>'unclassified') as any, {front:12,side:12,rear:12,unclassified:12});
console.log(`  clamped code now: ${res.degenerate?'DEGENERATE':ar(res.polygon).toFixed(0)+' m² ('+((ar(res.polygon)/ar(RING))*100).toFixed(1)+'%)'}`);
