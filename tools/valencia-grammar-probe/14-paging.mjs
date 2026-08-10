// STEP 14 — PAGING CAPABILITY (national method finding, applied to this endpoint).
//
// The coordinator's Madrid probe proved that GeoServer's "Cannot do natural order without a
// primary key" error CONTINUES "...or specify a manual sort over existing attributes" — six
// passes had read only the first half and recorded "paging unsupported" as a hard blocker.
//
// Tested here for completeness of the corpus record. NOTE the outcome does not change M1/M2 for
// València: those were never paging-limited. A single GetFeature returns all 122,840 features
// and reconciles exactly against resultType=hits, so they are already CENSUSES. This step
// establishes whether paging is ALSO available as a fallback, and verifies pages are DISJOINT
// and COMPLETE the way the Madrid run did.
//
// ⚠ ENGINE NOTE: this endpoint is MapServer (msWFSGetFeature/msPostGISLayerWhichShapes in its
// error strings), not GeoServer. The sortBy remedy is a GeoServer behaviour; whether MapServer
// honours startindex/sortBy is the actual question, so it is measured rather than assumed.
import { BASE, get, owsException, countMembers, save } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';
const out = { engine: 'MapServer (per OWS exception strings)', tests: [] };

async function page({ version, start, count, sortBy }) {
    const tnParam = version === '2.0.0' ? 'typenames' : 'typename';
    const cParam = version === '2.0.0' ? 'count' : 'maxfeatures';
    let u = `${BASE}?service=WFS&version=${version}&request=GetFeature&${tnParam}=${encodeURIComponent(TN)}&${cParam}=${count}&propertyname=${encodeURIComponent('cod_ine_mun,zon_suelo')}`;
    if (start != null) u += `&startindex=${start}`;
    if (sortBy) u += `&sortBy=${encodeURIComponent(sortBy)}`;
    const r = await get(u, 180000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'ERROR', why: (exc || `HTTP ${r.http ?? r.err}`).slice(0, 200) };
    const ids = [...r.body.matchAll(/gml:id="([^"]+)"/g)].map((m) => m[1]);
    return { st: 'OK', n: countMembers(r.body), ids: ids.slice(0, 12) };
}

// hits oracle
const hr = await get(`${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN)}&resultType=hits`);
const total = Number((hr.body.match(/numberOfFeatures="(\d+)"/) || hr.body.match(/numberMatched="(\d+)"/) || [])[1]);
out.hitsOracle = total;
console.error(`hits oracle (exact, uncapped): ${total}`);

for (const version of ['1.1.0', '2.0.0']) {
    for (const sortBy of [null, 'id', 'id A', 'cod_ine_mun']) {
        const p0 = await page({ version, start: 0, count: 10, sortBy });
        const p1 = await page({ version, start: 10, count: 10, sortBy });
        let verdict = 'UNKNOWN';
        if (p0.st === 'ERROR' || p1.st === 'ERROR') verdict = 'ERROR';
        else if (!p0.ids?.length) verdict = 'NO-IDS';
        else {
            const overlap = p0.ids.filter((i) => p1.ids.includes(i)).length;
            verdict = overlap === 0 ? 'DISJOINT — paging works' : `OVERLAP ${overlap}/10 — startindex ignored`;
        }
        const rec = { version, sortBy: sortBy || '(none)', p0: p0.st === 'OK' ? p0.ids.slice(0, 3) : p0.why, p1: p1.st === 'OK' ? p1.ids.slice(0, 3) : p1.why, verdict };
        out.tests.push(rec);
        console.error(`  WFS ${version} sortBy=${String(sortBy || '(none)').padEnd(13)} ${verdict}`);
        if (p0.st === 'ERROR') console.error(`      err: ${p0.why}`);
    }
}

save('_14_paging.json', out);
console.error(`\nNOTE: M1/M2 for València did not depend on paging — the full ${total} features return in one request and reconcile against this same hits oracle.`);
