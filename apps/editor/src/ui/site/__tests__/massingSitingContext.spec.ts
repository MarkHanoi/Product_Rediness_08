/**
 * §RESI-ORCH-MASSING-SHAPES — THE ONE ADAPTER BETWEEN THE LIVE SITE AND THE SHAPE ENGINE.
 *
 * ⭐ THE THREE PROPERTIES THIS SUITE EXISTS TO PIN, in the order they can hurt:
 *   1. **NEIGHBOURS ARE PROJECTED ABOUT THE PINNED SITE ORIGIN, NEVER THE FETCH CENTRE.** The
 *      snapshot carries the lat/lon the GIS view fetched AROUND — which for the 2-D map is the map
 *      centre and drifts as the user pans. Projecting about it would slide every neighbour by
 *      `dist(fetchCentre, siteOrigin)` — the §SEAM-2 / L-604 residual shift, re-committed one module
 *      downstream, where its only symptom would be an overlooking figure that is confidently wrong.
 *   2. **FOUR ABSENCES STAY FOUR ABSENCES.** No origin ≠ no snapshot ≠ an empty snapshot ≠ a
 *      neighbour with no height. Merging any pair of them is `§CONTEXT-DATA-HONESTY`.
 *   3. **A HEIGHT IS NEVER DEFAULTED.** `undefined` on the store becomes `null` here, explicitly,
 *      so the engine can exclude AND COUNT it rather than shade a façade with an invented 9 m slab.
 *
 * ⚠ `../siteDispatch` IS MOCKED WITH A FACTORY. Its real module graph reaches the whole
 * GIS/Cesium/command surface (~270 s of transform, measured 2026-09-06), and none of it is the
 * subject here: what is under test is THIS module's projection and its honesty arms, which take the
 * origin as a value. The mock is the seam, and it is the same seam production uses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const originCell: { value: { lat: number; lon: number } | null } = { value: null };

vi.mock('../siteDispatch', () => ({
    getCurrentSiteOrigin: () => originCell.value,
}));

import {
    setNeighbourFootprints,
    clearNeighbourFootprints,
} from '../neighbourFootprintStore';
import {
    __resetTargetFootprintProposalForTests,
    setTargetFootprintProposal,
} from '../targetFootprintAreaState';
import {
    resolveLiveMassingSitingContext,
    resolveLiveTargetGroundFloorAreaM2,
} from '../massingSitingContext';

/** Barcelona-ish. A tenth of a degree of longitude here is ~8.3 km — far enough to be obvious. */
const ORIGIN = { lat: 41.39, lon: 2.17 };

/** A small square building, in lon/lat, ~30 m east-north-east of the origin. */
function neighbourAt(dLon: number, dLat: number, heightM?: number, provenance?: string) {
    const ring = [
        [ORIGIN.lon + dLon, ORIGIN.lat + dLat],
        [ORIGIN.lon + dLon + 0.0002, ORIGIN.lat + dLat],
        [ORIGIN.lon + dLon + 0.0002, ORIGIN.lat + dLat + 0.0002],
        [ORIGIN.lon + dLon, ORIGIN.lat + dLat + 0.0002],
    ];
    return {
        geometry: { coordinates: [ring] },
        properties: {
            osmId: 1,
            ...(heightM !== undefined ? { heightM } : {}),
            ...(provenance !== undefined ? { heightProvenance: provenance } : {}),
        },
    };
}

beforeEach(() => {
    originCell.value = null;
    clearNeighbourFootprints();
    __resetTargetFootprintProposalForTests();
});

