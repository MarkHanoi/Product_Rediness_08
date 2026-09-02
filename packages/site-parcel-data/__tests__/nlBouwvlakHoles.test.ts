// §NL-BOUWVLAK-HOLES (L-12896 / matrix-west finding D3) — a Dutch bouwvlak with an inner
// COURTYARD must never be drawn buildable over the courtyard.
//
// THE DEFECT: `extractOuterRing` in `resolveNlBestemmingsplan.ts` kept ONLY the outer ring of the
// bouwvlak (Polygon → `coords[0]`; MultiPolygon → `coords[0][0]` — the FIRST part's outer only),
// while the engine's §MULTI-PART-EXPLICIT-AREA seat (`explicitAreaFootprintParts`) already carries
// parts WITH holes. A bouwvlak hole is a published "do not build here" (`explicitArea.ts:77–84`);
// dropping it drew the courtyard buildable — the exact L-616 OVERSTATE direction, on a LIVE,
// SIGNED route (`NL_BESTEMMINGSPLAN_CERTIFIED` is ON). Extra-part drop merely understated.
//
// FIXTURE HONESTY: no recorded live PDOK response with a courtyard bouwvlak exists in the repo's
// probes (the §NL-NATIONWIDE live proofs recorded plan ids + vertex counts, not ring bodies), so
// the fixtures below are SYNTHETIC, honestly labelled, in the proxy's EXACT consolidated shape
// (`{ plan, bestemmingsvlak, bouwvlak: { geometrie: <GeoJSON> }, maatvoeringen }` — see
// `server/jurisdiction/nlBestemmingsplanProxy.js`, which forwards the PDOK feature's `geometry`
// VERBATIM, interior rings and MultiPolygon parts included: the drop was purely client-side).
// GeoJSON as PDOK serves it: `[lon, lat]` pairs, closing vertex repeated, holes as `coordinates[1..]`.
//
// WHAT "FIXED" MEANS HERE (engine untouched — its behaviour is the contract):
//   • a courtyard hole that BITES the parcel  → §K1-CARVE (lane K1): the engine CARVES it
//     exactly via §K1-POLY-DIFFERENCE (`polygonDifference.ts`) — the solved area EXCLUDES the
//     hole (outer − courtyard, short only of the inward-biased bridge slit). This arm originally
//     accepted the interim `hole-intersects-parcel` REFUSAL; that refusal remains ONLY as the
//     fallback for the carve's own refusal cases (malformed hole, unresolvable topology), where
//     drawing anything would overstate (C58 §1.4).
//   • a courtyard hole AWAY from the parcel   → exact clip, area unchanged (no over-refusal).
//   • a multi-part bouwvlak                   → ALL parts forwarded; parts that miss the parcel
//     are proven disjoint, parts that reach it clip exactly (previously: parts beyond the first
//     were silently dropped — an understate).

import { describe, it, expect } from 'vitest';
import type { ParcelEdgeClassification, Pt, ZoningRecord } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    resolveNlBestemmingsplan,
    NL_RING_REF,
    NL_ZONE_CODE,
    NL_JURISDICTION_ID,
    NL_BESTEMMINGSPLAN_PACK,
} from '../src/index.js';

// ── The shared frame: a local equirectangular map about (LAT0, LON0). ─────────────────────────
// The SCALE is arbitrary (the engine is unit-agnostic); what matters is that the parcel and the
// footprint share ONE frame, exactly as the dispatcher guarantees via `toAuthoringFrame`.
const LAT0 = 52.36;
const LON0 = 4.9;
const SCALE = 1e5;

/** (u, v) local metres → the WGS84 `[lon, lat]` pair PDOK would serve. */
const geo = (u: number, v: number): [number, number] => [LON0 + u / SCALE, LAT0 + v / SCALE];
/** WGS84 → the authoring frame (mirror of the dispatcher's equirect + θ=0 identity). */
const toXZ = (ll: { lat: number; lon: number }): Pt => ({
    x: (ll.lon - LON0) * SCALE,
    z: -((ll.lat - LAT0) * SCALE),
});
/** A closed GeoJSON ring (closing vertex repeated, as the WMS serves it) from (u,v) rects. */
const gRing = (uv: Array<[number, number]>): number[][] => {
    const ring = uv.map(([u, v]) => geo(u, v));
    ring.push([...ring[0]!]);
    return ring;
};
const rectUv = (u0: number, v0: number, u1: number, v1: number): Array<[number, number]> => [
    [u0, v0], [u1, v0], [u1, v1], [u0, v1],
];
/** A parcel rect directly in the authoring frame (z = −v). */
const parcelRect = (u0: number, v0: number, u1: number, v1: number): Pt[] => [
    { x: u0, z: -v0 }, { x: u1, z: -v0 }, { x: u1, z: -v1 }, { x: u0, z: -v1 },
];
const UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

