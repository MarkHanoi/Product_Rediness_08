// L-576 PROBE — the LIVE layer-4 (depth) number, and WHY the offline 91.4% does not describe it.
//
// ⚠ THE HYPOTHESIS THIS EXISTS TO TEST, STATED BEFORE THE RUN SO IT CAN LOSE.
// The L-539 offline sample deliberately ADMITTED ONLY manzanas lying strictly inside the WFS
// bbox with a margin (`probe-dissolve-fetch.mts`, EDGE_MARGIN_DEG) — it excluded truncated
// blocks as a sampling artefact, on the stated assumption that "production never has this
// problem: it centres the bbox on the subject parcel, so the manzana is comfortably interior."
//
// THAT ASSUMPTION IS ARITHMETICALLY QUESTIONABLE AT BARCELONA'S LATITUDE:
//   BLOCK_BBOX_HALF_DEG = 0.002° ⇒ ±222 m in latitude, but ±0.002 × 111320 × cos(41.39°)
//   = ±167 m in LONGITUDE. An Eixample illa is ~113 m square with 20 m chamfers, so its
//   diagonal is ~160 m. A subject parcel at one CORNER of its illa therefore sits ~160 m from
//   the opposite corner — inside the latitude half-width, but at the very edge of the longitude
//   one. Truncate the manzana and the parcels no longer tile a closed region, which is exactly
//   `open-or-disjoint`, i.e. `block-dissolve-refused` — the card the founder hit three times.
//
// So this probe does NOT re-run the offline sample. It replicates the PRODUCTION path per refcat
// (GetParcel centroid → one bbox query → manzana-prefix filter → dissolve) and additionally
// measures, for every parcel, how close the returned manzana comes to the bbox edge. If the
// failures cluster on bbox-touching manzanas, the dissolve is not the bug — the WINDOW is.
//
// ⚠ It reuses the PRODUCTION functions (`buildParcelBboxUrl`, `parseParcelCollectionGml`,
// `manzanaPrefix`, `BLOCK_BBOX_HALF_DEG`, `dissolveParcelsToBlockRing`) so it cannot disagree
// with the code path it diagnoses.
//
// Run:  npx tsx scratchpad/probe-l576-live-dissolve.mts

import {
    buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix, BLOCK_BBOX_HALF_DEG,
} from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';
import { writeFileSync } from 'node:fs';

const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

/** The PRODUCTION projection (`latLonToSceneXZ`), inlined — apps/editor is not importable here. */
function project(ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] {
    const cos0 = Math.cos(lat0 * DEG2RAD);
    return ring.map((p) => ({
        x: (p.lon - lon0) * DEG2RAD * EARTH_RADIUS_M * cos0,
        z: -(p.lat - lat0) * DEG2RAD * EARTH_RADIUS_M,
    }));
}

// Prime Eixample sampling points. The two named refcats the founder hit live are seeded first so
// the probe must reproduce the reported failure before any rate it reports can be believed.
const SEED_REFCATS = ['0627611DF3802H', '0422328DF3802C'];
const EIXAMPLE_POINTS: Array<[string, number, number]> = [
    ['Dreta de l\'Eixample', 41.3944, 2.1650],
    ['Rambla de Catalunya', 41.3900, 2.1640],
    ['Esquerra de l\'Eixample', 41.3860, 2.1580],
    ['Sagrada Família', 41.4040, 2.1740],
    ['Fort Pienc', 41.3980, 2.1810],
    ['Sant Antoni', 41.3800, 2.1600],
];

interface BboxParcel { refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2?: number }

async function fetchBbox(lat: number, lon: number): Promise<BboxParcel[]> {
    const res = await fetch(buildParcelBboxUrl(lat, lon));
    if (!res.ok) throw new Error(`bbox HTTP ${res.status}`);
    return parseParcelCollectionGml(await res.text()) as BboxParcel[];
}

