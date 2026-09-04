#!/usr/bin/env node
// NL — DSO SURFACE PROBE (lane ENVELOPE-NLDK, round 3, 2026-09-04). Founder review §2/§11; deep audit §2/§6.
//
// WHAT THIS ANSWERS WITHOUT A KEY. The DSO's data paths are key-gated (x-api-key), and no key is held
// (DSO_API_KEY absent at run time — recorded below). But every DSO API publishes its OpenAPI document
// KEYLESS, and the specs are an INDEPENDENT source against which a documentation-read verdict can be
// checked (a probe can be wrong three ways; demand a second system). So this script:
//   1. records, per API, the anonymous HTTP status of the data plane (/app-info) and the description
//      plane (/openapi.json) — 401 = key-gated, 404 = path wrong or not served there, 200 = public;
//   2. mines the public specs for the words that decide founder §11's `not-verified` question
//      ("is the tijdelijk deel served through Ozon?") and the mechanism of §1 (voorrang, tijdelijk
//      regelingdeel, IMRO plan ids, geldigOp/beschikbaarOp time travel, _zoek with geometrie);
//   3. never invents an endpoint: every base below is from the API register
//      (developer.omgevingswet.overheid.nl/api-register/, read 2026-09-04) or from a spec's own
//      `servers`. Paths this lane GUESSED and that 404'd are listed under `guessRejected`.
//
// USAGE: node nl-dso-surface-probe.mjs > nl-dso-surface-probe.json
const APIS = [
    { id: 'omgevingsdocumenten-presenteren-v8', base: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8', register: 'omgevingsdocument-presenteren' },
    { id: 'omgevingsdocumenten-toepasbaar-opvragen-v7', base: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7', register: 'omgevingsdocument-toepasbaar-opvragen' },
    { id: 'omgevingsinformatie-ontsluiten-v2', base: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2', register: 'omgevingsinformatie-ontsluiten' },
    { id: 'ruimtelijke-plannen-opvragen-v4', base: 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4', register: 'rp-opvragen' },
    { id: 'catalogus-opvragen-v3', base: 'https://service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3', register: 'catalogus-opvragen' },
    { id: 'toepasbare-regels-uitvoeren-services-v3', base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/toepasbareregelsuitvoerenservices/v3', register: 'uitvoeren-services', publicSpec: 'https://developer.omgevingswet.overheid.nl/publish/pages/171046/toepasbareregels-uitvoerenservices-v3.json' },
    { id: 'toepasbare-regels-rtr-raadplegen-v2', base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/rtrgegevens/v2', register: 'crud-rtr-gegevens-raadplegen', publicSpec: 'https://developer.omgevingswet.overheid.nl/publish/pages/167490/toepasbareregels-crud-rtr-gegevens-v2.json' },
    { id: 'toepasbare-regels-zoeken-v2', base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/zoekinterface/v2', register: 'toepasbare-regels-zoeken', publicSpec: 'https://developer.omgevingswet.overheid.nl/publish/pages/235013/toepasbareregels-zoekinterface-v2.json' },
    { id: 'stelselcatalogus-website-api', base: 'https://stelselcatalogus.omgevingswet.overheid.nl/api', register: null, specPath: '/', specAccept: 'text/yaml', dataPath: '/concepten?zoekTerm=peil&pageSize=5', dataAccept: 'application/hal+json' },
];
const GUESS_REJECTED = [
    '/publiek/toepasbare-regels/api/rtrgegevens/v2/app-info -> 404 (register base; /app-info is not served there)',
    '/publiek/toepasbare-regels/api/uitvoeren/v3/app-info -> 404 (guessed; real base is /toepasbareregelsuitvoerenservices/v3)',
    '/publiek/omgevingsdocumenten/api/opvragen/v1/app-info -> 404 (guessed)',
    '/publiek/catalogus/api/raadplegen/v1/app-info -> 404 (guessed; real base is /catalogus/api/opvragen/v3)',
    'stelselcatalogus /api/v1/begrippen?zoekterm=peil -> 404 (guessed; real path is /api/concepten?zoekTerm=, Accept: application/hal+json; application/json -> 406)',
];
const KEYWORDS = ['tijdelijk', 'tijdelijkDeelVan', 'tijdelijkDelen', 'gerelateerdeTijdelijkeRegelingdelen', 'IMRO', 'iMROPlanidentificatie', 'isTamPlan', 'ruimtelijkeplannen', 'bestemmingsplan', 'bruidsschat', 'voorrang', 'geldigOp', 'inWerkingOp', 'beschikbaarOp', 'renvooi', '_delta', 'geometrie', '_zoek'];

async function get(url, accept) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 40000);
    try {
        const r = await fetch(url, { signal: ctl.signal, headers: { Accept: accept } });
        const body = await r.text();
        clearTimeout(t);
        return { status: r.status, contentType: r.headers.get('content-type'), bytes: body.length, body };
    } catch (e) {
        clearTimeout(t);
        return { status: null, error: e.name === 'AbortError' ? 'timeout' : e.message, body: '' };
    }
}
function countKw(text, kw) {
    const re = new RegExp(kw.replace(/[_$]/g, (c) => '\\' + c), 'g');
    return (text.match(re) || []).length;
}

const out = {
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK round 3',
    dsoApiKeyPresent: Boolean(process.env.DSO_API_KEY),
    registerUrl: 'https://developer.omgevingswet.overheid.nl/api-register/',
    registerQuote: 'Met deze REST API kunnen bestaande ruimtelijke plannen worden opgevraagd uit Ruimtelijkeplannen.nl. (api/rp-opvragen, read 2026-09-04)',
    guessRejected: GUESS_REJECTED,
    apis: [],
};
for (const a of APIS) {
    const rec = { id: a.id, base: a.base, register: a.register ? 'https://developer.omgevingswet.overheid.nl/api-register/api/' + a.register + '/' : null };
    const info = await get(a.base + (a.dataPath ?? '/app-info'), a.dataAccept ?? 'application/json');
    rec.dataPlaneAnonymous = { path: a.dataPath ?? '/app-info', accept: a.dataAccept ?? 'application/json', status: info.status, contentType: info.contentType, error: info.error ?? null, bodyHead: info.body.slice(0, 200) };
    const spec = await get(a.base + (a.specPath ?? '/openapi.json'), a.specAccept ?? 'application/json');
    rec.specAnonymous = { path: a.specPath ?? '/openapi.json', status: spec.status, contentType: spec.contentType, bytes: spec.bytes };
    let specText = spec.status === 200 ? spec.body : '';
    if (!specText && a.publicSpec) {
        const p = await get(a.publicSpec, 'application/json');
        rec.publicSpecOnPortal = { url: a.publicSpec, status: p.status, bytes: p.bytes };
        if (p.status === 200) specText = p.body;
    }
    if (specText) {
        try {
            const j = JSON.parse(specText);
            rec.spec = { title: j.info?.title ?? null, version: j.info?.version ?? null, security: j.security ?? null, securitySchemes: j.components?.securitySchemes ?? null, pathCount: Object.keys(j.paths || {}).length, paths: Object.keys(j.paths || {}) };
        } catch {
            const paths = (specText.match(/^ {2}\/[^:\n]*:/gm) || []).map((s) => s.trim().replace(/:$/, ''));
            rec.spec = { title: 'yaml (not parsed)', pathCount: paths.length, paths };
        }
        rec.keywordCounts = Object.fromEntries(KEYWORDS.map((k) => [k, countKw(specText, k)]));
    }
    out.apis.push(rec);
    process.stderr.write(a.id + ': data ' + (info.status ?? info.error) + ' | spec ' + spec.status + (rec.publicSpecOnPortal ? ' | portal ' + rec.publicSpecOnPortal.status : '') + '\n');
}
process.stdout.write(JSON.stringify(out, null, 1));
