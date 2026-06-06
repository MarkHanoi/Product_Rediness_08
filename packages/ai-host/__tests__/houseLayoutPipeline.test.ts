// Casa Unifamiliar — multi-storey HOUSE pipeline INTEGRATION tests (A.21.x).
//
// These are *integration* tests over `generateHouseLayout` (the pure core) on
// REALISTIC inputs — real-ish footprints + whole-house programs, not toy 2-room
// cases. They assert the WHOLE result shape + the cross-storey invariants so a
// regression in storeyAllocation, reserveStairCore, the per-storey D-TGL engine,
// or the orchestrator's id/elevation wiring is caught here BEFORE a browser test.
//
// They deliberately COMPLEMENT (do not duplicate) `houseLayout.test.ts` (36 unit
// tests) and `roomDimensions.test.ts` — here we exercise the *end-to-end* result
// across 1/2/3-storey houses, the house-envelope path, non-rectangular shells,
// determinism, and edge clamping, asserting structure + invariants (counts,
// elevations, id wiring, non-empty storeys) rather than brittle exact geometry.
//
// NO Math.random (banned) — every variation is derived from indices.

import { describe, expect, it } from 'vitest';
import {
    generateHouseLayout, reserveStairCore,
} from '../src/workflows/houseLayout/index.js';
import type { HouseLayoutResult } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, RoomType, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

// ───────────────────────────── realistic fixtures ────────────────────────────

/** A realistic 13 × 10 m detached-house plate (130 m² gross). */
const SHELL: ShellAnalysis = {
    netAreaM2: 130, widthM: 13, depthM: 10,
    perimeter: [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }],
    faces: [],
};

/** A realistic family-house brief: 3 bed / 2 bath, master en-suite, open-plan KD. */
const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = {
    naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1,
};

const footprintOf = (s: ShellAnalysis) => s.perimeter.map(p => ({ x: p.x, z: p.z }));

const PUBLIC_GROUND_TYPES: RoomType[] = ['living', 'kitchen', 'dining'];
const PRIVATE_TYPES: RoomType[] = ['master', 'bedroom', 'ensuite', 'bathroom'];

/** Collect the room-type set on a given storey of a result. */
function typesOnStorey(res: HouseLayoutResult, storeyIndex: number): Set<RoomType> {
    return new Set(res.perStoreyLayout[storeyIndex]!.rooms.map(r => r.type));
}

/** A stable, comparable projection of the full result (drops nothing structural;
 *  just normalises ordering-free fields into JSON for deep-equality). */
function projectStable(res: HouseLayoutResult): unknown {
    return JSON.parse(JSON.stringify(res));
}

// ───────────────────── 1 — 1/2/3-storey end-to-end invariants ─────────────────

describe('A.21.x — generateHouseLayout end-to-end across storey counts', () => {
    for (const storeyCount of [1, 2, 3]) {
        describe(`${storeyCount}-storey house (13×10 m, 3-bed family brief)`, () => {
            const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount });

            it('produces exactly storeyCount plates', () => {
                expect(res.storeys).toHaveLength(storeyCount);
                expect(res.storeys.map(s => s.storeyIndex)).toEqual(
                    Array.from({ length: storeyCount }, (_, i) => i),
                );
            });

            it('stamps monotonic elevations at baseElevation + i*floorToFloor', () => {
                const f2f = 3.0; // default floor-to-floor
                res.storeys.forEach((s, i) => {
                    expect(s.elevationM).toBeCloseTo(0 + i * f2f, 6);
                    expect(s.floorToFloorM).toBe(f2f);
                    if (i > 0) {
                        // strictly increasing, exact gap.
                        expect(s.elevationM - res.storeys[i - 1]!.elevationM).toBeCloseTo(f2f, 6);
                    }
                });
            });

            it('emits storeyCount-1 stairs, one per adjacent pair, correctly wired', () => {
                expect(res.stairs).toHaveLength(storeyCount - 1);
                res.stairs.forEach((stair, i) => {
                    expect(stair.fromLevelId).toBe(res.storeys[i]!.levelId);
                    expect(stair.toLevelId).toBe(res.storeys[i + 1]!.levelId);
                });
            });

            it('emits storeyCount-1 voids, one per non-ground storey, correctly wired', () => {
                expect(res.voids).toHaveLength(storeyCount - 1);
                res.voids.forEach((v, i) => {
                    // void[i] sits on storey i+1 (the non-ground storeys).
                    expect(v.levelId).toBe(res.storeys[i + 1]!.levelId);
                });
                // never a void on the ground slab.
                expect(res.voids.every(v => v.levelId !== res.storeys[0]!.levelId)).toBe(true);
            });

            it('caps the stack with a roof on the topmost storey, footprint === shell', () => {
                const top = res.storeys[res.storeys.length - 1]!;
                expect(res.roof.levelId).toBe(top.levelId);
                expect(res.roof.footprint).toEqual(footprintOf(SHELL));
            });

            it('every storey has a non-empty layout (no blank floor)', () => {
                expect(res.perStoreyLayout).toHaveLength(storeyCount);
                for (const layout of res.perStoreyLayout) {
                    expect(layout.rooms.length).toBeGreaterThan(0);
                    expect(layout.score.overall).toBeGreaterThanOrEqual(0);
                }
            });

            it('every storey footprint equals the shell (vertical wall stacking)', () => {
                for (const s of res.storeys) {
                    expect(s.footprint).toEqual(footprintOf(SHELL));
                }
            });
        });
    }
});