/** Discover real refcats by asking the WFS what is actually there. */
async function discoverRefcats(): Promise<string[]> {
    const found = new Set<string>(SEED_REFCATS);
    for (const [name, lat, lon] of EIXAMPLE_POINTS) {
        try {
            const all = await fetchBbox(lat, lon);
            // One refcat per distinct manzana, so the sweep measures BLOCKS, not parcels — 40
            // parcels of one illa would otherwise count that illa 40 times and swamp the rate.
            const perManzana = new Map<string, string>();
            for (const p of all) {
                const m = manzanaPrefix(p.refcat);
                if (m && !perManzana.has(m)) perManzana.set(m, p.refcat);
            }
            for (const r of perManzana.values()) found.add(r);
            console.log(`  discovered ${perManzana.size} manzana(s) at ${name}`);
        } catch (e) {
            console.warn(`  ✖ discovery failed at ${name}: ${(e as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 400)); // be polite to Catastro
    }
    return [...found];
}

interface Row {
    refcat: string; manzana: string;
    outcome: 'ok' | 'block-unavailable' | 'too-few-parcels' | 'block-dissolve-refused' | 'upstream-error';
    reason: string | null;
    parcels: number; bboxParcels: number;
    /** Minimum distance (m) from any manzana vertex to the bbox edge. Small ⇒ likely TRUNCATED. */
    edgeMarginM: number | null;
    touchesBbox: boolean;
    path: string | null; splitCount: number | null; maxOffsetM: number | null;
    ringAreaM2: number | null; parcelAreaSumM2: number | null;
}

async function probeRefcat(refcat: string): Promise<Row> {
    const manzana = manzanaPrefix(refcat);
    const base: Row = {
        refcat, manzana, outcome: 'upstream-error', reason: null, parcels: 0, bboxParcels: 0,
        edgeMarginM: null, touchesBbox: false, path: null, splitCount: null, maxOffsetM: null,
        ringAreaM2: null, parcelAreaSumM2: null,
    };
    // Step 1 — the subject parcel's centroid (production's GetParcel leg).
    let lat: number, lon: number;
    try {
        const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
        const r = await fetch(url);
        const parsed = parseParcelCollectionGml(await r.text()) as BboxParcel[];
        const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0];
        if (!self || self.ring.length < 3) return { ...base, outcome: 'block-unavailable', reason: 'self-parcel-unresolved' };
        lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;
    } catch (e) {
        return { ...base, reason: `self-fetch: ${(e as Error).message}` };
    }

    // Step 2 — the ONE bbox query production makes, and the manzana-prefix filter.
    let all: BboxParcel[];
    try {
        all = await fetchBbox(lat, lon);
    } catch (e) {
        return { ...base, reason: `bbox: ${(e as Error).message}` };
    }
    const parcels = all.filter((p) => manzanaPrefix(p.refcat) === manzana);

    // ⚠ THE TRUNCATION MEASUREMENT — how close does this manzana come to the WINDOW edge?
    const halfLatM = BLOCK_BBOX_HALF_DEG * 111_320;
    const halfLonM = BLOCK_BBOX_HALF_DEG * 111_320 * Math.cos(lat * DEG2RAD);
    let edgeMarginM = Infinity;
    for (const p of parcels) {
        for (const v of p.ring) {
            const dxM = Math.abs(v.lon - lon) * 111_320 * Math.cos(lat * DEG2RAD);
            const dzM = Math.abs(v.lat - lat) * 111_320;
            edgeMarginM = Math.min(edgeMarginM, halfLonM - dxM, halfLatM - dzM);
        }
    }
    const margin = Number.isFinite(edgeMarginM) ? edgeMarginM : null;
    // Within 2 m of the window edge ⇒ the manzana was almost certainly CLIPPED by our own bbox.
    const touchesBbox = margin !== null && margin < 2;

    const withCounts = { ...base, parcels: parcels.length, bboxParcels: all.length, edgeMarginM: margin, touchesBbox };
    if (parcels.length < 3) return { ...withCounts, outcome: 'too-few-parcels', reason: `only ${parcels.length}` };

    // Step 3 — the production dissolve, on the production projection.
    const rings = parcels.map((p) => project(p.ring, lat, lon));
    const d = dissolveParcelsToBlockRing(rings);
    const q = d.quality;
    const shoelace = (r: ReadonlyArray<Pt>): number => {
        let a = 0;
        for (let i = 0; i < r.length; i++) {
            const p = r[i]!, n = r[(i + 1) % r.length]!;
            a += p.x * n.z - n.x * p.z;
        }
        return Math.abs(a) / 2;
    };
    const parcelAreaSum = rings.reduce((s, r) => s + shoelace(r), 0);
    return {
        ...withCounts,
        outcome: d.degenerate ? 'block-dissolve-refused' : 'ok',
        reason: d.reason,
        path: q.path, splitCount: q.splitCount, maxOffsetM: q.maxOffset_m,
        ringAreaM2: d.degenerate ? null : shoelace(d.ring),
        parcelAreaSumM2: parcelAreaSum,
    };
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log('L-576 — discovering real Eixample refcats…');
const refcats = await discoverRefcats();
console.log(`\nSweeping ${refcats.length} manzana(s) through the PRODUCTION path…\n`);

const rows: Row[] = [];
for (const r of refcats) {
    try {
        const row = await probeRefcat(r);
        rows.push(row);
        const mark = row.outcome === 'ok' ? '✔' : '✖';
        console.log(
            `${mark} ${row.refcat} ${row.manzana} — ${row.outcome}` +
            `${row.reason ? ` (${row.reason})` : ''} · ${row.parcels}/${row.bboxParcels} parcels` +
            `${row.edgeMarginM !== null ? ` · edge margin ${row.edgeMarginM.toFixed(1)} m${row.touchesBbox ? ' ⚠TRUNCATED' : ''}` : ''}`,
        );
    } catch (e) {
        console.warn(`✖ ${r} threw: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 400));
}

// ── the table the founder asked for ──────────────────────────────────────────
const n = rows.length;
const ok = rows.filter((r) => r.outcome === 'ok');
const by = (o: Row['outcome']) => rows.filter((r) => r.outcome === o).length;
const pct = (k: number) => `${((k / Math.max(n, 1)) * 100).toFixed(1)}%`;

console.log(`\n${'─'.repeat(78)}\nLAYER 4 — DEPTH CONSTRUCTED, LIVE (n=${n} manzanas)\n${'─'.repeat(78)}`);
console.log(`  ok (block ring constructed) : ${ok.length}  ${pct(ok.length)}`);
console.log(`  block-dissolve-refused      : ${by('block-dissolve-refused')}  ${pct(by('block-dissolve-refused'))}`);
console.log(`  too-few-parcels             : ${by('too-few-parcels')}  ${pct(by('too-few-parcels'))}`);
console.log(`  block-unavailable           : ${by('block-unavailable')}  ${pct(by('block-unavailable'))}`);
console.log(`  upstream-error              : ${by('upstream-error')}  ${pct(by('upstream-error'))}`);

const reasons = new Map<string, number>();
for (const r of rows) if (r.outcome !== 'ok') reasons.set(r.reason ?? '(null)', (reasons.get(r.reason ?? '(null)') ?? 0) + 1);
console.log('\n  dominant failure reason:');
for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}`);

// ⚠ THE HYPOTHESIS TEST — does failure correlate with our own bbox clipping the manzana?
const trunc = rows.filter((r) => r.touchesBbox);
const truncFail = trunc.filter((r) => r.outcome !== 'ok').length;
const intact = rows.filter((r) => r.edgeMarginM !== null && !r.touchesBbox);
const intactFail = intact.filter((r) => r.outcome !== 'ok').length;
console.log(`\n  BBOX-TRUNCATION TEST (the stated hypothesis):`);
console.log(`    manzanas touching the bbox edge : ${trunc.length} — ${truncFail} failed (${trunc.length ? ((truncFail / trunc.length) * 100).toFixed(1) : '—'}%)`);
console.log(`    manzanas fully inside the bbox  : ${intact.length} — ${intactFail} failed (${intact.length ? ((intactFail / intact.length) * 100).toFixed(1) : '—'}%)`);
console.log(`    ⇒ ${trunc.length && intact.length
    ? (truncFail / Math.max(trunc.length, 1) > intactFail / Math.max(intact.length, 1) + 0.2
        ? 'SUPPORTED — the WINDOW is clipping blocks, the dissolve is reporting it correctly.'
        : 'NOT SUPPORTED — truncation does not explain the failures. Look elsewhere.')
    : 'INCONCLUSIVE — one of the two groups is empty.'}`);

console.log('\n  seeded refcats the founder hit live:');
for (const s of SEED_REFCATS) {
    const r = rows.find((x) => x.refcat === s);
    console.log(`    ${s}: ${r ? `${r.outcome} (${r.reason}) margin=${r.edgeMarginM?.toFixed(1)} m truncated=${r.touchesBbox}` : 'NOT REACHED'}`);
}

writeFileSync(new URL('./l576-live-dissolve.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('\nrows → scratchpad/l576-live-dissolve.json');
