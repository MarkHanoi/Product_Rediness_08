// STEP 10 — AREA WEIGHTING via a SEEDED, POPULATION-STRATIFIED SAMPLE.
//
// The census in step 5/6 is exact but POLYGON-weighted, which over-represents rural zones (one
// ZRP polygon can be a whole mountainside). Area weighting needs geometry, so it is measured on
// a documented sample rather than all 122,840 polygons.
//
// SAMPLING DESIGN (fully re-runnable):
//   frame   = the 542 municipalities the census itself returned (not an external list)
//   pop     = joined from the Wikidata INE/population extract used by probe-c
//   strata  = <5k / 5k-20k / 20k-50k / 50k-100k / >100k
//   draw    = mulberry32(SEED) + Fisher-Yates within each stratum
//   SEED    = 20260802 (same seed as probe-c, so the two runs are comparable)
//
// ⚠ ESTIMATOR CAVEAT, stated because it matters: this is a sample stratified by POPULATION being
// used to estimate shares of LAND AREA. Population and land area are only loosely related, so
// the area figures are INDICATIVE for the region and EXACT only for the sampled municipalities.
// The polygon-count census remains the exact region-wide measure. Run with --all for an exact
// regional area census (542 sequential requests, ~800 MB transferred, streamed not buffered).
//
// Areas are computed by the shoelace formula directly on gml:posList, which is EPSG:25830 —
// a PROJECTED CRS in metres — so no reprojection is involved and m² is exact.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, DIR, get, owsException, save } from './lib.mjs';

const SEED = 20260802;
const ALL = process.argv.includes('--all');
const PER_BAND = { '<5k': 20, '5k-20k': 12, '20k-50k': 10, '50k-100k': 8, '>100k': 8 };

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
const band = (p) => (p == null ? 'unknown' : p < 5000 ? '<5k' : p < 20000 ? '5k-20k' : p < 50000 ? '20k-50k' : p < 100000 ? '50k-100k' : '>100k');

// ── FRAME ────────────────────────────────────────────────────────────────────
const perMuni = JSON.parse(fs.readFileSync(path.join(DIR, '_06_permuni.json'), 'utf8'));
const frame = perMuni.map((m) => m.ine);

// population join (read-only borrow of probe-c's Wikidata extract)
const csv = fs.readFileSync(path.join(DIR, '..', 'cold-start-probe', '_wd_munis.csv'), 'utf8').split('\n').slice(1);
const popByIne = new Map();
for (const line of csv) {
    const m = line.match(/^"?(\d{5})"?,(.*),([\d.]+)\s*$/);
    if (m) popByIne.set(m[1], Math.round(Number(m[3])));
}
const joined = frame.map((ine) => ({ ine, pop: popByIne.get(ine) ?? null }));
const matched = joined.filter((j) => j.pop != null).length;
console.error(`frame=${frame.length} municipalities · population joined for ${matched} (${((100 * matched) / frame.length).toFixed(1)}%)`);

const byBand = {};
for (const j of joined) (byBand[band(j.pop)] ||= []).push(j);
console.error(`strata: ${Object.entries(byBand).map(([k, v]) => `${k}=${v.length}`).join(' ')}`);

const rnd = mulberry32(SEED);
let sample = [];
if (ALL) {
    // CENSUS MODE. The stratified draw below was never forced by a paging limit — a single
    // GetFeature returns all 122,840 features, reconciled against resultType=hits. The limiter
    // was PAYLOAD: geometry is ~6.5 KB/feature, so a region-wide geometric pull is ~800 MB.
    // Iterating municipality-by-municipality streams that in 542 bounded requests and removes
    // the estimator caveat entirely, so the area figures become EXACT rather than indicative.
    sample = joined.map((x) => ({ ...x, band: band(x.pop) }));
} else {
    for (const [b, n] of Object.entries(PER_BAND)) {
        const pool = byBand[b] || [];
        sample.push(...shuffle(pool, rnd).slice(0, n).map((x) => ({ ...x, band: b })));
    }
}
console.error(`sample: ${sample.length} municipalities (seed ${SEED})\n`);