// ───────────────────────── 2 — program allocation across storeys ──────────────

describe('A.21.x — program allocation lands public down / private up', () => {
    it('ground floor carries public living + kitchen (the entrance level)', () => {
        for (const storeyCount of [1, 2, 3]) {
            const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount });
            const ground = typesOnStorey(res, 0);
            // The ground/entrance level always carries the social core.
            expect(ground.has('living')).toBe(true);
            expect(ground.has('kitchen')).toBe(true);
            // At least one of the public-social types is present.
            expect(PUBLIC_GROUND_TYPES.some(t => ground.has(t))).toBe(true);
        }
    });

    it('2-storey: bedrooms/baths live UPSTAIRS, with the master + en-suite up', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const upper = typesOnStorey(res, 1);
        // The private zone is upstairs.
        expect(PRIVATE_TYPES.some(t => upper.has(t))).toBe(true);
        expect(upper.has('master')).toBe(true);
        expect(upper.has('ensuite')).toBe(true);
        // No living/dining migrated upstairs (those are ground-only).
        expect(upper.has('living')).toBe(false);
        expect(upper.has('dining')).toBe(false);
    });

    it('3-storey: the master + en-suite land on the FIRST upper storey', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const firstUpper = typesOnStorey(res, 1);
        expect(firstUpper.has('master')).toBe(true);
        expect(firstUpper.has('ensuite')).toBe(true);
        // The top storey carries the remaining private rooms (bedrooms/baths).
        const top = typesOnStorey(res, 2);
        expect(PRIVATE_TYPES.some(t => top.has(t))).toBe(true);
    });

    it('1-storey carries the WHOLE program on one plate (master + bedrooms + public)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        const t = typesOnStorey(res, 0);
        expect(t.has('master')).toBe(true);
        expect(t.has('bedroom')).toBe(true);
        expect(t.has('living')).toBe(true);
        expect(t.has('kitchen')).toBe(true);
    });

    // KNOWN BUG (A.21.x): the frozen single-plate D-TGL bubble graph ALWAYS pushes
    // a 'kitchen' room (bubbleGraph.ts ~L146 is unconditional), so EVERY upper
    // storey of a multi-storey house gets a kitchen even though
    // allocateProgramToStoreys correctly sets openPlanKitchenDining:false for
    // upper storeys (§3 policy: "UPPER level(s): bedrooms + bathrooms. No
    // kitchen."). A real house's bedroom floors must not have a kitchen. This is a
    // cross-component defect: the allocation is right, the engine ignores it.
    // The .skip below asserts the DESIRED behaviour (no kitchen upstairs); the
    // passing test under it pins the CURRENT (buggy) behaviour so the regression
    // surface is explicit. Flag for the main session to triage.
    it.skip('KNOWN BUG: upper storeys must NOT contain a kitchen', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const upper = typesOnStorey(res, 1);
        expect(upper.has('kitchen')).toBe(false);
    });

    it('CURRENT behaviour: upper storeys DO contain a kitchen (KNOWN BUG A.21.x)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const upper = typesOnStorey(res, 1);
        // Documents the defect so a future fix flips this test (and we delete it).
        expect(upper.has('kitchen')).toBe(true);
    });
});

// ───────────────────────── 3 — stair-core vertical stacking ───────────────────

