// Smoke test: prove each live service ANSWERS with the query shape the audit issues, at a point we
// know is inside the city. A probe that returns 0 features everywhere because of ITS OWN url bug is
// the "empty ≠ failure" trap in reverse — so this runs first, and its output is recorded.
import { politeGet } from '../city-completion/parcelSampleProbe.mjs';

const esriPoint = (lon, lat) => encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
async function esri(base, lon, lat, outFields, where) {
    const url = `${base}?geometry=${esriPoint(lon, lat)}&geometryType=esriGeometryPoint&inSR=4326`
        + `&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}`
        + (where ? `&where=${encodeURIComponent(where)}` : '&where=1%3D1')
        + `&returnGeometry=false&outSR=4326&f=json`;
    const r = await politeGet(url, { accept: 'application/json' });
    return { outcome: r.outcome, status: r.status, body: (r.body ?? '').slice(0, 500) };
}
async function wfs(endpoint, typeName, lon, lat, half = 0.00008) {
    const bbox = `${(lat - half).toFixed(7)},${(lon - half).toFixed(7)},${(lat + half).toFixed(7)},${(lon + half).toFixed(7)},urn:ogc:def:crs:EPSG::4326`;
    const url = `${endpoint}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}`
        + `&bbox=${encodeURIComponent(bbox)}&srsName=EPSG:4326&outputFormat=${encodeURIComponent('application/json')}&count=5`;
    const r = await politeGet(url, { accept: 'application/json' });
    return { outcome: r.outcome, status: r.status, body: (r.body ?? '').slice(0, 700) };
}

console.log('BCN QU_Trames @ Eixample 2.163,41.390');
console.log(JSON.stringify(await esri('https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/16/query', 2.163, 41.390, 'CLAU_URB,CODI_INE', "CODI_INE='08019'")));
console.log('\nBCN OV_Trames @ same');
console.log(JSON.stringify(await esri('https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/17/query', 2.163, 41.390, 'CLAU,PLANTES,EXP', "CODI_INE='08019'")));
console.log('\nMAD NORMAS_ZONALES @ Salamanca -3.683,40.428');
console.log(JSON.stringify(await esri('https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query', -3.683, 40.428, 'AMB_TX_ETIQ,OBJECTID', null)));
console.log('\nMUR pgou_alineaciones @ -1.1300,37.9860');
console.log(JSON.stringify(await wfs('https://geoserver.murcia.es/geoserver/wfs', 'Murcia:pgou_alineaciones', -1.1300, 37.9860)));
console.log('\nVLC 231 @ -0.3763,39.4699');
console.log(JSON.stringify(await esri('https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query', -0.3763, 39.4699, 'califi,tipoca,origen,clase', null)));
console.log('\nCOR coaco:ordenanzas @ -4.7794,37.8882');
console.log(JSON.stringify(await wfs('https://geoserver.pgou.coacordoba.org/geoserver/wfs', 'coaco:ordenanzas', -4.7794, 37.8882)));
