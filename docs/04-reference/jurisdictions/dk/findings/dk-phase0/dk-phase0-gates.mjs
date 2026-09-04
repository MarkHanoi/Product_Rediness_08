#!/usr/bin/env node
// DK PHASE 0 — GATE PROBE. Master prompt RULE 2: "Never invent an endpoint. Mark UNVERIFIED +
// verify via OpenAPI/Swagger/GetCapabilities; record exactly what was verified."
//
// Lane ENVELOPE-NLDK, 2026-09-03.
//
// WHY A SEPARATE SCRIPT. `DK-DATA-GAP-AUDIT.md` §1.1 records a live CONTRADICTION between two
// repo statements about the same gate: `sourceRegistry/dk.ts` says Datafordeler needs an ADMIN
// MitID bootstrap ("unobtainable"), while `dkMatrikelProxy.js` says a free API key is mintable
// at portal.datafordeler.dk. Neither can be settled by reading the repo — only by probing. And
// an anonymous probe against Datafordeler returns HTTP 404, NOT 401: reporting that 404 as
// "no data" would be a wrong-SYSTEM probe error (the three ways a probe can be wrong: wrong
// RUNTIME, wrong PROPERTY, wrong SYSTEM). Every status below is recorded verbatim with the URL
// that produced it, and NOTHING here is turned into a coverage claim.
//
// USAGE: node dk-phase0-gates.mjs

const KEY = process.env.DATAFORDELER_API_KEY ?? null;
const USER = process.env.DATAFORDELER_USERNAME ?? null;

const targets = [
    // ── keyless, expected LIVE ────────────────────────────────────────────────────────────────
    ['plandata-wfs-capabilities', 'https://geoserver.plandata.dk/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities', 'keyless'],
    ['dawa-jordstykker-point', 'https://api.dataforsyningen.dk/jordstykker?x=12.5683&y=55.6761&srid=4326', 'keyless'],
    ['dawa-bbr-probe', 'https://api.dataforsyningen.dk/bbrlight/bygninger?per_side=1', 'keyless (BBR-light; DK-DATA-GAP-AUDIT §1.4 records DAWA bygninger as REJECTED for 200-empty at central CPH)'],
    // ── credential-gated: record the EXACT status, never a coverage verdict ───────────────────
    ['datafordeler-MAT-wfs-anon', 'https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS?service=WFS&request=GetCapabilities', 'DATAFORDELER_API_KEY'],
    ['datafordeler-GeoDanmark-wfs-anon', 'https://wfs.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS?service=WFS&request=GetCapabilities', 'DATAFORDELER_API_KEY'],
    ['datafordeler-BBR-anon', 'https://services.datafordeler.dk/BBR/BBRPublic/1/rest/bygning?format=json&username=&password=', 'Datafordeler service user'],
    ['datafordeler-DHM-wcs-anon', 'https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS?service=WCS&request=GetCapabilities', 'DATAFORDELER_API_KEY'],
    // ── the master prompt Parts 5-10 sources this lane could NOT verify from the repo ─────────
    ['retsinformation-api', 'https://www.retsinformation.dk/api/document/eli/lta/2018/1615', 'unknown — Part 5.1'],
    ['miljoeportal-arealdata-wfs', 'https://arealdata-api.miljoeportal.dk/geoserver/wfs?service=WFS&request=GetCapabilities', 'unknown — Part 6'],
    ['slks-fbb-wfs', 'https://www.kulturarv.dk/ffrepox/rest/api/', 'unknown — Part 7 FBB'],
    ['ler-openapi', 'https://ler.dk/api/v2/openapi.json', 'professional-purpose auth — Part 9'],
    ['tinglysning-api', 'https://www.tinglysning.dk/tinglysning/', 'MitID-class identity — Part 10 (TRUNCATED in transmission)'],
];

async function probe(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
        const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'PRYZM-DK-Phase0/1.0 (+https://pryzm.fly.dev)' } });
        clearTimeout(timer);
        const b = await r.text();
        return { status: r.status, contentType: r.headers.get('content-type'), bytes: b.length, head: b.replace(/\s+/g, ' ').slice(0, 200) };
    } catch (e) {
        clearTimeout(timer);
        return { status: null, error: e.name === 'AbortError' ? 'timeout' : e.message };
    }
}

const out = { generatedAt: new Date().toISOString(), lane: 'ENVELOPE-NLDK', credentialsPresent: { DATAFORDELER_API_KEY: KEY !== null, DATAFORDELER_USERNAME: USER !== null }, probes: [] };
for (const [id, url, gate] of targets) {
    const res = await probe(url);
    out.probes.push({ id, url, gate, ...res });
    console.log(String(res.status ?? 'ERR').padEnd(5), id.padEnd(34), res.error ?? (res.bytes + 'B ' + (res.contentType ?? '')));
    if (res.head) console.log('        ', res.head.slice(0, 160));
}
const fs = await import('node:fs');
fs.writeFileSync('dk-phase0-gates.json', JSON.stringify(out, null, 1));
console.log('\nWROTE dk-phase0-gates.json');
console.log('\nREAD THIS BEFORE QUOTING ANY LINE ABOVE: a status is a fact about the PROBE, not about');
console.log('the dataset. A 404 on an anonymous Datafordeler call is the gate answering, NOT an');
console.log('absence of Danish cadastral data. Nothing here licenses a coverage claim.');