// ── The courtyard bouwvlak: 100 × 100 outer, 30 × 30 interior courtyard. ──────────────────────
const OUTER_UV = rectUv(0, 0, 100, 100);        // 10,000 m²
const COURTYARD_UV = rectUv(35, 35, 65, 65);    //    900 m² — published "do not build here"
const OUTER_AREA = 10_000;
const COURTYARD_AREA = 900;
const HONEST_CEILING = OUTER_AREA - COURTYARD_AREA; // 9,100 m² — the most any solve may grant

/** The consolidated proxy body, in the server's exact output shape, with a raw GeoJSON geometry. */
const bodyWithBouwvlak = (geometrie: unknown) => ({
    plan: { id: 'NL.IMRO.9999.courtyardfixture', naam: 'Synthetic courtyard fixture (L-12896)' },
    bestemmingsvlak: { naam: 'Wonen' },
    bouwvlak: { geometrie },
    maatvoeringen: [{ naam: 'maximum bouwhoogte (m)', waarde: '15' }],
});

const PT = { lat: 52.3605, lon: 4.9005 }; // inside the fixture's outer ring

const fakeFetch = (body: unknown): typeof fetch =>
    (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

// ── The dispatcher mirror — what siteDispatch.ts forwards to the engine seat. ─────────────────
type LL = { readonly lat: number; readonly lon: number };
type Part = { readonly outer: readonly LL[]; readonly holes: ReadonlyArray<readonly LL[]> };

/**
 * MIRRORS the NL engine seat in `apps/editor/src/ui/site/siteDispatch.ts` — keep in lock-step.
 * ⚠ The `?? outer-only` fallback is DELIBERATE and load-bearing: it reproduces what a reader that
 * has not heard of parts does (the pre-fix wiring — first outer ring, holes + extra parts dropped),
 * so the courtyard arm goes RED naming the OVERSTATED AREA if the provider ever stops emitting
 * `ringPartsLatLon`, instead of dying on a TypeError.
 */
function forwardedParts(res: { readonly ok: true }): Array<{ outer: Pt[]; holes: Pt[][] }> {
    const shape = res as unknown as {
        ringPartsLatLon?: ReadonlyArray<Part>;
        ringLatLon?: readonly LL[]; // the PRE-FIX shape (outer ring of the first part only)
    };
    const parts: readonly Part[] = Array.isArray(shape.ringPartsLatLon)
        ? shape.ringPartsLatLon
        : shape.ringLatLon
          ? [{ outer: shape.ringLatLon, holes: [] }]
          : [];
    return parts.map((p) => ({
        outer: p.outer.map(toXZ),
        holes: p.holes.map((h) => h.map(toXZ)),
    }));
}

/** The NL zoning record the dispatcher builds (shape mirrored; only what the clip touches). */
const nlRecord = (): ZoningRecord =>
    ({
        zoneCode: NL_ZONE_CODE,
        zoneLabel: 'Bestemmingsplan — Wonen',
        jurisdictionId: NL_JURISDICTION_ID,
        structuredFields: {
            maxHeight_m: 15,
            maxFloors: null,
            maxCoverage: null,
            plotRatioFAR: null,
            permittedUse: ['residential'],
        },
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'nl-pdok-rp-wms',
            label: 'Synthetic courtyard fixture (L-12896)',
            version: 'NL.IMRO.9999.courtyardfixture',
            license: null,
            crs: 'EPSG:4326',
        },
    }) as unknown as ZoningRecord;

const solveWith = (
    parcel: Pt[],
    footprint:
        | { readonly explicitAreaFootprintParts: Array<{ outer: Pt[]; holes: Pt[][] }> }
        | { readonly explicitAreaFootprint: Pt[] },
) =>
    computeBuildableEnvelope({
        parcelRing: parcel,
        edgeClassifications: UNCLASSIFIED,
        zoning: nlRecord(),
        rulePack: NL_BESTEMMINGSPLAN_PACK,
        ...footprint,
    });

