// §ANDALUCIA-ENVELOPE-MAX / step 8 — MÁLAGA GeoServer. sig.malaga.eu ROOT fails DNS but
// /geoserver/wfs answers 200 with a capabilities doc. ⭐ A dead host list is not an answer:
// the root being dead says nothing about the service path.
import { get } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://sig.malaga.eu/geoserver/wfs';
const out = { measuredAt: new Date().toISOString(), service: GS };

const caps = await get(`${GS}?service=WFS&version=2.0.0&request=GetCapabilities`, { timeout: 90000 });
out.capsStatus = caps.status; out.capsBytes = caps.bytes;
const types = [...caps.body.matchAll(/<FeatureType[^>]*>([\s\S]*?)<\/FeatureType>/g)].map(m => ({
    name: (m[1].match(/<Name>([^<]+)<\/Name>/) || [])[1],
    title: (m[1].match(/<Title>([\s\S]*?)<\/Title>/) || [])[1]?.replace(/\s+/g, ' ').trim(),
    abstract: (m[1].match(/<Abstract>([\s\S]*?)<\/Abstract>/) || [])[1]?.replace(/\s+/g, ' ').trim()?.slice(0, 160),
    crs: (m[1].match(/<DefaultCRS>([^<]+)<\/DefaultCRS>/) || [])[1],
}));
out.featureTypes = types;
console.log(`GetCapabilities HTTP ${caps.status} ${caps.bytes}B — ${types.length} feature types`);
for (const t of types) console.log(`  ${String(t.name).padEnd(46)} ${t.title ?? ''}`);

// Also the WMS list — WMS often exposes layers WFS does not.
const wms = await get('https://sig.malaga.eu/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities', { timeout: 90000 });
out.wmsStatus = wms.status;
out.wmsLayers = [...wms.body.matchAll(/<Layer[^>]*queryable[^>]*>[\s\S]{0,400}?<Name>([^<]+)<\/Name>\s*<Title>([\s\S]*?)<\/Title>/g)]
    .map(m => ({ name: m[1], title: m[2].replace(/\s+/g, ' ').trim() }));
console.log(`\nWMS HTTP ${wms.status} — ${out.wmsLayers.length} queryable layers`);
for (const l of out.wmsLayers.slice(0, 120)) console.log(`  ${l.name.padEnd(46)} ${l.title}`);

writeFileSync(new URL('./out/08-malaga-geoserver.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/08-malaga-geoserver.json');
