// Enumerate the REAL code vocabulary each publisher returns, so no classifier relies on a default
// branch. A default that silently maps an unknown code to `envelope` would over-credit exactly the
// way the withdrawn survey did.
const UA = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';
const _BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

async function j(url, ua = UA) {
    const res = await fetch(url, { headers: { 'user-agent': ua } });
    const t = await res.text();
    try { return { status: res.status, json: JSON.parse(t) }; }
    catch { return { status: res.status, raw: t.slice(0, 300) }; }
}

// ── MURCIA: distinct calificacion over the whole in-force layer ──
{
    const r = await j('https://geoserver.murcia.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature'
        + '&typeNames=Murcia:pgou_alineaciones&outputFormat=application/json&count=8000&propertyName=calificacion,f_fin');
    if (r.json) {
        const m = new Map();
        for (const f of r.json.features ?? []) {
            const ff = f.properties?.f_fin;
            if (ff && !String(ff).startsWith('2999') && new Date(ff) < new Date()) continue;
            const c = String(f.properties?.calificacion ?? '(null)');
            m.set(c, (m.get(c) ?? 0) + 1);
        }
        const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
        console.log(`MURCIA in-force calificacion codes (${sorted.length} distinct, ${r.json.features?.length} features read):`);
        console.log('  ' + sorted.map(([k, v]) => `${k}:${v}`).join('  '));
    } else console.log('MURCIA failed', r.status, r.raw);
}

// ── CÓRDOBA: axis-order control + the ordenanzas `link` vocabulary ──
{
    const lat = 37.8845, lon = -4.7790, d = 0.002;
    for (const [label, bbox] of Object.entries({
        'lat,lon': `${lat - d},${lon - d},${lat + d},${lon + d},EPSG:4326`,
        'lon,lat': `${lon - d},${lat - d},${lon + d},${lat + d},EPSG:4326`,
    })) {
        const r = await j('https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature'
            + `&typeNames=coaco:ordenanzas&outputFormat=application/json&count=5&bbox=${bbox}`);
        console.log(`CORDOBA bbox ${label}: status ${r.status} features ${r.json?.features?.length ?? r.raw}`);
    }
    const r2 = await j('https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature'
        + '&typeNames=coaco:ordenanzas&outputFormat=application/json&count=1000');
    if (r2.json) {
        const m = new Map();
        for (const f of r2.json.features ?? []) {
            const k = String(f.properties?.link ?? f.properties?.ordenanza ?? '(null)');
            m.set(k, (m.get(k) ?? 0) + 1);
        }
        console.log(`CORDOBA ordenanzas link vocabulary (${m.size} distinct over ${r2.json.features.length} features):`);
        console.log('  ' + [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
        console.log('  sample props:', JSON.stringify(r2.json.features[0]?.properties));
    } else console.log('CORDOBA vocab failed', r2.status, r2.raw);
}
