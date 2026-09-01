import { readFileSync, writeFileSync } from 'node:fs';
const parcels = JSON.parse(readFileSync('./lt-parcels.json','utf8'));
const OUT = {};
for (const f of parcels.features) {
  const kad = f.attributes.kadastro_nr;
  const geom = { rings: f.geometry.rings, spatialReference: { wkid: 3346 } };
  const body = new URLSearchParams({
    geometry: JSON.stringify(geom),
    geometryType: 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '3346', outSR: '3346',
    outFields: '*', returnGeometry: 'false', f: 'json',
  });
  const res = await fetch('https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer/0/query', {
    method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body,
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0,400) }; }
  OUT[kad] = j;
  console.log('=====', kad, 'HTTP', res.status, 'features', (j.features||[]).length);
  for (const feat of j.features||[]) console.log(JSON.stringify(feat.attributes));
}
writeFileSync('./lt-asgr-at-parcels.json', JSON.stringify(OUT,null,2));
