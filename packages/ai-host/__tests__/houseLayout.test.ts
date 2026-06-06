// Casa Unifamiliar — multi-storey house ai-host core tests
// (SPEC-CASA-UNIFAMILIAR-TYPOLOGY §3/§6/§7; tracker A.21.b + A.21.c + part A.21.d).
//
// Covers: 1-storey == passthrough (no stairs/void); 2-storey → 2 plates + 1 stair +
// 1 void; 3-storey → 3 plates + 2 stairs + 2 voids; stair-core stacks (identical
// rect); allocation (bedrooms up / public + kitchen down); roof footprint == shell;
// determinism; edge cases (tiny footprint, storeyCount clamp ≥1).

import { describe, expect, it } from 'vitest';
import {
    generateHouseLayout, allocateProgramToStoreys, reserveStairCore,
} from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

// A generous 12 × 10 m rectangular shell (120 m²) — comfortable for a house plate.
const SHELL: ShellAnalysis = {
    netAreaM2: 120, widthM: 12, depthM: 10,
    perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
    faces: [],
};
const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

// ───────────────────────── allocateProgramToStoreys ─────────────────────────

describe('allocateProgramToStoreys', () => {
    it('1 storey is a pass-through (full program on one ground plate)', () => {
        const out = allocateProgramToStoreys(PROGRAM, 1);
        expect(out).toHaveLength(1);
        expect(out[0]!.role).toBe('ground');
        expect(out[0]!.storeyIndex).toBe(0);
        expect(out[0]!.program.bedrooms).toBe(3);
        expect(out[0]!.program.bathrooms).toBe(2);
        expect(out[0]!.program.openPlanKitchenDining).toBe(true);
    });

    it('clamps storeyCount < 1 up to a single storey', () => {
        expect(allocateProgramToStoreys(PROGRAM, 0)).toHaveLength(1);
        expect(allocateProgramToStoreys(PROGRAM, -3)).toHaveLength(1);
        expect(allocateProgramToStoreys(PROGRAM, Number.NaN)).toHaveLength(1);
    });

    it('2 storeys: kitchen/dining/living stay on the GROUND, never upstairs', () => {
        const out = allocateProgramToStoreys(PROGRAM, 2);
        expect(out).toHaveLength(2);
        const ground = out[0]!;
        const upper = out[1]!;
        expect(ground.role).toBe('ground');
        expect(ground.program.openPlanKitchenDining).toBe(true);
        expect(ground.program.livingRoom).toBe(true);
        expect(upper.role).toBe('upper');
        expect(upper.program.openPlanKitchenDining).toBe(false);
        expect(upper.program.livingRoom).toBe(false);
    });

    it('2 storeys: most bedrooms go UPSTAIRS (one guest bedroom kept on ground)', () => {
        const out = allocateProgramToStoreys(PROGRAM, 2);
        const ground = out[0]!.program;
        const upper = out[1]!.program;
        expect(ground.bedrooms).toBe(1);   // one guest/accessible bedroom on ground
        expect(upper.bedrooms).toBe(2);    // the rest upstairs
        expect(ground.bedrooms + upper.bedrooms).toBe(PROGRAM.bedrooms);
    });

    it('master en-suite follows the master upstairs (first upper storey)', () => {
        const out = allocateProgramToStoreys(PROGRAM, 2);
        expect(out[0]!.program.masterEnSuite).toBe(false); // ground has no en-suite
        expect(out[1]!.program.masterEnSuite).toBe(true);  // master upstairs
    });

    it('one bathroom (WC) stays on the ground; the rest go up', () => {
        const out = allocateProgramToStoreys(PROGRAM, 2);
        expect(out[0]!.program.bathrooms).toBe(1);
        expect(out[1]!.program.bathrooms).toBe(1);
        expect(out[0]!.program.bathrooms + out[1]!.program.bathrooms).toBe(PROGRAM.bathrooms);
    });

    it('single-bedroom house puts the only bedroom upstairs (no ground bedroom)', () => {
        const oneBed: ApartmentProgram = { ...PROGRAM, bedrooms: 1, bathrooms: 1 };
        const out = allocateProgramToStoreys(oneBed, 2);
        expect(out[0]!.program.bedrooms).toBe(0);
        expect(out[1]!.program.bedrooms).toBe(1);
    });

    it('3 storeys: bedrooms distributed across both upper storeys, conserving the count', () => {
        const big: ApartmentProgram = { ...PROGRAM, bedrooms: 5, bathrooms: 3 };
        const out = allocateProgramToStoreys(big, 3);
        expect(out).toHaveLength(3);
        const total = out.reduce((s, sp) => s + sp.program.bedrooms, 0);
        expect(total).toBe(5);
        // ground keeps 1, the 4 remaining split across two upper storeys.
        expect(out[0]!.program.bedrooms).toBe(1);
        expect(out[1]!.program.bedrooms + out[2]!.program.bedrooms).toBe(4);
        expect(out[1]!.role).toBe('upper');
        expect(out[2]!.role).toBe('upper');
    });

    it('is deterministic (same input → identical allocation)', () => {
        const a = allocateProgramToStoreys(PROGRAM, 3);
        const b = allocateProgramToStoreys(PROGRAM, 3);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ───────────────────────────── reserveStairCore ─────────────────────────────

describe('reserveStairCore', () => {
    const FOOT = SHELL.perimeter.map(p => ({ x: p.x, z: p.z }));

    it('returns a positive axis-aligned rect (mm) inside the footprint', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        // Inside the 0..12000 × 0..10000 mm bbox.
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(12000 + 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(10000 + 1e-6);
    });

    it('reserves roughly a domestic-stair footprint (~1.0 m × ~3.0 m) on a large plate', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.w).toBe(1000);
        expect(r.h).toBe(3000);
    });

    it('does NOT sit on the front (min-Z) entrance edge', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.y).toBeGreaterThan(0); // offset back from the entrance façade
    });

    it('is deterministic + storey-count-independent (same rect for 2 vs 3 storeys → stacks)', () => {
        const r2 = reserveStairCore(FOOT, 2);
        const r3 = reserveStairCore(FOOT, 3);
        expect(r2).toEqual(r3);
    });

    it('shrinks the core for a tiny footprint and stays inside it', () => {
        const tiny = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];
        const r = reserveStairCore(tiny, 2);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x + r.w).toBeLessThanOrEqual(2000 + 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(2000 + 1e-6);
    });
});

