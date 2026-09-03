import {get,HOST,SVC} from './probe.mjs';
const B=`https://${HOST}/arcgis/rest/services/${SVC.Principal}/MapServer/14/query`;
const r=await get(`${B}?where=${encodeURIComponent('OBJECTID IN (13406,13469,13520)')}&outSR=4283&outFields=OBJECTID,MAX_B_H,UNITS&returnGeometry=true&f=json`);
for(const f of (r.body?.features||[])){
  const ring=f.geometry.rings[0];
  let sx=0,sy=0; for(const p of ring){sx+=p[0];sy+=p[1];}
  const cx=sx/ring.length, cy=sy/ring.length;
  const d=0.00002, env=`${cx-d},${cy-d},${cx+d},${cy+d}`;
  const q1=await get(`${B}?geometry=${encodeURIComponent(env)}&geometryType=esriGeometryEnvelope&inSR=4283&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`);
  const q2=await get(`${B}?geometry=${encodeURIComponent(cx+','+cy)}&geometryType=esriGeometryPoint&inSR=4283&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`);
  console.log(`oid ${f.attributes.OBJECTID} ${f.attributes.MAX_B_H}${f.attributes.UNITS} centroid ${cx.toFixed(6)},${cy.toFixed(6)} | envelope-hit=${JSON.stringify(q1.body)} point-hit=${JSON.stringify(q2.body)}`);
}
