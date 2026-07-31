// §L-456 — the MODEL-MEASUREMENT ADAPTER. What the panel is allowed to claim it measured.
//
// The assertions that matter here are not the arithmetic ones. They are the REFUSALS: an
// adapter that returns a plausible number when it cannot measure one is the exact failure this
// subsystem keeps repeating, and it is worse than a blank, because a plausible number gets
// judged and rendered as a verdict about a real building.
//
// So the load-bearing cases are:
//   • an empty project measures as NULL, never as 0 (0 would be judged `within` and read as a pass);
//   • GFA is summed from real plates and is NEVER footprint × storeys;
//   • overlapping plates are REFUSED, because summing them would double-count and the repo has
//     no polygon-union operation to resolve it;
//   • but abutting plates whose bounding boxes overlap are NOT refused — a coarse test would
//     make the adapter useless on the L-shaped plans it exists to serve;
//   • a storey the user created but never built on is not a designed storey.

import { describe, it, expect } from 'vitest';
import {
    collectAuthoredModelSnapshot,
    measureAuthoredDesign,
    ringsOverlap,
    HEIGHT_DATUM_CAVEAT,
    type AuthoredModelSnapshot,
} from '../designMeasurement';

// ── Fixtures — a two-storey house of the shape the house/apartment generators author ────────
// L0 ground 10 × 8 = 80 m²; L1 set back to 10 × 6 = 60 m². GFA 140 m², footprint 80 m².
// Deliberately NOT a prism: if the adapter ever reconstructed GFA as footprint × storeys it
// would report 160, and the `never footprint × storeys` test below would catch it.

const rect = (x0: number, z0: number, x1: number, z1: number) => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
];

