#!/usr/bin/env node
// DK PHASE 0 — the Denmark equivalent of NL's M1-M6, against `DK-ENVELOPE-MASTER-PROMPT.md`.
//
// Lane ENVELOPE-NLDK, 2026-09-03.
//
// The DK master prompt states no lettered M-list; it states 20 DETERMINATIONS and 8 RULES. The
// measurements below are the subset that (a) decides the shape of the Danish product and (b) is
// runnable KEYLESS today on the shipped ladder. Each is named for the rule it tests.
//
//   D1  ladder coverage      — how far up the 4-rung Plandata ladder (byggefelt / delomraade /
//                              lokalplan / kommuneplanramme) does a random Danish parcel get?
//   D2  structured-field fill— maxbygnhjd / maxetager / bebygpct / eareal / m3_m2, per rung.
//   D3  bebygpctaf denominator distribution — master §4.3's CRITICAL field. Which share of
//                              populated bebygpct is parcel-scoped (computable) vs area- or
//                              property-scoped (must be REFUSED, per shipped L-449 discipline)?
//   D4  honesty-flag census  — vejledende / kunifelt / kompleks / IOMFANGREG / TILLAGTOSH.
//                              iomfangreg=true means "the structured fields do NOT fully
//                              represent the regulation"; the shipped mapper reads it NOWHERE
//                              (DK-DATA-GAP-AUDIT §1.2, rank #2). This measures the exposure.
//   D5  zone distribution    — byzone / landzone / sommerhusomraade. R8: landzone is CONDITIONAL,
//                              never an automatic no-build.
//   D6  deterministic vs conditional — the partition determinations 16-18 demand.
//
// SOURCES (both KEYLESS, live-probed 2026-09-03):
//   * parcels  — DAWA `api.dataforsyningen.dk/jordstykker?cirkel=lon,lat,r` (Matriklen mirror;
//                carries matrikelnr, ejerlav, BFE, registreretareal and DAWA's own
//                `visueltcenter`, a guaranteed-interior representative point).
//   * planning — Plandata `geoserver.plandata.dk/geoserver/wfs`, the four `_vedtaget` themes the
//                shipped `plandataZoningProxy.js` reads. ADOPTED variants only: forslag and
//                aflyst are out of frame, and that bound is stated, not hidden.
//
// NOT MEASURED, and why (R2 — never claim an endpoint you did not verify): BBR, DHM per-parcel
// terrain, Matriklen survey attributes and the environmental/heritage/road overlays all sit
// behind `DATAFORDELER_API_KEY`, which this environment does not hold. `dk-phase0-gates.mjs`
// probes those gates and records the exact HTTP status rather than asserting "no data".
//
// USAGE: node dk-phase0-parcels.mjs --n=500 --seed=20260903 --out=dk-phase0-sample.json

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const N = Number(args.n ?? 500);
const SEED = Number(args.seed ?? 20260903);
const OUT = args.out ?? 'dk-phase0-sample.json';
const CONCURRENCY = Number(args.concurrency ?? 5);
const RADIUS_M = Number(args.radius ?? 125);
const MIN_TILE_PARCELS = Number(args.minTileParcels ?? 0);
const STRATUM = args.stratum ?? (MIN_TILE_PARCELS > 0 ? 'dense' : 'all-cadastred-land');

const DAWA = 'https://api.dataforsyningen.dk/jordstykker';
const PLANDATA = 'https://geoserver.plandata.dk/geoserver/wfs';
const LAYERS = [
    ['byggefelt', 'pdk:theme_pdk_byggefelt_vedtaget'],
    ['lokalplandelomraade', 'pdk:theme_pdk_lokalplandelomraade_vedtaget'],
    ['lokalplan', 'pdk:theme_pdk_lokalplan_vedtaget'],
    ['kommuneplanramme', 'pdk:theme_pdk_kommuneplanramme_vedtaget_v'],
];
// Denmark's land bbox (mainland + Bornholm). Rejection sampling handles sea.
const BB = { minLon: 8.05, maxLon: 15.20, minLat: 54.55, maxLat: 57.76 };

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);