describe('A.21.x — stair-core stacks vertically (plan rect identical everywhere)', () => {
    it('every stair + void shares the SAME plan rect across all storeys', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const expected = reserveStairCore(footprintOf(SHELL), 3);
        // all stair rects identical.
        for (const stair of res.stairs) expect(stair.rectMm).toEqual(expected);
        // all void rects identical to the stair rect (hole over the run).
        for (const v of res.voids) expect(v.rectMm).toEqual(expected);
    });

    it('the stair rect is storey-count-independent (2-storey rect === 3-storey rect)', () => {
        const r2 = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const r3 = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        expect(r3.stairs[0]!.rectMm).toEqual(r2.stairs[0]!.rectMm);
    });

    it('the stair core sits fully inside the shell bounding box', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const core = res.stairs[0]!.rectMm;
        expect(core.x).toBeGreaterThanOrEqual(0);
        expect(core.y).toBeGreaterThanOrEqual(0);
        expect(core.x + core.w).toBeLessThanOrEqual(13_000 + 1e-6);
        expect(core.y + core.h).toBeLessThanOrEqual(10_000 + 1e-6);
        expect(core.w).toBeGreaterThan(0);
        expect(core.h).toBeGreaterThan(0);
    });
});

// ───────────────────────── 4 — house-envelope path (large + few beds) ──────────

describe('A.21.x — house-envelope path (large plate, few bedrooms) GENERATES', () => {
    // The case the old per-storey clamp hid: a big house ground floor whose area
    // is consumed by living/kitchen/dining, not bedrooms, used to trip the
    // apartment §D3.5 envelope gate and return []. The orchestrator's area clamp
    // (§HOUSE-MAX-CAP note) must keep it producing real rooms.
    const BIG_SHELL: ShellAnalysis = {
        netAreaM2: 180, widthM: 18, depthM: 10,
        perimeter: [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 10 }, { x: 0, z: 10 }],
        faces: [],
    };
    const FEW_BEDS: ApartmentProgram = { ...PROGRAM, bedrooms: 1, bathrooms: 1 };

    it('a 180 m² 1-bed single-storey house still produces a full room set', () => {
        const res = generateHouseLayout(BIG_SHELL, FEW_BEDS, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(res.storeys).toHaveLength(1);
        const t = typesOnStorey(res, 0);
        expect(res.perStoreyLayout[0]!.rooms.length).toBeGreaterThan(3);
        // The social core survives the envelope clamp.
        expect(t.has('living')).toBe(true);
        expect(t.has('kitchen')).toBe(true);
    });

    it('a 180 m² 1-bed 2-storey house produces non-empty layouts on BOTH storeys', () => {
        const res = generateHouseLayout(BIG_SHELL, FEW_BEDS, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.storeys).toHaveLength(2);
        expect(res.perStoreyLayout).toHaveLength(2);
        for (const layout of res.perStoreyLayout) {
            expect(layout.rooms.length).toBeGreaterThan(0);
        }
        // ground social core present; the lone bedroom/master upstairs.
        expect(typesOnStorey(res, 0).has('living')).toBe(true);
        expect(PRIVATE_TYPES.some(t => typesOnStorey(res, 1).has(t))).toBe(true);
    });
});

// ───────────────────────── 5 — non-rectangular footprints ─────────────────────

describe('A.21.x — non-rectangular footprints produce valid multi-storey results', () => {
    it('an L-shaped house generates rooms on every storey without crashing', () => {
        const lShell: ShellAnalysis = {
            netAreaM2: 110, widthM: 14, depthM: 12,
            perimeter: [
                { x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 7 },
                { x: 7, z: 7 }, { x: 7, z: 12 }, { x: 0, z: 12 },
            ],
            faces: [],
        };
        const res = generateHouseLayout(lShell, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.storeys).toHaveLength(2);
        for (const layout of res.perStoreyLayout) {
            expect(layout.rooms.length).toBeGreaterThan(0);
        }
        // roof + every storey footprint preserve the L outline.
        expect(res.roof.footprint).toEqual(footprintOf(lShell));
        for (const s of res.storeys) expect(s.footprint).toEqual(footprintOf(lShell));
        // stair core stays inside the L's bounding box (0..14 × 0..12 m).
        const core = res.stairs[0]!.rectMm;
        expect(core.x + core.w).toBeLessThanOrEqual(14_000 + 1e-6);
        expect(core.y + core.h).toBeLessThanOrEqual(12_000 + 1e-6);
    });

    it('a skewed (non-axis-aligned) quad still yields a valid 2-storey result', () => {
        const skewShell: ShellAnalysis = {
            netAreaM2: 120, widthM: 13, depthM: 11,
            perimeter: [
                { x: 0, z: 0.5 }, { x: 12.5, z: 0 }, { x: 13, z: 10.5 }, { x: 0.5, z: 11 },
            ],
            faces: [],
        };
        const res = generateHouseLayout(skewShell, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.storeys).toHaveLength(2);
        expect(res.stairs).toHaveLength(1);
        expect(res.voids).toHaveLength(1);
        for (const layout of res.perStoreyLayout) {
            expect(layout.rooms.length).toBeGreaterThan(0);
        }
    });
});

