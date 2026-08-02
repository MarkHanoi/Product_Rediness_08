// §MURCIA-STREET-WIDTH-REALISED-SHARE — what SIG-MU2 ACTUALLY unlocks, measured.
//
// ⚠⚠ THIS TOOL EXISTS BECAUSE 32.32 % IS AN UPPER BOUND AND MUST NOT BE PUBLISHED AS AN OUTCOME.
// The signature's condition 4 REFUSES wherever measurement uncertainty could change the applicable
// band, and `measureStreetWidths` refuses where no opposing frontage is found. Both are the
// signature working. So the share of Murcia that actually gains an envelope is strictly less than
// the 8.81 pp of RC/RM/RN land, by an amount nobody can predict — it has to be MEASURED.
// (§SIZE-IS-NOT-PROVENANCE, one field over: a green run is not a shipped envelope.)
//
// METHOD — it reproduces PRODUCTION, so it cannot flatter it:
//   1. Fetch every IN-FORCE RC / RM / RN polygon from `Murcia:pgou_alineaciones` (the population).
//   2. Draw an AREA-WEIGHTED sample — the axis is measured in land, not in polygons, so sampling
//      polygons uniformly would over-represent slivers and understate the answer.
//   3. For each sample point, run the PRODUCTION resolver `resolveMurciaStreetWidth` against the
//      SAME neighbourhood bbox the proxy issues, then the PRODUCTION band resolver
//      `resolveMurciaAnchoDeCalle` with the measured spread. No re-implementation anywhere.
//   4. Report the AREA-WEIGHTED share that resolves, and every refusal by reason.
//
// Usage: npx tsx tools/murcia-street-width-probe/probe.mts [--samples 150] [--seed 20260802]

import { resolveMurciaStreetWidth } from '../../packages/site-parcel-data/src/providers/resolveMurciaStreetWidth.js';
import {
    resolveMurciaAnchoDeCalle,
    type MurciaAnchoZone,
} from '../../packages/site-parcel-data/src/rulepacks/esMurciaAnchoDeCalle.js';

const WFS = 'https://geoserver.murcia.es/geoserver/wfs';
const LAYER = 'Murcia:pgou_alineaciones';
/** Mirrors `MURCIA_NEIGHBOURHOOD_HALF_DEG` in server/murciaPgouProxy.js. */
const HOOD_HALF_DEG = 0.002;
const HOOD_MAX_FEATURES = 600;
const M_PER_DEG_LAT = 111_320;

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
    const i = argv.indexOf(k);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const SAMPLES = arg('--samples', 150);
const SEED = arg('--seed', 20260802);

/** Deterministic PRNG — a sampled figure must be reproducible or it is not a measurement. */
function mulberry32(a: number) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type LonLat = readonly [number, number];

function ringAreaM2(ring: readonly LonLat[]): number {
    if (ring.length < 3) return 0;
    const lat = ring[0]![1];
    const mLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += (p[0] * mLon) * (q[1] * M_PER_DEG_LAT) - (q[0] * mLon) * (p[1] * M_PER_DEG_LAT);
    }
    return Math.abs(a) / 2;
}

/** A point guaranteed INSIDE the ring: the centroid, else the average of two adjacent vertices. */
function interiorPoint(ring: readonly LonLat[]): LonLat {
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    const c: LonLat = [sx / ring.length, sy / ring.length];
    if (pointInRing(ring, c)) return c;
    // Concave ring: walk vertex midpoints nudged toward the centroid until one lands inside.
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const m: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const t of [0.02, 0.08, 0.2, 0.4]) {
            const p: LonLat = [m[0] + (c[0] - m[0]) * t, m[1] + (c[1] - m[1]) * t];
            if (pointInRing(ring, p)) return p;
        }
    }
    return c;
}

function pointInRing(ring: readonly LonLat[], p: LonLat): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if (a[1] > p[1] !== b[1] > p[1] &&
            p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

async function getJson(url: string): Promise<any> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function hoodUrl(lat: number, lon: number): string {
    const r = (n: number) => Number(n.toFixed(7));
    const qs = new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
        outputFormat: 'application/json', srsName: 'EPSG:4326', count: String(HOOD_MAX_FEATURES),
        bbox: `${r(lat - HOOD_HALF_DEG)},${r(lon - HOOD_HALF_DEG)},${r(lat + HOOD_HALF_DEG)},${r(lon + HOOD_HALF_DEG)},urn:ogc:def:crs:EPSG::4326`,
    });
    return `${WFS}?${qs}`;
}

