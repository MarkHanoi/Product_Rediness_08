// Casa Unifamiliar — multi-storey house ai-host core tests
// (SPEC-CASA-UNIFAMILIAR-TYPOLOGY §3/§6/§7; tracker A.21.b + A.21.c + part A.21.d).
//
// Covers: 1-storey == passthrough (no stairs/void); 2-storey → 2 plates + 1 stair +
// 1 void; 3-storey → 3 plates + 2 stairs + 2 voids; stair-core stacks (identical
// rect); allocation (bedrooms up / public + kitchen down); roof footprint == shell;
// determinism; edge cases (tiny footprint, storeyCount clamp ≥1).

import { describe, expect, it } from 'vitest';
import {
    generateHouseLayout, generateHouseLayoutOptions, allocateProgramToStoreys, reserveStairCore,
    reserveStairCoreShaped, splitRisersForShape,
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

    it('the in-plan stair rect equals what reserveStairCoreShaped would compute (A.21.D18)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        // total risers for the default 3.0 m ftf ≈ round(3.0/0.18) = 17.
        const expected = reserveStairCoreShaped(SHELL.perimeter.map(p => ({ x: p.x, z: p.z })), 2, 17);
        expect(res.stairs[0]!.rectMm).toEqual(expected.rectMm);
        expect(res.stairs[0]!.shape).toBe(expected.shape);
    });
});

// ───────────────────────── A.21.D18 — stair SHAPE selection ─────────────────