describe('resolveLiveMassingSitingContext', () => {
    it('⛔ returns null with NO site origin — a neighbour in the wrong frame is worse than none', () => {
        setNeighbourFootprints(ORIGIN.lat, ORIGIN.lon, { features: [neighbourAt(0.0003, 0.0003, 12)] });
        expect(resolveLiveMassingSitingContext()).toBeNull();
    });

    it('⛔ treats Null Island (0,0) as unset, not as a site off the coast of Ghana', () => {
        originCell.value = { lat: 0, lon: 0 };
        expect(resolveLiveMassingSitingContext()).toBeNull();
    });

    it('a site origin with NO snapshot is "we never looked", not "there is nobody there"', () => {
        originCell.value = { ...ORIGIN };
        const ctx = resolveLiveMassingSitingContext()!;
        expect(ctx).not.toBeNull();
        expect(ctx.neighbourSnapshotTaken).toBe(false);
        expect(ctx.neighbours).toEqual([]);
        expect(ctx.latDeg).toBe(ORIGIN.lat);
        expect(ctx.lngDeg).toBe(ORIGIN.lon);
    });

    it('an EMPTY captured snapshot is a MEASURED zero — the distinction the engine keys on', () => {
        originCell.value = { ...ORIGIN };
        setNeighbourFootprints(ORIGIN.lat, ORIGIN.lon, { features: [] });
        const ctx = resolveLiveMassingSitingContext()!;
        expect(ctx.neighbourSnapshotTaken).toBe(true);
        expect(ctx.neighbours).toEqual([]);
    });

    it('⭐ projects neighbours about the SITE ORIGIN, not the snapshot fetch centre', () => {
        originCell.value = { ...ORIGIN };
        // The snapshot was fetched around a point 0.01° (~830 m) east of the site origin — the
        // panned-2D-map case. The neighbour itself sits ~25 m east/north of the SITE origin.
        setNeighbourFootprints(ORIGIN.lat, ORIGIN.lon + 0.01, {
            features: [neighbourAt(0.0003, 0.0002, 12)],
        });
        const ctx = resolveLiveMassingSitingContext()!;
        expect(ctx.neighbours).toHaveLength(1);
        const p = ctx.neighbours[0]!.ring[0]!;
        // ~25 m east of the origin, ~22 m north ⇒ scene z is NEGATIVE (z = −North).
        expect(p.x).toBeGreaterThan(20);
        expect(p.x).toBeLessThan(30);
        expect(p.z).toBeLessThan(-15);
        expect(p.z).toBeGreaterThan(-30);
        // ⛔ Had it projected about the FETCH CENTRE, x would be ~−806 m. Pinned explicitly, because
        // this is the failure mode that produces a plausible number rather than an obvious one.
        expect(Math.abs(p.x)).toBeLessThan(100);
    });

    it('⛔ carries a KNOWN height through and turns an ABSENT one into an explicit null', () => {
        originCell.value = { ...ORIGIN };
        setNeighbourFootprints(ORIGIN.lat, ORIGIN.lon, {
            features: [
                neighbourAt(0.0003, 0.0002, 12, 'tagged'),
                neighbourAt(0.0006, 0.0002),            // no height at all
                neighbourAt(0.0009, 0.0002, 0),         // 0 is not a height, it is an absence
            ],
        });
        const ctx = resolveLiveMassingSitingContext()!;
        expect(ctx.neighbours.map((n) => n.heightM)).toEqual([12, null, null]);
    });
});

describe('resolveLiveTargetGroundFloorAreaM2 — ONE channel, and the staleness gate on it', () => {
    const proposal = {
        ok: true as const,
        ring: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 18 }, { x: 0, z: 18 }],
        achievedAreaM2: 179.4,
        targetAreaM2: 180,
        permittedAreaM2: 1000,
        insetM: 3.2,
        statement: 'test',
    };

    it('reads the number the USER ASKED FOR, not the area the erosion happened to achieve', () => {
        setTargetFootprintProposal(proposal);
        expect(resolveLiveTargetGroundFloorAreaM2(1000)).toBe(180);
    });

    it('is null when nothing has been proposed', () => {
        expect(resolveLiveTargetGroundFloorAreaM2(1000)).toBeNull();
    });

    it('⛔ a proposal solved against a DIFFERENT permitted footprint is withdrawn, not re-scaled', () => {
        setTargetFootprintProposal(proposal);
        expect(resolveLiveTargetGroundFloorAreaM2(610)).toBeNull();
    });

    it('is null when there is no permitted footprint to gate against', () => {
        setTargetFootprintProposal(proposal);
        expect(resolveLiveTargetGroundFloorAreaM2(null)).toBeNull();
    });
});
