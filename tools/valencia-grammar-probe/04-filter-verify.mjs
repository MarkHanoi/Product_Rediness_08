// STEP 4 — FIND A FILTER THAT IS PROVABLY APPLIED.
//
// ⛔ WHY THIS STEP EXISTS. Step 3's NEGATIVE control fired: CQL_FILTER is ACCEPTED (HTTP 200, no
// OWS exception) but NOT APPLIED. `resultType=hits` returned the identical 122840 for València,
// for Tollos, and for Madrid — that is the whole-layer total. MapServer does not implement
// CQL_FILTER (that is a GeoServer extension); it silently ignores the parameter.
//
// ⇒ A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER. From here on a filter mechanism is accepted
//   ONLY if BOTH hold:
//     (1) every returned feature actually carries the requested value  (positive verification)
//     (2) a value known to be outside the region returns ZERO          (negative control)
//   Mechanism (1) alone would have passed CQL through as working.
import { BASE, get, owsException, countMembers, parseFeatures, save } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';

const ogc = (inner) => `<Filter>${inner}</Filter>`;
const eq = (prop, lit) => `<PropertyIsEqualTo><PropertyName>${prop}</PropertyName><Literal>${lit}</Literal></PropertyIsEqualTo>`;

function url(filterXml, count = 50) {
    let u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN)}&maxfeatures=${count}`;
    if (filterXml) u += `&filter=${encodeURIComponent(filterXml)}`;
    return u;
}

/** Fetch and VERIFY: report the distinct values actually returned for the filtered field. */
async function probe(tag, filterXml, field, expectValue) {
    const r = await get(url(filterXml), 180000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { tag, st: 'ERROR', why: (exc || `HTTP ${r.http ?? r.err}`).slice(0, 120) };
    const feats = parseFeatures(r.body);
    const n = countMembers(r.body);
    const distinct = [...new Set(feats.map((f) => f[field]))];
    const applied = feats.length > 0 && distinct.length === 1 && distinct[0] === expectValue;
    return {
        tag,
        st: 'OK',
        n,
        parsed: feats.length,
        distinctReturned: distinct.slice(0, 6),
        filterApplied: feats.length === 0 ? 'ZERO' : applied ? 'YES' : 'NO — values leak',
    };
}

const results = [];
const R = async (...a) => {
    const x = await probe(...a);
    results.push(x);
    console.error(
        `${String(x.st).padEnd(5)} ${x.tag.padEnd(38)} n=${String(x.n ?? '-').padEnd(5)} applied=${x.filterApplied ?? '-'} ${x.why || ''} ${x.distinctReturned ? JSON.stringify(x.distinctReturned).slice(0, 90) : ''}`
    );
    return x;
};

// --- BASELINE: no filter. Establishes what "unfiltered" looks like.
await R('BASELINE no filter', null, 'noms_mun', '__none__');

// --- noms_mun (the OGC form that did not error in step 02)
await R('OGC noms_mun=València (positive)', ogc(eq('noms_mun', 'València')), 'noms_mun', 'València');
await R('OGC noms_mun=Tollos (positive)', ogc(eq('noms_mun', 'Tollos')), 'noms_mun', 'Tollos');
await R('OGC noms_mun=Madrid (NEGATIVE)', ogc(eq('noms_mun', 'Madrid')), 'noms_mun', 'Madrid');
await R('OGC noms_mun=ZZZNOTREAL (NEGATIVE)', ogc(eq('noms_mun', 'ZZZNOTREAL')), 'noms_mun', 'ZZZNOTREAL');

// --- cod_ine_mun via other operators (equality errored server-side)
await R(
    'OGC cod_ine_mun LIKE 46250',
    ogc(`<PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>cod_ine_mun</PropertyName><Literal>46250</Literal></PropertyIsLike>`),
    'cod_ine_mun',
    '46250'
);
await R(
    'OGC cod_ine_mun LIKE 99999 (NEGATIVE)',
    ogc(`<PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>cod_ine_mun</PropertyName><Literal>99999</Literal></PropertyIsLike>`),
    'cod_ine_mun',
    '99999'
);

// --- zon_suelo (the field M2 actually needs to group by)
await R('OGC zon_suelo LIKE ZRP-NA-MU', ogc(`<PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>zon_suelo</PropertyName><Literal>ZRP-NA-MU</Literal></PropertyIsLike>`), 'zon_suelo', 'ZRP-NA-MU');
await R('OGC zon_suelo LIKE ZZZNOT (NEGATIVE)', ogc(`<PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>zon_suelo</PropertyName><Literal>ZZZNOT</Literal></PropertyIsLike>`), 'zon_suelo', 'ZZZNOT');

save('_04_filter_verify.json', results);

const good = results.filter((r) => r.filterApplied === 'YES').map((r) => r.tag);
const negOk = results.filter((r) => /NEGATIVE/.test(r.tag) && r.filterApplied === 'ZERO').map((r) => r.tag);
console.error(`\nPOSITIVE-VERIFIED: ${good.join(' | ') || '(none)'}`);
console.error(`NEGATIVE-CLEAN:    ${negOk.join(' | ') || '(none)'}`);