async function main() {
    const today = new Date().toISOString().slice(0, 10);
    const popUrl = `${WFS}?` + new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
        outputFormat: 'application/json', srsName: 'EPSG:4326', count: '20000',
        CQL_FILTER: `calificacion IN ('RC','RM','RN') AND f_fin > '${today}'`,
    });
    process.stderr.write('fetching RC/RM/RN population…\n');
    const pop = await getJson(popUrl);

    type Unit = { zone: MurciaAnchoZone; area: number; pt: LonLat };
    const units: Unit[] = [];
    for (const f of pop.features ?? []) {
        const code = String(f?.properties?.calificacion ?? '');
        if (code !== 'RC' && code !== 'RM' && code !== 'RN') continue;
        const g = f.geometry;
        const polys: readonly (readonly (readonly LonLat[])[])[] =
            g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
        for (const poly of polys) {
            const outer = poly?.[0];
            if (!outer || outer.length < 4) continue;
            const area = ringAreaM2(outer);
            if (area <= 0) continue;
            units.push({ zone: code as MurciaAnchoZone, area, pt: interiorPoint(outer) });
        }
    }
    const totalArea = units.reduce((s, u) => s + u.area, 0);
    process.stderr.write(`population: ${units.length} rings, ${(totalArea / 1e6).toFixed(3)} km²\n`);

    // AREA-WEIGHTED draw without replacement.
    const rnd = mulberry32(SEED);
    const cum: number[] = [];
    let acc = 0;
    for (const u of units) { acc += u.area; cum.push(acc); }
    const picked = new Set<number>();
    const sample: Unit[] = [];
    let guard = 0;
    while (sample.length < Math.min(SAMPLES, units.length) && guard++ < SAMPLES * 40) {
        const t = rnd() * totalArea;
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid]! < t) lo = mid + 1; else hi = mid; }
        if (picked.has(lo)) continue;
        picked.add(lo);
        sample.push(units[lo]!);
    }

    const byReason = new Map<string, { n: number; area: number }>();
    const bump = (k: string, a: number) => {
        const e = byReason.get(k) ?? { n: 0, area: 0 };
        e.n++; e.area += a; byReason.set(k, e);
    };
    let okArea = 0, okN = 0, sampledArea = 0;
    const widths: number[] = [];

    for (const [i, u] of sample.entries()) {
        sampledArea += u.area;
        const [lon, lat] = u.pt;
        let hood: any;
        try { hood = await getJson(hoodUrl(lat, lon)); }
        catch { bump('endpoint-unreachable', u.area); continue; }
        const features = Array.isArray(hood?.features) ? hood.features : null;
        const truncated = Array.isArray(features) && features.length >= HOOD_MAX_FEATURES;
        const fetchImpl = (async () => ({
            ok: true, json: async () => ({ alineaciones: features, truncated }),
        })) as unknown as typeof fetch;

        const w = await resolveMurciaStreetWidth({ lat, lon }, { fetchImpl });
        if (!w.ok) { bump(w.reason, u.area); continue; }
        const band = resolveMurciaAnchoDeCalle(u.zone, w.width_m, {
            widthProvenance: 'measured-geometry', measurementSpread_m: w.spread_m,
        });
        if (!band.ok) { bump(`band:${band.reason}`, u.area); continue; }
        okN++; okArea += u.area; widths.push(w.width_m);
        if ((i + 1) % 25 === 0) process.stderr.write(`  …${i + 1}/${sample.length}\n`);
    }

    const pct = (a: number) => `${((a / sampledArea) * 100).toFixed(1)} %`;
    console.log(JSON.stringify({
        measuredAt: new Date().toISOString(),
        seed: SEED,
        population: { rings: units.length, areaKm2: +(totalArea / 1e6).toFixed(3) },
        sample: { rings: sample.length, areaKm2: +(sampledArea / 1e6).toFixed(4) },
        resolved: { rings: okN, areaKm2: +(okArea / 1e6).toFixed(4), areaShare: +(okArea / sampledArea).toFixed(4) },
        refusedByReason: Object.fromEntries([...byReason].map(([k, v]) => [k, { rings: v.n, areaShare: +(v.area / sampledArea).toFixed(4) }])),
        widthStats: widths.length ? {
            n: widths.length,
            min: +Math.min(...widths).toFixed(2),
            median: +[...widths].sort((a, b) => a - b)[widths.length >> 1]!.toFixed(2),
            max: +Math.max(...widths).toFixed(2),
        } : null,
    }, null, 2));
    process.stderr.write(`\nRESOLVED (area-weighted): ${pct(okArea)} of sampled RC/RM/RN land\n`);
    for (const [k, v] of [...byReason].sort((a, b) => b[1].area - a[1].area)) {
        process.stderr.write(`  refused ${k}: ${pct(v.area)} (${v.n} rings)\n`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