describe('§NL-BOUWVLAK-HOLES (L-12896) — courtyard holes are carried, never dropped', () => {
    it('ARM A — the provider preserves the interior ring (the courtyard) as a hole', async () => {
        const geometrie = { type: 'Polygon', coordinates: [gRing(OUTER_UV), gRing(COURTYARD_UV)] };
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, {
            fetchImpl: fakeFetch(bodyWithBouwvlak(geometrie)),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.ringSource).toBe('bouwvlak');
        expect(res.ringPartsLatLon).toHaveLength(1);
        expect(res.ringPartsLatLon[0]!.outer).toHaveLength(4); // closing vertex dropped
        expect(res.ringPartsLatLon[0]!.holes).toHaveLength(1); // ⚠ the courtyard SURVIVES
        expect(res.ringPartsLatLon[0]!.holes[0]).toHaveLength(4);
        // WGS84, unprojected (honesty property 2) — the hole's first vertex round-trips.
        const [lon, lat] = geo(35, 35);
        expect(res.ringPartsLatLon[0]!.holes[0]![0]).toEqual({ lat, lon });
    });

    it('ARM B ⛔ THE COURTYARD ARM — the live forwarding never draws buildable area over the courtyard', async () => {
        const geometrie = { type: 'Polygon', coordinates: [gRing(OUTER_UV), gRing(COURTYARD_UV)] };
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, {
            fetchImpl: fakeFetch(bodyWithBouwvlak(geometrie)),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // The parcel CONTAINS the whole bouwvlak — courtyard included (a block-lot parcel).
        const parcel = parcelRect(-10, -10, 110, 110);
        const env = solveWith(parcel, { explicitAreaFootprintParts: forwardedParts(res) });
        // §K1-CARVE — the engine now carves the courtyard EXACTLY (§K1-POLY-DIFFERENCE): the
        // interim honest refusal this arm used to accept became the honest ANSWER. The area is
        // outer minus courtyard, short only of the inward-biased bridge slit (millimetres wide ×
        // the hole→boundary corridor — sub-1 m² here, and ALWAYS a loss, never a gain).
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeLessThanOrEqual(HONEST_CEILING + 1e-6); // never over the ceiling
        expect(env.insetAreaM2).toBeGreaterThanOrEqual(HONEST_CEILING - 1); // and carve-exact
    });

    it('ARM C — the defect magnitude, pinned: the outer-only (pre-fix) feed overstates by EXACTLY the courtyard', () => {
        // This arm feeds the engine what the PRE-FIX wiring forwarded (first outer ring, hole
        // dropped) and passes before AND after the fix — it is the permanent record of WHY the
        // forwarding matters: 10,000 m² drawn where the honest ceiling is 9,100 m².
        const outerOnly = OUTER_UV.map(([u, v]) => {
            const [lon, lat] = geo(u, v);
            return toXZ({ lat, lon });
        });
        const parcel = parcelRect(-10, -10, 110, 110);
        const env = solveWith(parcel, { explicitAreaFootprint: outerOnly });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(OUTER_AREA, 3); // courtyard INCLUDED — the defect
        expect(env.insetAreaM2 - HONEST_CEILING).toBeCloseTo(COURTYARD_AREA, 3); // overstated by 900 m²
    });

    it('ARM D — a MultiPolygon bouwvlak keeps ALL parts (part 2 used to be silently dropped)', async () => {
        const geometrie = {
            type: 'MultiPolygon',
            coordinates: [
                [gRing(rectUv(0, 0, 40, 40))],   // part 1 — 1,600 m²
                [gRing(rectUv(60, 0, 100, 40))], // part 2 — 1,600 m² (pre-fix: DROPPED)
            ],
        };
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, {
            fetchImpl: fakeFetch(bodyWithBouwvlak(geometrie)),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.ringPartsLatLon).toHaveLength(2);
        // A parcel over part 2 ONLY: pre-fix this refused `no-overlap` (part 2 was gone —
        // an understate); with parts forwarded it clips exactly.
        const parcel = parcelRect(55, -5, 105, 45);
        const env = solveWith(parcel, { explicitAreaFootprintParts: forwardedParts(res) });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(1600, 3); // part 2 ∩ parcel, exact
    });

    it('ARM E — a courtyard that does NOT reach the parcel costs nothing (no over-refusal)', async () => {
        const geometrie = { type: 'Polygon', coordinates: [gRing(OUTER_UV), gRing(COURTYARD_UV)] };
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, {
            fetchImpl: fakeFetch(bodyWithBouwvlak(geometrie)),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // A lot on the west band of the block — the courtyard (u ∈ [35,65]) never touches it.
        const parcel = parcelRect(-10, -10, 20, 110);
        const env = solveWith(parcel, { explicitAreaFootprintParts: forwardedParts(res) });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(2000, 3); // outer ∩ parcel = 20 × 100, exact
    });

    it('ARM F — the §NL-SPARSE-FALLBACK zone extent carries its holes too', async () => {
        // The bestemmingsvlak is drawn as an UPPER BOUND when no bouwvlak is published; a hole in
        // the ZONE geometry is equally a published exclusion and gets the same parts treatment.
        const body = {
            plan: { id: 'NL.IMRO.9999.courtyardfixture', naam: 'Synthetic courtyard fixture (L-12896)' },
            bestemmingsvlak: {
                naam: 'Wonen',
                geometrie: { type: 'Polygon', coordinates: [gRing(OUTER_UV), gRing(COURTYARD_UV)] },
            },
            bouwvlak: null,
            maatvoeringen: [{ naam: 'maximum bouwhoogte (m)', waarde: '12' }],
        };
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl: fakeFetch(body) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.ringSource).toBe('bestemmingsvlak');
        expect(res.ringPartsLatLon).toHaveLength(1);
        expect(res.ringPartsLatLon[0]!.holes).toHaveLength(1);
    });
});
