#!/usr/bin/env node
// NL PHASE 0 — HARNESS A: parcel sampling -> M1, M2, M3, M5a, M6-partial.
//
// Lane ENVELOPE-NLDK, 2026-09-03. Implements the Phase-0 sampling spec in
// `NL-DATA-GAP-AUDIT.md` §3 against `NL-ENVELOPE-MASTER-PROMPT.md` §2 (M1-M6).
//
// SOURCES (both KEYLESS, live-probed 2026-09-03):
//   * parcels  — PDOK BRK Kadastrale Kaart WFS v5_0, typeNames kadastralekaart:Perceel
//   * planning — PDOK "Ruimtelijke plannen" WMS v1_0 GetFeatureInfo (the IMRO transitional
//                mirror the shipped NL leg already reads, `nlBestemmingsplanProxy.js`)
//
// WHAT THIS MEASURES, STATED EXACTLY — the number is a PROPERTY OF THE SAMPLING DESIGN,
// not a fact about the Netherlands, unless the design is named with it:
//   * Sampling frame: a random RD point -> a 250 m x 250 m tile -> EVERY cadastral parcel the
//     WFS returns in that tile -> ONE parcel drawn uniformly from the tile. So parcels are
//     uniform WITHIN a tile and tiles are uniform over cadastred land. Sparse tiles are
//     therefore OVER-represented per parcel; `tileParcelCount` is recorded on every row so a
//     tile-size-weighted (parcel-uniform) estimate can be computed from the same rows. BOTH
//     are printed by the reducer. Do not quote one without saying which.
//   * Coverage test: point-in-polygon at the parcel's REPRESENTATIVE POINT (centroid, pulled
//     inside for non-convex parcels), NOT an areal overlay. It answers "does a map click at
//     the middle of this parcel land in a published bouwvlak" — which is exactly what the
//     shipped product does — and it is a LOWER BOUND on "the parcel intersects a bouwvlak".
//   * Determinism: the RNG is a seeded mulberry32. Same seed + same upstream = same sample.
//
// USAGE:  node nl-phase0-parcels.mjs --n=500 --seed=20260903 --out=nl-phase0-parcels.json
// NEVER invents a value: every absent field is null and is counted as UNKNOWN, never as 0.

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const N = Number(args.n ?? 500);
const SEED = Number(args.seed ?? 20260903);
const OUT = args.out ?? 'nl-phase0-parcels.json';
const CONCURRENCY = Number(args.concurrency ?? 5);
const TILE_M = 250;
// STRATUM FILTER. A tile-uniform draw over cadastred land is AREA-representative, so with
// N=500 it yields few urban parcels and the urban cells of M1's cross-tab stay noisy. Passing
// --minTileParcels=15 (>= 240 parcels/km^2) draws a SECOND, deliberately urban-oversampled
// stratum. The two runs are reported as separate strata and are NEVER pooled: pooling them
// would silently reweight the national estimate. The parcel-uniform national estimate comes
// from the unfiltered run alone, by weighting each row by its tileParcelCount.
const MIN_TILE_PARCELS = Number(args.minTileParcels ?? 0);
const STRATUM = args.stratum ?? (MIN_TILE_PARCELS > 0 ? 'dense' : 'all-cadastred-land');

const BRK = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
const RPWMS = 'https://service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0';
const LAYERS = ['bestemmingsplangebied', 'enkelbestemming', 'bouwvlak', 'maatvoering', 'dubbelbestemming', 'gebiedsaanduiding'];

// NL RD New (EPSG:28992) land bounding box. Rejection sampling handles sea/uncadastred area.
const RD = { minx: 13000, maxx: 280000, miny: 306000, maxy: 620000 };

// -- deterministic RNG -------------------------------------------------------
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);

