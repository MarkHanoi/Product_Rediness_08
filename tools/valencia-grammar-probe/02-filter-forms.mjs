// STEP 2 — FILTER-FORM SWEEP.
//
// Step 1's attribute filter failed server-side (msPostGISLayerWhichShapes: Query error) for EVERY
// municipality including the known-positive. Per §"UNKNOWN never NO" that is a TRANSPORT defect,
// not evidence of absence, and must be resolved before any count is reported.
//
// Sweeps filter encodings x protocol versions to find a working attribute-scoping mechanism.
import { BASE, get, owsException, countMembers, save } from './lib.mjs';

const TN11 = 'ms:Planeamiento.Zonificacion';
const INE = '46250'; // València capital — the known positive.

const forms = [];
const F = (tag, url) => forms.push({ tag, url });

const filt = (prop, lit) =>
    `<Filter><PropertyIsEqualTo><PropertyName>${prop}</PropertyName><Literal>${lit}</Literal></PropertyIsEqualTo></Filter>`;

// --- WFS 1.1.0 OGC Filter, property-name variants
for (const p of ['cod_ine_mun', 'ms:cod_ine_mun', 'noms_mun'])
    F(`1.1.0 filter ${p}`, `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN11)}&filter=${encodeURIComponent(filt(p, p === 'noms_mun' ? 'València' : INE))}&maxfeatures=3`);

// --- namespaced Filter with explicit ogc namespace
F(
    '1.1.0 filter ogc-ns',
    `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN11)}&filter=${encodeURIComponent(
        `<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc"><ogc:PropertyIsEqualTo><ogc:PropertyName>cod_ine_mun</ogc:PropertyName><ogc:Literal>${INE}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`
    )}&maxfeatures=3`
);

// --- WFS 1.1.0 with a LIKE instead of equality (exercises a different PostGIS code path)
F(
    '1.1.0 like',
    `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN11)}&filter=${encodeURIComponent(
        `<Filter><PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>cod_ine_mun</PropertyName><Literal>${INE}</Literal></PropertyIsLike></Filter>`
    )}&maxfeatures=3`
);

// --- CQL_FILTER (MapServer 7+ supports it)
for (const v of ['1.1.0', '2.0.0']) {
    const tnParam = v === '2.0.0' ? 'typenames' : 'typename';
    const tn = v === '2.0.0' ? 'ms:Planeamiento.Zonificacion' : TN11;
    const cnt = v === '2.0.0' ? 'count=3' : 'maxfeatures=3';
    F(`${v} CQL`, `${BASE}?service=WFS&version=${v}&request=GetFeature&${tnParam}=${encodeURIComponent(tn)}&CQL_FILTER=${encodeURIComponent(`cod_ine_mun='${INE}'`)}&${cnt}`);
}

// --- WFS 2.0.0 OGC fes filter
F(
    '2.0.0 fes filter',
    `${BASE}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent('ms:Planeamiento.Zonificacion')}&filter=${encodeURIComponent(
        `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:PropertyIsEqualTo><fes:ValueReference>cod_ine_mun</fes:ValueReference><fes:Literal>${INE}</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>`
    )}&count=3`
);

// --- CONTROL: no filter at all. If this ALSO fails, the defect is the layer, not the filter.
F('1.1.0 NO FILTER (control)', `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN11)}&maxfeatures=3`);
F('2.0.0 NO FILTER (control)', `${BASE}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent('ms:Planeamiento.Zonificacion')}&count=3`);

const results = [];
for (const f of forms) {
    const r = await get(f.url, 120000);
    const exc = owsException(r.body);
    const n = r.ok && !exc ? countMembers(r.body) : 0;
    const rec = { tag: f.tag, http: r.http, exception: exc ? exc.slice(0, 140) : null, n, bytes: r.body.length };
    results.push(rec);
    console.error(`${(rec.exception ? 'ERR ' : n ? 'OK  ' : '0   ')}${f.tag.padEnd(26)} n=${n} ${rec.exception || ''}`);
}
save('_02_filter_forms.json', results);