function house(): AuthoredModelSnapshot {
    return {
        levels: [
            { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
            { id: 'L1', name: 'First', elevation: 3, height: 3 },
        ],
        floorPlates: [
            { levelId: 'L0', ring: rect(0, 0, 10, 8), holes: [] },
            { levelId: 'L1', ring: rect(0, 0, 10, 6), holes: [] },
        ],
        rooms: [
            { levelId: 'L0', areaM2: 30 },
            { levelId: 'L0', areaM2: 34 },
            { levelId: 'L1', areaM2: 48 },
        ],
        elementLevelIds: ['L0', 'L1'],
    };
}

const EMPTY: AuthoredModelSnapshot = {
    levels: [], floorPlates: [], rooms: [], elementLevelIds: [],
};

describe('L-456 measureAuthoredDesign — what it can truthfully measure', () => {
    it('measures storeys, height, GFA, footprint and net area off the authored model', () => {
        const m = measureAuthoredDesign(house());
        expect(m.design.floors).toBe(2);
        expect(m.design.heightM).toBeCloseTo(6, 6);       // top of L1 = 3 + 3
        expect(m.design.footprintM2).toBeCloseTo(80, 6);  // ground plate only
        expect(m.design.grossFloorAreaM2).toBeCloseTo(140, 6);
        expect(m.design.netFloorAreaM2).toBeCloseTo(112, 6);
        expect(m.designedStoreyCount).toBe(2);
        expect(Object.values(m.unmeasured).every((r) => r === null)).toBe(true);
    });

    it('subtracts authored holes from the plate area (a stair void is not built area)', () => {
        const s = house();
        const withHole: AuthoredModelSnapshot = {
            ...s,
            floorPlates: [
                { levelId: 'L0', ring: rect(0, 0, 10, 8), holes: [rect(1, 1, 3, 3)] },
                s.floorPlates[1]!,
            ],
        };
        const m = measureAuthoredDesign(withHole);
        expect(m.design.footprintM2).toBeCloseTo(76, 6);      // 80 − 4
        expect(m.design.grossFloorAreaM2).toBeCloseTo(136, 6);
    });

    it('always states the rasant caveat alongside a reported height (L-584)', () => {
        const m = measureAuthoredDesign(house());
        expect(m.caveats).toContain(HEIGHT_DATUM_CAVEAT);
        expect(HEIGHT_DATUM_CAVEAT).toMatch(/rasant at the fa/i);
    });
});

describe('L-456 — HONESTY RULE 3: measure, never infer', () => {
    // The single most dangerous defect this adapter could ship. An empty project has no
    // building; reporting 0 m² would be JUDGED as `within` against any ceiling and rendered as
    // a pass on a project with nothing in it — permission manufactured out of an empty model.
    it('an empty project measures NULL for every metric, never 0', () => {
        const m = measureAuthoredDesign(EMPTY);
        expect(m.design.footprintM2).toBeNull();
        expect(m.design.grossFloorAreaM2).toBeNull();
        expect(m.design.netFloorAreaM2).toBeNull();
        expect(m.design.heightM).toBeNull();
        expect(m.design.floors).toBeNull();
        expect(m.design.floors).not.toBe(0);
        expect(m.unmeasured.floors).toBe('no-authored-model');
    });

    it('NEVER reconstructs gross floor area as footprint × storeys', () => {
        const m = measureAuthoredDesign(house());
        const footprint = m.design.footprintM2!;
        const floors = m.design.floors!;
        expect(m.design.grossFloorAreaM2).not.toBeCloseTo(footprint * floors, 6);
        expect(m.design.grossFloorAreaM2).toBeCloseTo(140, 6);   // the real plates, summed
    });

    it('reports NULL gross floor area when no slabs are authored — it does not fall back', () => {
        const s = house();
        const m = measureAuthoredDesign({ ...s, floorPlates: [] });
        expect(m.design.grossFloorAreaM2).toBeNull();
        expect(m.design.footprintM2).toBeNull();
        expect(m.unmeasured.grossFloorAreaM2).toBe('no-floor-plates');
        // …but the metrics it CAN measure are still measured. A refusal is per-metric.
        expect(m.design.floors).toBe(2);
        expect(m.design.netFloorAreaM2).toBeCloseTo(112, 6);
    });

    it('reports NULL net area when no rooms are defined — it never derives it from GFA', () => {
        const m = measureAuthoredDesign({ ...house(), rooms: [] });
        expect(m.design.netFloorAreaM2).toBeNull();
        expect(m.unmeasured.netFloorAreaM2).toBe('no-rooms');
        expect(m.design.grossFloorAreaM2).toBeCloseTo(140, 6);
    });

    it('REFUSES to sum overlapping plates rather than double-count them', () => {
        const s = house();
        const overlapping: AuthoredModelSnapshot = {
            ...s,
            floorPlates: [
                { levelId: 'L0', ring: rect(0, 0, 10, 8), holes: [] },
                { levelId: 'L0', ring: rect(5, 4, 15, 12), holes: [] },   // shares interior area
                s.floorPlates[1]!,
            ],
        };
        const m = measureAuthoredDesign(overlapping);
        expect(m.design.grossFloorAreaM2).toBeNull();
        expect(m.design.footprintM2).toBeNull();
        expect(m.unmeasured.grossFloorAreaM2).toBe('overlapping-floor-plates');
    });

    it('does NOT refuse abutting plates that merely share a bounding box (no false refusal)', () => {
        // An L-shaped storey authored as two rectangles. Their AABBs overlap; their interiors
        // do not. A coarse bounding-box test would refuse here and make the adapter useless.
        const s = house();
        const lShaped: AuthoredModelSnapshot = {
            ...s,
            floorPlates: [
                { levelId: 'L0', ring: rect(0, 0, 10, 4), holes: [] },   // 40 m²
                { levelId: 'L0', ring: rect(0, 4, 6, 10), holes: [] },   // 36 m², abuts on z = 4
                s.floorPlates[1]!,
            ],
        };
        expect(ringsOverlap(rect(0, 0, 10, 4), rect(0, 4, 6, 10))).toBe(false);
        const m = measureAuthoredDesign(lShaped);
        expect(m.design.footprintM2).toBeCloseTo(76, 6);
        expect(m.unmeasured.footprintM2).toBeNull();
    });

    it('a storey the user created but never built on is NOT a designed storey', () => {
        const s = house();
        const withEmptyLevel: AuthoredModelSnapshot = {
            ...s,
            levels: [...s.levels, { id: 'L2', name: 'Second', elevation: 6, height: 3 }],
        };
        const m = measureAuthoredDesign(withEmptyLevel);
        expect(m.design.floors).toBe(2);          // not 3
        expect(m.design.heightM).toBeCloseTo(6, 6); // not 9
    });

    it('excludes a basement from the footprint — ocupación is the ground storey on the plot', () => {
        const s = house();
        const withBasement: AuthoredModelSnapshot = {
            levels: [{ id: 'B1', name: 'Basement', elevation: -3, height: 3 }, ...s.levels],
            floorPlates: [
                { levelId: 'B1', ring: rect(-2, -2, 12, 10), holes: [] },  // larger than ground
                ...s.floorPlates,
            ],
            rooms: s.rooms,
            elementLevelIds: ['B1', 'L0', 'L1'],
        };
        const m = measureAuthoredDesign(withBasement);
        expect(m.design.footprintM2).toBeCloseTo(80, 6);       // the GROUND plate, not the basement
        expect(m.design.grossFloorAreaM2).toBeCloseTo(140 + 168, 6); // basement still counts as built
        expect(m.design.floors).toBe(3);
    });

    it('refuses when a plate cannot be attributed to a storey', () => {
        const s = house();
        const m = measureAuthoredDesign({
            ...s,
            floorPlates: [...s.floorPlates, { levelId: null, ring: rect(20, 20, 24, 24), holes: [] }],
        });
        expect(m.design.grossFloorAreaM2).toBeNull();
        expect(m.unmeasured.grossFloorAreaM2).toBe('unattributed-floor-plate');
    });

    it('reports NULL height when the topmost designed storey carries no floor-to-floor height', () => {
        const s = house();
        const m = measureAuthoredDesign({
            ...s,
            levels: [s.levels[0]!, { id: 'L1', name: 'First', elevation: 3, height: null }],
        });
        expect(m.design.heightM).toBeNull();
        expect(m.unmeasured.heightM).toBe('no-storey-height');
        expect(m.caveats).not.toContain(HEIGHT_DATUM_CAVEAT);
    });
});

describe('L-456 collectAuthoredModelSnapshot — reading the live stores', () => {
    it('accepts BOTH shipped slab record shapes (legacy `polygon`, C11 `boundary`)', () => {
        const snap = collectAuthoredModelSnapshot({
            levels: { getLevels: () => [{ id: 'L0', name: 'Ground', elevation: 0, height: 3 }] },
            slabs: {
                getAll: () => [
                    // legacy SlabData — plan ring in `polygon`, second coord is world Z
                    { levelId: 'L0', polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }] },
                    // C11 Zod Slab — plan ring in `boundary`
                    { levelId: 'L0', boundary: [{ x: 10, y: 0, z: 0 }, { x: 14, y: 0, z: 0 }, { x: 14, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }] },
                ],
            },
            rooms: { getAll: () => [{ levelId: 'L0', computed: { area: 17 } }] },
            walls: { getAll: () => [{ levelId: 'L0' }] },
        });
        expect(snap.floorPlates).toHaveLength(2);
        const m = measureAuthoredDesign(snap);
        expect(m.design.footprintM2).toBeCloseTo(40, 6);   // 20 + 20, disjoint
        expect(m.design.netFloorAreaM2).toBeCloseTo(17, 6);
    });

    it('falls back to the authored room boundary when the store carries no computed area', () => {
        const snap = collectAuthoredModelSnapshot({
            levels: { getLevels: () => [{ id: 'L0', elevation: 0, height: 3 }] },
            rooms: {
                getAll: () => [
                    { levelId: 'L0', boundary: { polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }, { x: 0, z: 4 }] } },
                ],
            },
        });
        expect(measureAuthoredDesign(snap).design.netFloorAreaM2).toBeCloseTo(12, 6);
    });

    it('a throwing or absent store yields UNMEASURED, never a zero measurement', () => {
        const snap = collectAuthoredModelSnapshot({
            levels: { getLevels: () => [{ id: 'L0', elevation: 0, height: 3 }] },
            slabs: { getAll: () => { throw new Error('store not ready'); } },
            rooms: null,
            walls: { getAll: () => [{ levelId: 'L0' }] },
        });
        const m = measureAuthoredDesign(snap);
        expect(m.design.grossFloorAreaM2).toBeNull();
        expect(m.design.netFloorAreaM2).toBeNull();
        expect(m.design.grossFloorAreaM2).not.toBe(0);
        expect(m.design.floors).toBe(1);   // the wall still proves a storey was designed
    });
});