// -- HTTP with retry; a FAILURE and an EMPTY answer never collapse -----------
async function getJson(url, { tries = 3, timeoutMs = 25000 } = {}) {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
            const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
            clearTimeout(timer);
            const text = await r.text();
            if (!r.ok) { lastErr = 'HTTP ' + r.status; continue; }
            try { return { ok: true, body: JSON.parse(text) }; } catch { lastErr = 'non-json'; continue; }
        } catch (e) {
            clearTimeout(timer);
            lastErr = e.name === 'AbortError' ? 'timeout' : e.message;
        }
        await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
    return { ok: false, error: lastErr };
}

// -- geometry helpers (pure) -------------------------------------------------
function ringsOf(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates?.[0] ?? []];
    if (geom.type === 'MultiPolygon') return (geom.coordinates ?? []).map((p) => p[0] ?? []);
    return [];
}
function ringArea(r) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]);
    return a / 2;
}
function ringCentroid(r) {
    let cx = 0, cy = 0, a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
        a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    a /= 2;
    if (Math.abs(a) < 1e-14) return null;
    return [cx / (6 * a), cy / (6 * a)];
}
function pointInRing(pt, r) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
/** Representative point: centroid of the largest ring, pulled inside if it falls outside. */
function representativePoint(geom) {
    const rings = ringsOf(geom).filter((r) => r.length >= 4);
    if (rings.length === 0) return null;
    rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
    const r = rings[0];
    const c = ringCentroid(r);
    if (c && pointInRing(c, r)) return c;
    const y = c ? c[1] : (r.reduce((s, p) => s + p[1], 0) / r.length);
    const xs = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
        if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2) return [(xs[0] + xs[1]) / 2, y];
    return c;
}

// -- WMS GetFeatureInfo at a WGS84 point (mirrors buildNlGfiUrl in the shipped proxy) -----
function gfiUrl(layer, lat, lon) {
    const d = 0.0004;
    const qs = new URLSearchParams({
        service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
        layers: layer, query_layers: layer, crs: 'EPSG:4326',
        bbox: (lat - d) + ',' + (lon - d) + ',' + (lat + d) + ',' + (lon + d),
        width: '51', height: '51', i: '25', j: '25',
        info_format: 'application/json', feature_count: '30',
    });
    return RPWMS + '?' + qs;
}

// -- governing-plan pick — IDENTICAL rule to server/jurisdiction/nlBestemmingsplanProxy.js --
export function planStatusRank(status) {
    const s = String(status ?? '').toLowerCase();
    if (s.includes('onherroepelijk')) return 4;
    if (s.includes('geconsolideerd')) return 3;
    if (s.includes('vastgesteld')) return 2;
    if (s.includes('ontwerp')) return 1;
    return 0;
}

// -- SVBP2012 maatvoering unpack (mirrors parsePdokMaatvoering + classifyMaatvoering) -----
export function parseMaat(props) {
    const packed = props?.maatvoering;
    const m = typeof packed === 'string' ? packed.match(/"([^"]+)"\s*=\s*"([^"]*)"/) : null;
    if (m) return { naam: m[1], waarde: m[2] };
    if (typeof props?.naam === 'string' && props.naam.trim() !== '') return { naam: props.naam, waarde: null };
    return null;
}

// -- RD -> WGS84 (Schreutelkamp/Strang van Hees approximation, ~0.2 m over NL) ------------
function rdToWgs(x, y) {
    const dX = (x - 155000) * 1e-5, dY = (y - 463000) * 1e-5;
    const lat = 52.15517440 + (
        3235.65389 * dY + -32.58297 * dX * dX + -0.24750 * dY * dY + -0.84978 * dX * dX * dY +
        -0.06550 * dY * dY * dY + -0.01709 * dX * dX * dY * dY + -0.00738 * dX
    ) / 3600;
    const lon = 5.38720621 + (
        5260.52916 * dX + 105.94684 * dX * dY + 2.45656 * dX * dY * dY + -0.81885 * dX * dX * dX +
        0.05594 * dX * dY * dY * dY + -0.05607 * dX * dX * dX * dY + 0.01199 * dY
    ) / 3600;
    return [lat, lon];
}

