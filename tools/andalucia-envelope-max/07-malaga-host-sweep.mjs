// §ANDALUCIA-ENVELOPE-MAX / step 7 — MÁLAGA + JUNTA host sweep.
// ⭐ A DEAD HOST LIST IS NOT AN ANSWER. This sweep exists only to find a LIVE VIEWER whose JS we
// can then read for the real service URL (Madrid's working endpoint came out of a Config.js after
// nine hosts 404'd). Anything that returns HTML is followed up by an asset crawl in step 8.
import { get } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const CANDIDATES = [
    // Málaga municipal
    'https://urbanismo.malaga.eu/',
    'https://www.malaga.eu/',
    'https://sig.malaga.eu/',
    'https://gis.malaga.eu/',
    'https://geoportal.malaga.eu/',
    'https://urbanismo.malaga.eu/opencms/export/sites/urbanismo/',
    'https://pgou.malaga.eu/',
    'https://visorpgou.malaga.eu/',
    'https://sig.malaga.eu/arcgis/rest/services?f=json',
    'https://gis.malaga.eu/arcgis/rest/services?f=json',
    'https://urbanismo.malaga.eu/arcgis/rest/services?f=json',
    'https://www.malaga.eu/arcgis/rest/services?f=json',
    'https://sig.malaga.eu/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
    'https://idemalaga.malaga.eu/',
    'https://idem.malaga.eu/',
    'https://opendata.malaga.eu/',
    'https://datosabiertos.malaga.eu/',
    // Junta de Andalucía / IDE Andalucía
    'https://www.ideandalucia.es/',
    'https://www.ideandalucia.es/services/',
    'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/',
    'https://portalrediam.cica.es/',
    'https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_urbanismo?service=WMS&request=GetCapabilities',
    'https://ws041.juntadeandalucia.es/',
    'https://ws054.juntadeandalucia.es/',
    'https://www.juntadeandalucia.es/organismos/fomentoarticulaciondelterritorioyvivienda.html',
    'https://sigc.juntadeandalucia.es/',
    'https://situa.juntadeandalucia.es/',
    'https://www.situa.es/',
    // Córdoba municipal (besides COACo)
    'https://gmu.cordoba.es/',
    'https://www.gmucordoba.es/',
    'https://urbanismo.cordoba.es/',
    'https://sig.cordoba.es/',
    'https://visor.pgou.coacordoba.org/',
];

const out = { measuredAt: new Date().toISOString(), hosts: [] };
for (const u of CANDIDATES) {
    const r = await get(u, { timeout: 25000 });
    const isHtml = /text\/html/i.test(r.ct);
    const title = (r.body.match(/<title[^>]*>([\s\S]{0,140}?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() ?? null;
    const looksLikeError = /server under constr|404|not found|no encontrad|error/i.test(String(title));
    const rec = {
        url: u, status: r.status, ct: r.ct, bytes: r.bytes, finalUrl: r.url, title,
        err: r.err ?? null,
        verdict: r.status === 0 ? `DNS/timeout: ${r.err}` : !r.ok ? `HTTP ${r.status}` : looksLikeError ? `HTTP 200 but ERROR PAGE: "${title}"` : 'LIVE',
    };
    if (r.ok && /json/i.test(r.ct)) rec.jsonHead = r.body.slice(0, 400);
    if (r.ok && /xml/i.test(r.ct)) rec.layerNames = [...r.body.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]).slice(0, 60);
    if (r.ok && isHtml) rec.scripts = [...r.body.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]).slice(0, 40);
    out.hosts.push(rec);
    console.log(`${rec.verdict.padEnd(34)} ${u}${title ? '  ‹' + title.slice(0, 70) + '›' : ''}`);
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/07-malaga-host-sweep.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/07-malaga-host-sweep.json');