// ── AREA ─────────────────────────────────────────────────────────────────────
const like = (p, v) =>
    `<Filter><PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><PropertyName>${p}</PropertyName><Literal>${v}</Literal></PropertyIsLike></Filter>`;

function ringArea(posList) {
    const c = posList.trim().split(/\s+/).map(Number);
    let a = 0;
    for (let i = 0, n = c.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        a += c[2 * i] * c[2 * j + 1] - c[2 * j] * c[2 * i + 1];
    }
    return Math.abs(a) / 2;
}

/** Area per feature = exterior rings minus interior rings. */
function featureArea(chunk) {
    let a = 0;
    for (const m of chunk.matchAll(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) a += ringArea(m[1]);
    for (const m of chunk.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) a -= ringArea(m[1]);
    return a;
}

const areaByCode = new Map();
const perMuniOut = [];
let failed = 0;

for (const s of sample) {
    const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent('ms:Planeamiento.Zonificacion')}&filter=${encodeURIComponent(like('cod_ine_mun', s.ine))}&propertyname=${encodeURIComponent('msGeometry,zon_suelo,clas_suelo')}`;
    // ⚠ msGeometry MUST be named explicitly. `propertyname=zon_suelo,clas_suelo` is precisely the
    // mechanism that SUPPRESSES geometry (that is why the census pulls were 23x smaller), so the
    // first run of this step reported 0 km² for every code — a zero manufactured by my own query,
    // not a fact about the data. Recorded because it is the same failure class the method warns
    // about: A ZERO MUST BE EXPLAINED BEFORE IT IS REPORTED, including when the probe caused it.
    const r = await get(u, 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) { failed++; console.error(`  ${s.ine} UNKNOWN ${(exc || r.http || r.err).toString().slice(0, 60)}`); continue; }
    const chunks = r.body.split('<gml:featureMember>').slice(1);
    const local = new Map();
    for (const c of chunks) {
        const code = (c.match(/<ms:zon_suelo>([^<]*)<\/ms:zon_suelo>/) || [])[1] ?? '__ABSENT__';
        const a = featureArea(c);
        local.set(code, (local.get(code) || 0) + a);
        areaByCode.set(code, (areaByCode.get(code) || 0) + a);
    }
    const tot = [...local.values()].reduce((x, y) => x + y, 0);
    perMuniOut.push({ ine: s.ine, band: s.band, pop: s.pop, polygons: chunks.length, area_m2: Math.round(tot), byCode: [...local].map(([k, v]) => [k, Math.round(v)]) });
    console.error(`  ${s.ine} band=${String(s.band).padEnd(9)} polys=${String(chunks.length).padStart(4)} area=${(tot / 1e6).toFixed(1)} km2`);
}

const totalArea = [...areaByCode.values()].reduce((a, b) => a + b, 0);
const areaRows = [...areaByCode.entries()]
    .map(([code, a]) => ({ code, area_km2: +(a / 1e6).toFixed(2), pctArea: +((100 * a) / totalArea).toFixed(3) }))
    .sort((a, b) => b.area_km2 - a.area_km2);

console.error(`\n── AREA SHARE BY CODE (sample of ${perMuniOut.length} municipalities, ${(totalArea / 1e6).toFixed(0)} km2) ──`);
for (const r of areaRows) console.error(`  ${String(r.pctArea).padStart(7)}%  ${String(r.area_km2).padStart(9)} km2  ${r.code}`);

save('_10_area.json', { seed: SEED, mode: ALL ? 'census' : 'stratified-sample', perBand: PER_BAND, sampled: perMuniOut.length, failed, populationJoinRate: +((100 * matched) / frame.length).toFixed(1), totalArea_km2: +(totalArea / 1e6).toFixed(1), areaByCode: areaRows, perMuni: perMuniOut });
