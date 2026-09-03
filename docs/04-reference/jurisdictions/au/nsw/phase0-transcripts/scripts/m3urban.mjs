import fs from 'node:fs';
import {get,pool,HOST,SVC} from './probe.mjs';
import {LAY,CLAUSE,MBH,UNITS,FSRV} from './attrs.mjs';
const CAD='https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8';
const VERT_LP=[422,771,485,509,429,430,469,572,573,763,420,512];
const FSR_LP=[423,772,773,484,470,508,532,1027,758,757];
const CENTRES=[
 ['Sydney CBD',151.2000,-33.8800,151.2160,-33.8600],
 ['North Sydney',151.2000,-33.8460,151.2140,-33.8340],
 ['Parramatta',151.0000,-33.8220,151.0180,-33.8080],
 ['Wollongong',150.8850,-34.4320,150.9020,-34.4150],
 ['Newcastle',151.7600,-32.9350,151.7850,-32.9180],
 ['Burwood',151.1000,-33.8830,151.1130,-33.8720],
 ['Randwick',151.2380,-33.9200,151.2520,-33.9080],
 ['Chatswood',151.1770,-33.7990,151.1880,-33.7900],
 ['Macquarie Park',151.1180,-33.7830,151.1340,-33.7720],
 ['Singleton',151.1650,-32.5720,151.1830,-32.5600],
];
let parcels=[];
for(const [name,x1,y1,x2,y2] of CENTRES){
  const u=`${CAD}/query?geometry=${encodeURIComponent(`${x1},${y1},${x2},${y2}`)}&geometryType=esriGeometryEnvelope&inSR=4283&outSR=4283&spatialRel=esriSpatialRelIntersects&outFields=objectid,lotidstring&returnCentroid=true&returnGeometry=false&resultRecordCount=400&f=json`;
  const r=await get(u);
  const fsr=(r.body?.features||[]).filter(f=>f.centroid&&typeof f.centroid.x==='number');
  // even spread: take every k-th
  const k=Math.max(1,Math.floor(fsr.length/60));
  const pick=fsr.filter((_,i)=>i%k===0).slice(0,60);
  for(const f of pick) parcels.push({centre:name,lot:f.attributes.lotidstring,x:f.centroid.x,y:f.centroid.y});
  console.error(name,'available',fsr.length,'picked',pick.length);
}
console.error('urban parcels:',parcels.length);
const idUrl=(svc,layers,x,y)=>{const d=0.0004;
  const p=new URLSearchParams({geometry:`${x},${y}`,geometryType:'esriGeometryPoint',sr:'4283',
    layers:'all:'+layers.join(','),tolerance:'0',mapExtent:`${x-d},${y-d},${x+d},${y+d}`,
    imageDisplay:'400,400,96',returnGeometry:'false',f:'json'});
  return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${p}`;};
let done=0;
const res=await pool(parcels,7,async(p)=>{
  const [pr,lp]=await Promise.all([get(idUrl('Principal',[14,11],p.x,p.y)),get(idUrl('LocalProvisions',[...VERT_LP,...FSR_LP],p.x,p.y))]);
  if(++done%100===0) console.error(' id',done,'/',parcels.length);
  const hits=[...(pr.body?.results||[]),...(lp.body?.results||[])];
  const v=[],f=[];
  for(const h of hits){const a=h.attributes;
    const rec={layer:h.layerId,name:h.layerName,lay:LAY(a),clause:CLAUSE(a),units:UNITS(a),mbh:MBH(a),fsr:FSRV(a)};
    if(h.layerId===14||VERT_LP.includes(h.layerId)) v.push(rec); else if(h.layerId===11||FSR_LP.includes(h.layerId)) f.push(rec);}
  return {...p,vert:v,fsr:f};
});
fs.writeFileSync('m3-urban.json',JSON.stringify(res));
const dist=a=>{const d={};for(const n of a){const k=Math.min(n,4);d[k]=(d[k]||0)+1;}return d;};
console.log('\nURBAN N =',res.length);
console.log('VERTICAL   (0/1/2/3/4+):',JSON.stringify(dist(res.map(r=>r.vert.length))));
console.log('FLOORSPACE (0/1/2/3/4+):',JSON.stringify(dist(res.map(r=>r.fsr.length))));
console.log('>1 vertical:',res.filter(r=>r.vert.length>1).length,' >1 floorspace:',res.filter(r=>r.fsr.length>1).length);
const byC={}; for(const r of res){byC[r.centre]??={n:0,multi:0,none:0}; byC[r.centre].n++; if(r.vert.length>1)byC[r.centre].multi++; if(r.vert.length===0)byC[r.centre].none++;}
console.log('per centre (n / >1 vert / 0 vert):'); for(const c of Object.keys(byC)) console.log('  ',c.padEnd(16),byC[c].n,byC[c].multi,byC[c].none);
const u={}; for(const r of res) for(const v of r.vert) if(v.layer===14) u[String(v.units)]=(u[String(v.units)]||0)+1;
console.log('HOB UNITS:',JSON.stringify(u));