describe('reserveStairCoreShaped — shape selection by core aspect (A.21.D18)', () => {
    const RISERS = 17; // ≈ round(3.0 / 0.18)

    it('long, thin plate → I (straight run, 1.0 × 3.0 m rect)', () => {
        // 12 × 3 m plate: avail box ≈ 5400 × 1350 — too shallow to fold → I.
        const foot = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 3 }, { x: 0, z: 3 }];
        const c = reserveStairCoreShaped(foot, 2, RISERS);
        expect(c.shape).toBe('I');
        expect(c.risersBeforeLanding).toBe(0);
        expect(c.landingDepthM).toBe(0);
    });

    it('squarer mid plate → L (two flights round a corner landing)', () => {
        // ~9 × 8 m plate: avail box ≈ 4050 × 3600, aspect 1.13, ≥ L but the H side
        // (3600) is just over U_H (2800)… ensure an L-only band: 8 × 8 with a low
        // MAX_FRACTION corner. Use a plate whose avail H clears L but not U.
        // avail = plate*0.45 → for U we need availH ≥ 2800 → plateH ≥ 6222 mm.
        const foot = [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 5.5 }, { x: 0, z: 5.5 }];
        const c = reserveStairCoreShaped(foot, 2, RISERS);
        // avail ≈ 4050 × 2475 → availH < U_H(2800) but ≥ L_H(1600) → L.
        expect(c.shape).toBe('L');
        expect(c.risersBeforeLanding).toBeGreaterThanOrEqual(1);
        expect(c.landingDepthM).toBeGreaterThan(0);
    });

    it('generous square plate → U (two parallel flights + half-landing)', () => {
        // 12 × 10 m plate: avail box ≈ 5400 × 4500, aspect 1.2, ≥ U → U.
        const foot = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const c = reserveStairCoreShaped(foot, 2, RISERS);
        expect(c.shape).toBe('U');
        expect(c.landingDepthM).toBe(2.0);
        expect(c.risersBeforeLanding).toBeGreaterThanOrEqual(1);
    });

    it('tiny plate degrades safely to I (never an invalid stair)', () => {
        const foot = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];
        const c = reserveStairCoreShaped(foot, 2, RISERS);
        expect(c.shape).toBe('I');
        // The rect must still sit inside the 2×2 m plate.
        expect(c.rectMm.x + c.rectMm.w).toBeLessThanOrEqual(2000 + 1e-6);
        expect(c.rectMm.y + c.rectMm.h).toBeLessThanOrEqual(2000 + 1e-6);
    });

    it('is deterministic (same input → identical shaped core)', () => {
        const foot = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const a = reserveStairCoreShaped(foot, 2, RISERS);
        const b = reserveStairCoreShaped(foot, 2, RISERS);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

describe('splitRisersForShape — L/U riser split (A.21.D18)', () => {
    it('I keeps all risers in one flight', () => {
        expect(splitRisersForShape('I', 17)).toEqual({ before: 0, after: 17 });
    });
    it('L splits ≈half each, summing to the total', () => {
        const s = splitRisersForShape('L', 17);
        expect(s.before).toBe(8);
        expect(s.after).toBe(9);
        expect(s.before + s.after).toBe(17);
    });
    it('U splits ≈half each, summing to the total', () => {
        const s = splitRisersForShape('U', 16);
        expect(s.before).toBe(8);
        expect(s.after).toBe(8);
        expect(s.before + s.after).toBe(16);
    });
    it('both flights are ≥1 even for the minimum riser count', () => {
        const s = splitRisersForShape('L', 3);
        expect(s.before).toBeGreaterThanOrEqual(1);
        expect(s.after).toBeGreaterThanOrEqual(1);
    });
});

describe('generateHouseLayout — stair shape carried on the StairCore (A.21.D18)', () => {
    // A generous square plate → U; assert the engine carries the flights + split.
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('the StairCore carries a shape + per-flight risers/directions', () => {
        const st = res.stairs[0]!;
        expect(['I', 'L', 'U']).toContain(st.shape);
        expect(st.flights.length).toBeGreaterThanOrEqual(1);
        expect(st.footprintMm.w).toBe(st.rectMm.w);
        expect(st.footprintMm.h).toBe(st.rectMm.h);
    });

    it('the 12×10 plate chooses U with two flights whose risers sum to the gap total', () => {
        const st = res.stairs[0]!;
        expect(st.shape).toBe('U');
        expect(st.flights).toHaveLength(2);
        const total = st.flights.reduce((s, f) => s + f.riserCount, 0);
        // round(3.0/0.18) = 17.
        expect(total).toBe(17);
        expect(st.risersBeforeLanding).toBe(st.flights[0]!.riserCount);
        expect(st.landingDepthM).toBe(2.0);
    });

    it('flight directions are unit vectors with y === 0', () => {
        for (const f of res.stairs[0]!.flights) {
            expect(f.direction.y).toBe(0);
            expect(Math.hypot(f.direction.x, f.direction.z)).toBeCloseTo(1, 6);
        }
    });

    it('the stair shape stacks identically across a 3-storey stack', () => {
        const r3 = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        expect(r3.stairs).toHaveLength(2);
        expect(r3.stairs[0]!.shape).toBe(r3.stairs[1]!.shape);
        expect(r3.stairs[0]!.rectMm).toEqual(r3.stairs[1]!.rectMm);
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

// ───────────────────── §STAIR-KEEPOUT (A.21.D21, SPEC-CASA §7) ──────────────────
//
// Defect 4 — the stair core must be a REAL spatial keep-out: no room/partition may
// tile across it (resolves Deviation A — the old area-shrink reduced the budget but
// left the core's LOCATION un-carved). We assert that on EVERY storey of a multi-
// storey house, no emitted room footprint overlaps the reserved stair-core rect.

/** AABB-overlap of two mm rects with a tolerance (negative ⇒ shrink each box). */
function rectsOverlap(
    a: { x0: number; z0: number; x1: number; z1: number },
    b: { x0: number; z0: number; x1: number; z1: number },
    tolMm = 1,
): boolean {
    return a.x0 < b.x1 - tolMm && a.x1 > b.x0 + tolMm &&
           a.z0 < b.z1 - tolMm && a.z1 > b.z0 + tolMm;
}

/** Axis-aligned bbox (mm) of a room's plan polygon ({x, y=plan-z}). */
function roomBboxMm(room: { polygon?: ReadonlyArray<{ x: number; y: number }>; centroid?: { x: number; y: number } }):
    { x0: number; z0: number; x1: number; z1: number } | null {
    const poly = room.polygon;
    if (!poly || poly.length < 3) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < z0) z0 = p.y; if (p.y > z1) z1 = p.y;
    }
    return { x0, z0, x1, z1 };
}

describe('generateHouseLayout — stair core keep-out (Defect 4, §7)', () => {
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
    const core = res.stairs[0]!.rectMm;
    const coreRect = { x0: core.x, z0: core.y, x1: core.x + core.w, z1: core.y + core.h };

    it('the reserved core is a positive, sane rect (mm)', () => {
        expect(core.w).toBeGreaterThan(0);
        expect(core.h).toBeGreaterThan(0);
    });

    it('NO room on ANY storey overlaps the stair-core rect (genuine keep-out)', () => {
        let checked = 0;
        for (const layout of res.perStoreyLayout) {
            for (const room of layout.rooms) {
                const bb = roomBboxMm(room);
                if (!bb) continue;
                checked++;
                expect(
                    rectsOverlap(bb, coreRect),
                    `room "${room.name}" bbox ${JSON.stringify(bb)} overlaps stair core ${JSON.stringify(coreRect)}`,
                ).toBe(false);
            }
        }
        // Guard against a vacuous pass — at least one room with a polygon was tested.
        expect(checked).toBeGreaterThan(0);
    });

    it('holds for a 3-storey stack on every storey', () => {
        const r3 = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const c = r3.stairs[0]!.rectMm;
        const cr = { x0: c.x, z0: c.y, x1: c.x + c.w, z1: c.y + c.h };
        for (const layout of r3.perStoreyLayout) {
            for (const room of layout.rooms) {
                const bb = roomBboxMm(room);
                if (!bb) continue;
                expect(rectsOverlap(bb, cr)).toBe(false);
            }
        }
    });

    it('single-storey house carves NOTHING (no stair → byte-identical apartment path)', () => {
        // No keep-out is threaded for a 1-storey house (no core), so its layout must
        // match generating WITHOUT the house orchestrator's keep-out machinery — i.e.
        // the apartment single-plate result is untouched. We assert the orchestrator
        // produced rooms and emitted no stairs/voids.
        const r1 = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(r1.stairs).toHaveLength(0);
        expect(r1.voids).toHaveLength(0);
        expect(r1.perStoreyLayout[0]!.rooms.length).toBeGreaterThan(0);
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

// ───────────────── A.21.k — generateHouseLayoutOptions (N variants) ──────────

describe('generateHouseLayoutOptions — N whole-house variants for the modal', () => {
    it('variant 0 matches the single-best generateHouseLayout (same geometry + score)', () => {
        const single = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const variants = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        expect(variants.length).toBeGreaterThanOrEqual(1);
        const v0 = variants[0]!.result;
        // Variant 0 selects option[0] on every storey, so the WHOLE-HOUSE structure
        // (levels, stairs, voids, roof) is identical. NOTE: asking the engine for N
        // options per storey can change the option[0] ROOM-ARRAY ORDER vs. asking
        // for 1 (the enumerator surfaces candidates in a count-dependent order), but
        // the geometry + score are the same — so we assert structural + score parity
        // (which is what the executor build actually consumes), not byte-for-byte
        // room-array order. The apartment flow is unaffected (it always asks for N).
        expect(v0.stairs).toEqual(single.stairs);
        expect(v0.voids).toEqual(single.voids);
        expect(v0.roof).toEqual(single.roof);
        expect(v0.storeys).toEqual(single.storeys);
        expect(v0.perStoreyLayout.length).toBe(single.perStoreyLayout.length);
        for (let i = 0; i < v0.perStoreyLayout.length; i++) {
            expect(v0.perStoreyLayout[i]!.score.overall).toBe(single.perStoreyLayout[i]!.score.overall);
            // Same room SET (by name), regardless of array order.
            const a = v0.perStoreyLayout[i]!.rooms.map(r => r.name).sort();
            const b = single.perStoreyLayout[i]!.rooms.map(r => r.name).sort();
            expect(a).toEqual(b);
        }
    });

    it('returns at most `count` variants, each carrying a 0-100 aggregate score', () => {
        const variants = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        expect(variants.length).toBeLessThanOrEqual(3);
        for (const v of variants) {
            expect(v.overallScore).toBeGreaterThanOrEqual(0);
            expect(v.overallScore).toBeLessThanOrEqual(100);
            expect(v.result.storeys).toHaveLength(2);
        }
    });

    it('variants are ordered best-first by aggregate score with stable variantIndex', () => {
        const variants = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        for (let i = 1; i < variants.length; i++) {
            expect(variants[i - 1]!.overallScore).toBeGreaterThanOrEqual(variants[i]!.overallScore);
        }
        expect(variants.map(v => v.variantIndex)).toEqual(variants.map((_, i) => i));
    });

    it('de-duplicates collapsed variants (never two identical cards)', () => {
        const variants = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 5);
        const seen = new Set(variants.map(v => JSON.stringify(v.result)));
        expect(seen.size).toBe(variants.length);
    });

    it('is deterministic (same input → identical variant set, no Math.random)', () => {
        const a = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        const b = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('a single storey still yields at least one variant', () => {
        const variants = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 }, 3);
        expect(variants.length).toBeGreaterThanOrEqual(1);
        expect(variants[0]!.result.storeys).toHaveLength(1);
        expect(variants[0]!.result.stairs).toHaveLength(0);
    });
});
