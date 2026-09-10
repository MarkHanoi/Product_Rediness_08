// TEMP probe (lane C9) — same A/B for BUILDINGS, the layer the reveal gate actually waits on.
import { coalesceRanges } from '../apps/editor/src/ui/geospatial/contextTiles';
const U = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/buildings.pmtiles?v=L663a';
const R = [
    [22593281279,396030],[22593937201,9407],[22594374686,58078],[22593075275,45186],[22593166434,25569],
    [22593837010,14465],[22592429874,6218],[22593925936,11265],[22593644767,62891],[22593120461,45973],
    [22593759139,27903],[22593851475,74461],[22593875885,20887],[22593656597,102542],[22593055905,19370],
    [22593787042,49968],[22592494383,19940],[22592514323,10706],[22593053258,2647],[22592525029,45125],
    [22592436092,58291],[22592402365,57215],[22592570154,4664],[22592459580,79885],
].map(([o,l]) => ({ offset:o!, length:l! }));
const WAVES = [[0,1,2],[4,8,7,9,13,11],[3,10,12,5,15,14],[6,18,20],[16,21,22,17,23,19]];
async function get(o:number,l:number){ const r=await fetch(`${U}&r=${o}-${l}`,{headers:{range:`bytes=${o}-${o+l-1}`}}); return (await r.arrayBuffer()).byteLength; }
async function timed(n:string,f:()=>Promise<number>){ const t=Date.now(); const b=await f(); console.log(`${n.padEnd(46)} ${String(Date.now()-t).padStart(6)} ms  ${(b/1024).toFixed(0).padStart(6)} KiB`); }
const s64=coalesceRanges(R), lo=Math.min(...R.map(x=>x.offset)), hi=Math.max(...R.map(x=>x.offset+x.length));
for(let p=1;p<=2;p++){
  console.log(`--- pass ${p} ---`);
  await timed('A  SHIPPED: 24 ranges in 5 observed waves', async()=>{let b=0;for(const w of WAVES)b+=(await Promise.all(w.map(i=>get(R[i]!.offset,R[i]!.length)))).reduce((x,y)=>x+y,0);return b;});
  await timed(`B  ONE WINDOW, gap 64K: ${s64.length} spans parallel`, async()=>(await Promise.all(s64.map(s=>get(s.offset,s.length)))).reduce((x,y)=>x+y,0));
  await timed(`D  ONE REQUEST whole extent (${((hi-lo)/1024).toFixed(0)} KiB)`, async()=>get(lo,hi-lo));
}