// -- one sampled tile --------------------------------------------------------
async function sampleOneTile() {
    for (let attempt = 0; attempt < 40; attempt++) {
        const x = RD.minx + rnd() * (RD.maxx - RD.minx);
        const y = RD.miny + rnd() * (RD.maxy - RD.miny);
        const h = TILE_M / 2;
        const bbox = (x - h) + ',' + (y - h) + ',' + (x + h) + ',' + (y + h) + ',urn:ogc:def:crs:EPSG::28992';
        const qs = new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: 'kadastralekaart:Perceel', count: '250',
            outputFormat: 'application/json', srsName: 'EPSG:4326', bbox,
        });
        const res = await getJson(BRK + '?' + qs);
        if (!res.ok) return { skip: 'brk-' + res.error };
        const feats = res.body?.features ?? [];
        if (feats.length === 0) continue; // uncadastred — resample
        if (feats.length < MIN_TILE_PARCELS) continue; // outside this stratum — resample
        const truncated = feats.length >= 250;
        const pick = feats[Math.floor(rnd() * feats.length)];
        return { pick, tileParcelCount: feats.length, truncated, tileRd: [x, y] };
    }
    return { skip: MIN_TILE_PARCELS > 0 ? 'no-dense-tile-after-40-tries' : 'no-cadastre-after-40-tries' };
}

async function probeParcel(sample) {
    const p = sample.pick.properties ?? {};
    const rep = representativePoint(sample.pick.geometry);
    if (!rep) return { skip: 'no-representative-point' };
    const lon = rep[0], lat = rep[1]; // PDOK GeoJSON is CRS84 -> [lon, lat]
    const row = {
        parcelId: p.identificatieLokaalID ?? null,
        kadGemeente: p.kadastraleGemeenteWaarde ?? null,
        sectie: p.sectie ?? null,
        perceelnummer: p.perceelnummer ?? null,
        areaM2: typeof p.kadastraleGrootteWaarde === 'number' ? p.kadastraleGrootteWaarde : null,
        lat, lon,
        tileParcelCount: sample.tileParcelCount,
        tileTruncated: sample.truncated,
        tileDensityPerKm2: sample.tileParcelCount / Math.pow(TILE_M / 1000, 2),
        layers: {},
        fetchErrors: [],
    };
    for (const layer of LAYERS) {
        const res = await getJson(gfiUrl(layer, lat, lon));
        if (!res.ok) { row.fetchErrors.push(layer + ':' + res.error); row.layers[layer] = null; continue; }
        row.layers[layer] = (res.body?.features ?? []).map((f) => f.properties ?? {});
    }
    return row;
}

// -- run ---------------------------------------------------------------------
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
        if (rows.length % 25 === 0) {
            process.stderr.write('  ... ' + rows.length + '/' + N + ' parcels (' + Math.round((Date.now() - t0) / 1000) + 's)\n');
        }
    }
}
// Workers draw from the SHARED seeded RNG, so the multiset of samples is seed-determined but
// the ORDER is not. Rows are sorted by parcelId before writing so the artefact is stable.
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
rows.sort((a, b) => String(a.parcelId).localeCompare(String(b.parcelId)));

const out = {
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    spec: 'NL-ENVELOPE-MASTER-PROMPT.md §2 M1/M2/M3/M5a/M6-partial',
    stratum: STRATUM, minTileParcels: MIN_TILE_PARCELS,
    seed: SEED, requested: N, sampled: rows.length, skipped: skips.length,
    skipReasons: skips.reduce((m, s) => { m[s] = (m[s] ?? 0) + 1; return m; }, {}),
    tileMetres: TILE_M,
    sources: { parcels: BRK, planning: RPWMS, keyless: true, probedAt: '2026-09-03' },
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    rows,
};
const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.stderr.write('\nWROTE ' + OUT + ' — ' + rows.length + ' parcels, ' + out.elapsedSec + 's, skipped ' + skips.length + '\n');
void rdToWgs;