// ───────────────────────────── generateHouseLayout ──────────────────────────

describe('generateHouseLayout — 1 storey (passthrough superset)', () => {
    it('produces a single plate with NO stairs and NO voids', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(res.storeys).toHaveLength(1);
        expect(res.stairs).toHaveLength(0);
        expect(res.voids).toHaveLength(0);
        expect(res.perStoreyLayout.length).toBeGreaterThan(0);
        expect(res.storeys[0]!.elevationM).toBe(0);
        expect(res.storeys[0]!.storeyIndex).toBe(0);
    });

    it('clamps storeyCount 0 → a single-storey house', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 0 });
        expect(res.storeys).toHaveLength(1);
        expect(res.stairs).toHaveLength(0);
    });

    it('emits a roof whose footprint equals the shell perimeter', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(res.roof.footprint).toEqual(SHELL.perimeter.map(p => ({ x: p.x, z: p.z })));
        expect(res.roof.levelId).toBe(res.storeys[0]!.levelId);
    });
});

describe('generateHouseLayout — 2 storeys', () => {
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('produces 2 plates at elevations 0 and 3.0 m (default floor-to-floor)', () => {
        expect(res.storeys).toHaveLength(2);
        expect(res.storeys[0]!.elevationM).toBe(0);
        expect(res.storeys[1]!.elevationM).toBe(3);
        expect(res.storeys[0]!.storeyIndex).toBe(0);
        expect(res.storeys[1]!.storeyIndex).toBe(1);
    });

    it('has exactly 1 stair connecting ground → upper', () => {
        expect(res.stairs).toHaveLength(1);
        expect(res.stairs[0]!.fromLevelId).toBe(res.storeys[0]!.levelId);
        expect(res.stairs[0]!.toLevelId).toBe(res.storeys[1]!.levelId);
    });

    it('punches exactly 1 slab void on the upper (non-ground) storey', () => {
        expect(res.voids).toHaveLength(1);
        expect(res.voids[0]!.levelId).toBe(res.storeys[1]!.levelId);
    });

    it('the void rect matches the stair core rect (hole over the stair)', () => {
        expect(res.voids[0]!.rectMm).toEqual(res.stairs[0]!.rectMm);
    });

    it('produces one layout per storey', () => {
        expect(res.perStoreyLayout.length).toBe(2);
        for (const layout of res.perStoreyLayout) {
            expect(layout.rooms.length).toBeGreaterThan(0);
            expect(layout.score.overall).toBeGreaterThanOrEqual(0);
        }
    });

    it('honours a custom floorToFloorM + baseElevationM', () => {
        const r = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, {
            storeyCount: 2, floorToFloorM: 3.5, baseElevationM: 0.15,
        });
        expect(r.storeys[0]!.elevationM).toBe(0.15);
        expect(r.storeys[1]!.elevationM).toBe(3.65);
    });

    it('honours a custom levelIdForStorey mapping', () => {
        const ids = ['L0-GROUND', 'L1-UPPER'];
        const r = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, {
            storeyCount: 2, levelIdForStorey: (i) => ids[i]!,
        });
        expect(r.storeys[0]!.levelId).toBe('L0-GROUND');
        expect(r.storeys[1]!.levelId).toBe('L1-UPPER');
        expect(r.stairs[0]!.fromLevelId).toBe('L0-GROUND');
        expect(r.stairs[0]!.toLevelId).toBe('L1-UPPER');
        expect(r.voids[0]!.levelId).toBe('L1-UPPER');
    });
});