async function getJson(url, { tries = 3, timeoutMs = 30000 } = {}) {
    let last = null;
    for (let i = 0; i < tries; i++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
            const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': 'PRYZM-DK-Phase0/1.0 (+https://pryzm.fly.dev)' } });
            clearTimeout(timer);
            const text = await r.text();
            if (!r.ok) { last = 'HTTP ' + r.status; continue; }
            try { return { ok: true, body: JSON.parse(text) }; } catch { last = 'non-json'; continue; }
        } catch (e) { clearTimeout(timer); last = e.name === 'AbortError' ? 'timeout' : e.message; }
        await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
    return { ok: false, error: last };
}

// ── the axis-order hedge the shipped proxy carries (§L-…-AXIS): a lat,lon bbox returns 0
// features SILENTLY with HTTP 200 on this GeoServer, so BOTH orders are tried before an
// "absent" verdict is recorded. A silent empty is exactly the failure mode R2 guards against.
function wfsUrl(typeName, lon, lat, axis) {
    const d = 0.00015;
    const bbox = axis === 'latlon'
        ? (lat - d) + ',' + (lon - d) + ',' + (lat + d) + ',' + (lon + d) + ',EPSG:4326'
        : (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d) + ',EPSG:4326';
    const qs = new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: typeName, outputFormat: 'application/json', srsName: 'EPSG:4326',
        count: '20', bbox,
    });
    return PLANDATA + '?' + qs;
}
async function wfsAt(typeName, lon, lat) {
    for (const axis of ['lonlat', 'latlon']) {
        const res = await getJson(wfsUrl(typeName, lon, lat, axis));
        if (!res.ok) return { error: res.error };
        const feats = res.body?.features ?? [];
        if (feats.length > 0) return { features: feats.map((f) => f.properties ?? {}), axis };
    }
    return { features: [], axis: 'both-tried' };
}

async function sampleOneTile() {
    for (let attempt = 0; attempt < 40; attempt++) {
        const lon = BB.minLon + rnd() * (BB.maxLon - BB.minLon);
        const lat = BB.minLat + rnd() * (BB.maxLat - BB.minLat);
        const res = await getJson(DAWA + '?cirkel=' + lon.toFixed(6) + ',' + lat.toFixed(6) + ',' + RADIUS_M);
        if (!res.ok) return { skip: 'dawa-' + res.error };
        const list = Array.isArray(res.body) ? res.body : [];
        if (list.length === 0) continue; // sea / uncadastred — resample
        if (list.length < MIN_TILE_PARCELS) continue;
        return { pick: list[Math.floor(rnd() * list.length)], tileParcelCount: list.length };
    }
    return { skip: MIN_TILE_PARCELS > 0 ? 'no-dense-tile-after-40-tries' : 'no-cadastre-after-40-tries' };
}

async function probeParcel(s) {
    const p = s.pick;
    const vc = p.visueltcenter; // DAWA's own guaranteed-interior representative point
    if (!Array.isArray(vc) || vc.length !== 2) return { skip: 'no-visueltcenter' };
    const lon = vc[0], lat = vc[1];
    const row = {
        matrikelnr: p.matrikelnr ?? null,
        ejerlavKode: p.ejerlav?.kode ?? null,
        ejerlavNavn: p.ejerlav?.navn ?? null,
        kommunekode: p.kommune?.kode ?? null,
        kommunenavn: p.kommune?.navn ?? null,
        bfe: p.bfenummer ?? p.bfe ?? null,
        registreretareal: p.registreretareal ?? null,
        lon, lat,
        tileParcelCount: s.tileParcelCount,
        layers: {},
        fetchErrors: [],
    };
    for (const [key, typeName] of LAYERS) {
        const r = await wfsAt(typeName, lon, lat);
        if (r.error) { row.fetchErrors.push(key + ':' + r.error); row.layers[key] = null; continue; }
        row.layers[key] = r.features;
    }
    return row;
}

const t0 = Date.now();
const rows = [];
const skips = [];
let queued = 0;
async function worker() {
    while (queued < N) {
        queued++;
        const s = await sampleOneTile();
        if (s.skip) { skips.push(s.skip); continue; }
        const r = await probeParcel(s);
        if (r.skip) { skips.push(r.skip); continue; }
        rows.push(r);
        if (rows.length % 25 === 0) process.stderr.write('  ... ' + rows.length + '/' + N + ' (' + Math.round((Date.now() - t0) / 1000) + 's)\n');
    }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
rows.sort((a, b) => String(a.ejerlavKode + '/' + a.matrikelnr).localeCompare(String(b.ejerlavKode + '/' + b.matrikelnr)));

const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    spec: 'DK-ENVELOPE-MASTER-PROMPT.md — D1..D6 (see header)',
    stratum: STRATUM, minTileParcels: MIN_TILE_PARCELS, radiusM: RADIUS_M,
    seed: SEED, requested: N, sampled: rows.length, skipped: skips.length,
    skipReasons: skips.reduce((m, s) => { m[s] = (m[s] ?? 0) + 1; return m; }, {}),
    sources: { parcels: DAWA, planning: PLANDATA, keyless: true, adoptedVariantsOnly: true, probedAt: '2026-09-03' },
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    rows,
}, null, 1));
process.stderr.write('\nWROTE ' + OUT + ' — ' + rows.length + ' parcels, skipped ' + skips.length + '\n');
