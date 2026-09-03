import fs from 'node:fs';
import {get,pool,HOST,SVC} from './probe.mjs';
import {LAY,CLAUSE,MBH,UNITS,FSRV} from './attrs.mjs';
const N=Number(process.argv[2]||2000), SEED=Number(process.argv[3]||20260903);
const OUT=process.argv[4]||'m3-results.json';
const CAD='https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8';
const MAXOID=4134385;
const VERT_LP=[422,771,485,509,429,430,469,572,573,763,420,512];
const FSR_LP=[423,772,773,484,470,508,532,1027,758,757];
// deterministic PRNG (mulberry32) -> reproducible sample
let s=SEED>>>0; const rnd=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const draw=new Set(); while(draw.size<Math.ceil(N*1.35)) draw.add(1+Math.floor(rnd()*MAXOID));
const oids=[...draw];
// 1. fetch centroids
const batches=[]; for(let i=0;i<oids.length;i+=180) batches.push(oids.slice(i,i+180));
console.error('centroid batches:',batches.length);
let parcels=[];
await pool(batches,6,async(b,i)=>{
  const u=`${CAD}/query?where=${encodeURIComponent('objectid IN ('+b.join(',')+')')}&outFields=objectid,lotidstring,cadid&returnCentroid=true&returnGeometry=false&outSR=4283&f=json`;
  const r=await get(u);
  for(const f of (r.body?.features||[])){
    const c=f.centroid; if(!c||typeof c.x!=='number') continue;
    parcels.push({oid:f.attributes.objectid,lot:f.attributes.lotidstring,cadid:f.attributes.cadid,x:c.x,y:c.y});
  }
  if(i%5===0) console.error(' batch',i,'parcels',parcels.length);
});
console.error('centroids resolved:',parcels.length);
parcels=parcels.slice(0,N);
fs.writeFileSync('m3-sample.json',JSON.stringify(parcels));
// 2. identify
const idUrl=(svc,layers,x,y)=>{
  const d=0.0004;
  const p=new URLSearchParams({geometry:`${x},${y}`,geometryType:'esriGeometryPoint',sr:'4283',
    layers:'all:'+layers.join(','),tolerance:'0',
    mapExtent:`${x-d},${y-d},${x+d},${y+d}`,imageDisplay:'400,400,96',returnGeometry:'false',f:'json'});
  return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${p}`;
};
let done=0;
const res=await pool(parcels,7,async(p)=>{
  const [pr,lp]=await Promise.all([get(idUrl('Principal',[14,11],p.x,p.y)),get(idUrl('LocalProvisions',[...VERT_LP,...FSR_LP],p.x,p.y))]);
  if(++done%100===0) console.error(' identify',done,'/',parcels.length);
  const hits=[...(pr.body?.results||[]),...(lp.body?.results||[])];
  const err=(!pr.body?.results&&!pr.body?.error)||(!lp.body?.results&&!lp.body?.error);
  const v=[],f=[];
  for(const h of hits){
    const a=h.attributes;
    const rec={layer:h.layerId,name:h.layerName,lay:LAY(a),clause:CLAUSE(a),units:UNITS(a),mbh:MBH(a),fsr:FSRV(a)};
    if(h.layerId===14||VERT_LP.includes(h.layerId)) v.push(rec);
    else if(h.layerId===11||FSR_LP.includes(h.layerId)) f.push(rec);
  }
  return {...p,vert:v,fsr:f,err};
});
fs.writeFileSync(OUT,JSON.stringify(res));
const dist=(arr)=>{const d={};for(const r of arr){const k=Math.min(r,4);d[k]=(d[k]||0)+1;}return d;};
const vd=dist(res.map(r=>r.vert.length)), fd=dist(res.map(r=>r.fsr.length));
console.log('\nN =',res.length,' errors:',res.filter(r=>r.err).length);
console.log('VERTICAL controls per parcel  (0/1/2/3/4+):',JSON.stringify(vd));
console.log('FLOORSPACE controls per parcel(0/1/2/3/4+):',JSON.stringify(fd));
console.log('parcels with >1 vertical  :',res.filter(r=>r.vert.length>1).length);
console.log('parcels with >1 floorspace:',res.filter(r=>r.fsr.length>1).length);