describe('generateHouseLayout — 3 storeys', () => {
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });

    it('produces 3 plates at 0, 3, 6 m', () => {
        expect(res.storeys.map(s => s.elevationM)).toEqual([0, 3, 6]);
    });

    it('has 2 stairs (one per adjacent pair) chained ground→u1→u2', () => {
        expect(res.stairs).toHaveLength(2);
        expect(res.stairs[0]!.fromLevelId).toBe(res.storeys[0]!.levelId);
        expect(res.stairs[0]!.toLevelId).toBe(res.storeys[1]!.levelId);
        expect(res.stairs[1]!.fromLevelId).toBe(res.storeys[1]!.levelId);
        expect(res.stairs[1]!.toLevelId).toBe(res.storeys[2]!.levelId);
    });

    it('punches voids on storeys 1 and 2 (every non-ground slab), none on ground', () => {
        expect(res.voids).toHaveLength(2);
        expect(res.voids.map(v => v.levelId)).toEqual([res.storeys[1]!.levelId, res.storeys[2]!.levelId]);
        expect(res.voids.every(v => v.levelId !== res.storeys[0]!.levelId)).toBe(true);
    });
});

describe('generateHouseLayout — stair-core vertical alignment (§7)', () => {
    it('the stair-core rect is IDENTICAL across every storey it passes through', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const rects = [...res.stairs.map(s => s.rectMm), ...res.voids.map(v => v.rectMm)];
        const first = rects[0]!;
        for (const r of rects) expect(r).toEqual(first);
    });

    it('the in-plan stair rect equals what reserveStairCore would compute for the footprint', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const expected = reserveStairCore(SHELL.perimeter.map(p => ({ x: p.x, z: p.z })), 2);
        expect(res.stairs[0]!.rectMm).toEqual(expected);
    });
});

describe('generateHouseLayout — roof', () => {
    it('defaults to a gable roof with a pitch over the topmost storey', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.roof.kind).toBe('gable');
        expect(res.roof.pitchDeg).toBeGreaterThan(0);
        expect(res.roof.levelId).toBe(res.storeys[1]!.levelId);
        expect(res.roof.footprint).toEqual(SHELL.perimeter.map(p => ({ x: p.x, z: p.z })));
    });

    it('a flat roof carries no pitch', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, roofKind: 'flat' });
        expect(res.roof.kind).toBe('flat');
        expect(res.roof.pitchDeg).toBeUndefined();
    });

    it('respects an explicit hip roof kind', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1, roofKind: 'hip' });
        expect(res.roof.kind).toBe('hip');
    });
});

describe('generateHouseLayout — determinism + edge cases', () => {
    it('is deterministic (same input → identical full result)', () => {
        const a = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const b = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('threads solar latitude through to the per-storey engine without throwing', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, {
            storeyCount: 2, solar: { latDeg: 51.5 },
        });
        expect(res.storeys).toHaveLength(2);
        expect(res.perStoreyLayout.length).toBeGreaterThan(0);
    });

    it('every storey footprint equals the shell perimeter (vertical wall stacking)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const expected = SHELL.perimeter.map(p => ({ x: p.x, z: p.z }));
        for (const s of res.storeys) expect(s.footprint).toEqual(expected);
    });

    it('a tiny footprint still yields a well-formed 2-storey result', () => {
        const tinyShell: ShellAnalysis = {
            netAreaM2: 16, widthM: 4, depthM: 4,
            perimeter: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
            faces: [],
        };
        const res = generateHouseLayout(tinyShell, { ...PROGRAM, bedrooms: 1, bathrooms: 1 }, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.storeys).toHaveLength(2);
        expect(res.stairs).toHaveLength(1);
        expect(res.voids).toHaveLength(1);
        // The core must still sit inside the tiny 4×4 m plate.
        const core = res.stairs[0]!.rectMm;
        expect(core.x + core.w).toBeLessThanOrEqual(4000 + 1e-6);
        expect(core.y + core.h).toBeLessThanOrEqual(4000 + 1e-6);
    });
});
