// §NSW-FIXTURES — capture the FULL attribute bags for the acceptance-fixture parcels.
// The M3 transcripts hold a reduced projection (layer/clause/units/value); a fixture built from a
// projection cannot falsify the reader that produced the projection (§FAKE-MORE-CAPABLE-THAN-REAL).
// This pulls the raw `identify` bags, keyed by ALIAS exactly as the service returns them.
import fs from 'node:fs';
import { get, pool, HOST, SVC } from './probe.mjs';

const VERT_LP = [422,771,485,509,429,430,469,572,573,763,420,512];
const PARCELS = [
  { id:'152//DP877246',  x:153.53331980317822, y:-28.86006723095055,  why:'HOB 8.5 m + Building Height Allowance 2.1 — the min() trap' },
  { id:'5//DP240402',    x:151.19913072882292, y:-33.8984423075379,   why:'HOB 12 m + Alternative HOB 25 m — the conditional-uplift trap' },
  { id:'2//DP782292',    x:151.0021951044376,  y:-33.83297336940104,  why:'HOB 31 m + Incentive HOB 36' },
  { id:'54//DP1259000',  x:151.21091413732495, y:-33.86284388257842,  why:'HOB 110 m + Sun Access Protection, clause SERVED' },
  { id:'291//DP1287257', x:151.0116094124515,  y:-33.81646615441397,  why:'HOB 24 m + Sun Access Protection, clause ABSENT (same layer)' },
  { id:'101//DP1265976', x:null, y:null,                              why:'the ONE m(RL) parcel in n=2000 — absolute AHD' },
];

// Resolve the m(RL) parcel centroid from the cadastre by lot id.
const CAD='https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8';
const missing = PARCELS.filter(p=>p.x===null);
for (const p of missing) {
  const u=`${CAD}/query?where=${encodeURIComponent(`lotidstring='${p.id}'`)}&outFields=objectid,lotidstring&returnCentroid=true&returnGeometry=false&outSR=4283&f=json`;
  const r=await get(u);
  const f=r.body?.features?.[0];
  if (f?.centroid) { p.x=f.centroid.x; p.y=f.centroid.y; }
  else console.error('!! centroid unresolved for', p.id, JSON.stringify(r.body)?.slice(0,200));
}

const idUrl=(svc,layers,x,y)=>{
  const d=0.0004;
  const q=new URLSearchParams({geometry:`${x},${y}`,geometryType:'esriGeometryPoint',sr:'4283',
    layers:'all:'+layers.join(','),tolerance:'0',
    mapExtent:`${x-d},${y-d},${x+d},${y+d}`,imageDisplay:'400,400,96',returnGeometry:'false',f:'json'});
  return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${q}`;
};

const out = await pool(PARCELS.filter(p=>p.x!==null),4,async(p)=>{
  const [pr,lp]=await Promise.all([
    get(idUrl('Principal',[14,11],p.x,p.y)),
    get(idUrl('LocalProvisions',VERT_LP,p.x,p.y)),
  ]);
  const hits=[...(pr.body?.results||[]),...(lp.body?.results||[])]
    .map(h=>({layerId:h.layerId,layerName:h.layerName,attributes:h.attributes}));
  return { parcel:p.id, why:p.why, lon:p.x, lat:p.y, hits };
});

// The three single-council overlay layers, by direct /query — no parcel needed.
const layerRows = {};
for (const [lid,label] of [[430,'Building Height Plane (BURWOOD)'],[573,'Sun Plane Protection (WOLLONGONG)'],[469,'Floor Height Restriction (SINGLETON)']]) {
  const u=`https://${HOST}/arcgis/rest/services/${SVC.LocalProvisions}/MapServer/${lid}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`;
  const r=await get(u);
  layerRows[lid]={ label, count:r.body?.features?.length ?? null, features:(r.body?.features||[]).map(f=>f.attributes) };
  console.error(label,'->',layerRows[lid].count,'features');
}

fs.writeFileSync('../fixtures-raw.json', JSON.stringify({ capturedAt:new Date().toISOString().slice(0,10), parcels:out, layers:layerRows }, null, 1));
for (const r of out) console.log(r.parcel, '->', r.hits.length, 'hits:', r.hits.map(h=>h.layerId).join(','));
