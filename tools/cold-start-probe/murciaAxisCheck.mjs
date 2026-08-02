// Murcia WFS axis-order control. An empty result must survive alternate axis orders
// (Córdoba's `manzana` returned 0 features from exactly this artefact).
const lat = 37.9861, lon = -1.1303; // Murcia, Plaza Circular area — unambiguously urban
const d = 0.0004;
const variants = {
    'bbox lat,lon + EPSG:4326': `${lat - d},${lon - d},${lat + d},${lon + d},EPSG:4326`,
    'bbox lon,lat + EPSG:4326': `${lon - d},${lat - d},${lon + d},${lat + d},EPSG:4326`,
    'bbox lon,lat + CRS84': `${lon - d},${lat - d},${lon + d},${lat + d},urn:ogc:def:crs:OGC:1.3:CRS84`,
    'bbox lat,lon + urn4326': `${lat - d},${lon - d},${lat + d},${lon + d},urn:ogc:def:crs:EPSG::4326`,
};
for (const [label, bbox] of Object.entries(variants)) {
    const url = 'https://geoserver.murcia.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature'
        + '&typeNames=Murcia:pgou_alineaciones&count=3&outputFormat=application/json'
        + `&bbox=${bbox}`;
    try {
        const res = await fetch(url, { headers: { 'user-agent': 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)' } });
        const t = await res.text();
        let n = 'n/a', cal = '';
        try {
            const j = JSON.parse(t);
            n = (j.features ?? []).length;
            cal = (j.features ?? []).map((f) => `${f.properties?.calificacion}(f_fin=${f.properties?.f_fin})`).join(' ');
        } catch { n = `non-JSON ${t.slice(0, 120).replace(/\s+/g, ' ')}`; }
        console.log(`${res.status}  ${label.padEnd(28)} → ${n}  ${cal}`);
    } catch (e) { console.log(`ERR ${label}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 300));
}