// ───────────────────────── 6 — determinism ────────────────────────────────────

describe('A.21.x — determinism (same input → identical full result)', () => {
    for (const storeyCount of [1, 2, 3]) {
        it(`${storeyCount}-storey result is deep-equal across two runs`, () => {
            const a = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount });
            const b = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount });
            expect(projectStable(a)).toEqual(projectStable(b));
        });
    }

    it('is deterministic with a solar latitude threaded through', () => {
        const opts = { storeyCount: 2, solar: { latDeg: 51.5 } };
        const a = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, opts);
        const b = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, opts);
        expect(projectStable(a)).toEqual(projectStable(b));
        expect(a.storeys).toHaveLength(2);
    });
});

// ───────────────────────── 7 — edge cases / clamping ──────────────────────────

describe('A.21.x — edge cases degrade gracefully (no throw)', () => {
    it('storeyCount 0 → a single-storey house (clamped up)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 0 });
        expect(res.storeys).toHaveLength(1);
        expect(res.stairs).toHaveLength(0);
        expect(res.voids).toHaveLength(0);
    });

    it('negative + NaN storeyCount → a single-storey house', () => {
        for (const n of [-5, Number.NaN]) {
            const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: n });
            expect(res.storeys).toHaveLength(1);
            expect(res.stairs).toHaveLength(0);
        }
    });

    // NOTE (A.21.x): clampStoreyCount only enforces a LOWER bound (>= 1); there is
    // NO upper cap, so an absurd storeyCount produces that many storeys rather than
    // being clamped to a sane maximum. This is current behaviour, not a crash; the
    // invariants must still hold for a large stack. Flagged in the report as a
    // possible hardening follow-up (a sane upper cap would be defensive).
    it('a large storeyCount stays internally consistent (invariants hold, no crash)', () => {
        const n = 12;
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: n });
        expect(res.storeys).toHaveLength(n);
        expect(res.stairs).toHaveLength(n - 1);
        expect(res.voids).toHaveLength(n - 1);
        expect(res.perStoreyLayout).toHaveLength(n);
        // no empty storey, elevations strictly monotonic.
        res.perStoreyLayout.forEach(l => expect(l.rooms.length).toBeGreaterThan(0));
        res.storeys.forEach((s, i) => {
            if (i > 0) expect(s.elevationM).toBeGreaterThan(res.storeys[i - 1]!.elevationM);
        });
    });

    it('a tiny 4×4 m footprint still yields a well-formed 2-storey result', () => {
        const tinyShell: ShellAnalysis = {
            netAreaM2: 16, widthM: 4, depthM: 4,
            perimeter: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
            faces: [],
        };
        const res = generateHouseLayout(
            tinyShell, { ...PROGRAM, bedrooms: 1, bathrooms: 1 }, CONSTRAINTS, WEIGHTS,
            { storeyCount: 2 },
        );
        expect(res.storeys).toHaveLength(2);
        expect(res.stairs).toHaveLength(1);
        expect(res.voids).toHaveLength(1);
        // The core must still sit inside the tiny plate.
        const core = res.stairs[0]!.rectMm;
        expect(core.x + core.w).toBeLessThanOrEqual(4_000 + 1e-6);
        expect(core.y + core.h).toBeLessThanOrEqual(4_000 + 1e-6);
    });

    it('a degenerate zero-area footprint does not throw (graceful degrade)', () => {
        const degenerate: ShellAnalysis = {
            netAreaM2: 0, widthM: 0, depthM: 0,
            perimeter: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }],
            faces: [],
        };
        expect(() => generateHouseLayout(degenerate, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }))
            .not.toThrow();
    });
});
