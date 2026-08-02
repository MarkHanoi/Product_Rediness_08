// §MURCIA-SNAP-GATE — ADR-0275's gate, re-run for MURCIA's own quanta.
//
// ADR-0275 fixed the rule BEFORE the code, and it binds every new city:
//   **Cluster ⇒ ship the snap. No cluster ⇒ do NOT ship it, fall back to the raw measured width
//   and say so.**
// and it proved the quantum set is CITY-SPECIFIC — Barcelona has no 10/15/25 m quantum at all, and
// its nominal "50 m" arteries measure 48 m. Assuming Barcelona's set for Murcia would be the L-529
// failure repeated: a confident root cause recorded as confirmed and demolished by one probe.
//
// THE TEST (identical to ADR-0275 §3, so the two are comparable): for each candidate quantum q,
// count measurements within ±0.6 m of q, and divide by the count expected from the LOCAL ±5 m
// neighbourhood density. ×1.0 = no clustering whatsoever.
//
// METHOD: tile the dense urban extent, fetch `Murcia:pgou_alineaciones` per tile ONCE, and measure
// every polygon in the tile against every other with the PRODUCTION `measureStreetWidths`. Every
// per-edge measurement counts (as ADR-0275 did), not just the governing one — the question is about
// the DISTRIBUTION of Murcia's street sections, not about any parcel's answer.
//
// Usage: npx tsx tools/murcia-street-width-probe/snapGate.mts

import { measureStreetWidths } from '../../packages/site-parcel-data/src/geometry/streetWidth.js';
import type { Pt } from '@pryzm/schemas';

const WFS = 'https://geoserver.murcia.es/geoserver/wfs';
const LAYER = 'Murcia:pgou_alineaciones';
const M_PER_DEG_LAT = 111_320;
/** Candidate quanta — ADR-0275's set, PLUS Murcia's own Art. 5.3.3 / 5.5.3 band edges (4, 8, 12). */
const QUANTA = [4, 5, 6, 8, 10, 12, 15, 16, 20, 25, 30, 40, 48, 50];
const HALF_WINDOW = 0.6;
const NEIGHBOURHOOD = 5;

/** Tile centres over Murcia's dense urban fabric (Casco, ensanches, Infante, Vistabella, Ranero). */
const TILES: ReadonlyArray<readonly [number, number]> = [
    [37.9922, -1.1307], [37.9885, -1.1290], [37.9880, -1.1360], [37.9945, -1.1345],
    [37.9860, -1.1240], [37.9905, -1.1220], [37.9950, -1.1250], [37.9835, -1.1300],
    [37.9820, -1.1370], [37.9975, -1.1300], [37.9990, -1.1380], [37.9800, -1.1250],
    [38.0015, -1.1240], [37.9860, -1.1420], [37.9930, -1.1430], [37.9760, -1.1310],
    [38.0040, -1.1330], [37.9790, -1.1180], [37.9700, -1.1450], [38.0100, -1.1400],
];
const TILE_HALF_DEG = 0.004;

async function getJson(url: string): Promise<any> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function tileUrl(lat: number, lon: number): string {
    const r = (n: number) => Number(n.toFixed(7));
    return `${WFS}?` + new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
        outputFormat: 'application/json', srsName: 'EPSG:4326', count: '3000',
        bbox: `${r(lat - TILE_HALF_DEG)},${r(lon - TILE_HALF_DEG)},${r(lat + TILE_HALF_DEG)},${r(lon + TILE_HALF_DEG)},urn:ogc:def:crs:EPSG::4326`,
    });
}

function outerRings(f: any, oLat: number, oLon: number): Pt[][] {
    const g = f?.geometry;
    if (!g) return [];
    const mLon = M_PER_DEG_LAT * Math.cos((oLat * Math.PI) / 180);
    const proj = (ring: any[]): Pt[] => ring
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => ({ x: (p[0] - oLon) * mLon, z: -(p[1] - oLat) * M_PER_DEG_LAT }));
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    const out: Pt[][] = [];
    for (const poly of polys) {
        const o = poly?.[0];
        if (!o) continue;
        const r = proj(o);
        if (r.length >= 3) out.push(r);
    }
    return out;
}

async function main() {
    const widths: number[] = [];
    let blocks = 0;
    for (const [lat, lon] of TILES) {
        let tile: any;
        try { tile = await getJson(tileUrl(lat, lon)); }
        catch (e) { process.stderr.write(`tile ${lat},${lon} failed: ${(e as Error).message}\n`); continue; }
        const feats = Array.isArray(tile?.features) ? tile.features : [];
        const rings = feats.flatMap((f: any) => outerRings(f, lat, lon));
        for (let i = 0; i < rings.length; i++) {
            const ours = rings[i]!;
            // Skip slivers: a ring under ~200 m² is not a manzana and its "frontages" are noise.
            const others = rings.filter((_, j) => j !== i);
            const res = measureStreetWidths(ours, others);
            if (res.measurements.length === 0) continue;
            blocks++;
            for (const m of res.measurements) widths.push(m.width_m);
        }
        process.stderr.write(`tile ${lat.toFixed(4)},${lon.toFixed(4)}: ${feats.length} feats → ${widths.length} widths\n`);
    }

    const n = widths.length;
    const inWindow = (lo: number, hi: number) => widths.filter((w) => w >= lo && w < hi).length;
    const rows = QUANTA.map((q) => {
        const hits = inWindow(q - HALF_WINDOW, q + HALF_WINDOW);
        const local = inWindow(q - NEIGHBOURHOOD, q + NEIGHBOURHOOD);
        // Expected count in the ±0.6 window if the ±5 m neighbourhood were uniform.
        const expected = local * ((2 * HALF_WINDOW) / (2 * NEIGHBOURHOOD));
        return { quantum: q, hits, localN: local, ratio: expected > 0 ? +(hits / expected).toFixed(2) : 0 };
    });

    const sorted = [...widths].sort((a, b) => a - b);
    const pct = (p: number) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!.toFixed(2);
    console.log(JSON.stringify({
        measuredAt: new Date().toISOString(),
        tiles: TILES.length, blocksMeasured: blocks, measurements: n,
        widthPercentiles: { p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
        clustering: rows,
        // ⚠ ADR-0275 §3's "within ±0.5 m of a round value" sanity check is NOT reproduced here, and
        // deliberately: at ±0.5 m the predicate |w − round(w)| ≤ 0.5 is TRUE FOR EVERY REAL NUMBER,
        // so it can only ever report 1.000. It was computed, returned exactly 1.000, and is dropped
        // rather than published as a finding — a statistic that cannot fail is not evidence.
        // The per-quantum ratios above carry the whole verdict.
    }, null, 2));
    process.stderr.write('\nquantum  hits  local  ratio\n');
    for (const r of rows) {
        process.stderr.write(
            `${String(r.quantum).padStart(6)}  ${String(r.hits).padStart(4)}  ${String(r.localN).padStart(5)}  ×${r.ratio}\n`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
