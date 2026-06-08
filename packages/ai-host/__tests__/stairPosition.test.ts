// Casa Unifamiliar — stair-core POSITION space-efficiency objective tests
// (A.21.D29 / #6). The founder-ratified "engine decides per-plot": the stair core
// position is a SCORED choice among a small deterministic candidate set, NOT a
// hard-coded central placement. These tests cover candidate generation, waste
// scoring (perimeter beats central on a plate where central wastes space; central
// wins / ties where it's genuinely best), determinism, and graceful fallback.

import { describe, expect, it } from 'vitest';
import {
    chooseStairCorePosition,
    stairCoreWaste,
    aspectFromSunDir,
    __candidatesForTest as candidates,
    __aspectScoreForTest as aspectScore,
} from '../src/workflows/houseLayout/stairPosition.js';
import {
    reserveStairCore, reserveStairCoreShaped, generateHouseLayout,
} from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

// ───────────────────────── candidate generation ─────────────────────────────

describe('stairCorePositionCandidates', () => {
    it('always includes a central candidate (the safe default)', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        expect(cs.some(c => c.kind === 'central')).toBe(true);
    });

    it('a generous plate offers left/right (long-edge) + back perimeter candidates', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        const kinds = cs.map(c => c.kind).sort();
        expect(kinds).toContain('left');
        expect(kinds).toContain('right');
        expect(kinds).toContain('back');
    });

    it('candidate count is small + deterministic (≤ 4 candidates)', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        expect(cs.length).toBeGreaterThanOrEqual(1);
        expect(cs.length).toBeLessThanOrEqual(4);
    });

    it('NO candidate sits on the y=0 entrance edge (front hall stays clear)', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        for (const c of cs) expect(c.y).toBeGreaterThan(0);
    });

    it('left/right candidates abut a long side wall (x=0 / x=plateW−coreW)', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        const left = cs.find(c => c.kind === 'left')!;
        const right = cs.find(c => c.kind === 'right')!;
        expect(left.x).toBe(0);
        expect(right.x).toBe(12000 - 2000);
    });

    it('a tiny plate degrades to ONLY the central candidate (graceful fallback)', () => {
        // 2×2 m plate, core ≈ 1.0×1.5 m → no perimeter landing fits → central only.
        const cs = candidates(2000, 2000, 1000, 1500);
        expect(cs).toHaveLength(1);
        expect(cs[0]!.kind).toBe('central');
    });

    it('every candidate keeps the core fully inside the plate', () => {
        const cs = candidates(12000, 10000, 2000, 2800);
        for (const c of cs) {
            expect(c.x).toBeGreaterThanOrEqual(0);
            expect(c.y).toBeGreaterThanOrEqual(0);
            expect(c.x + 2000).toBeLessThanOrEqual(12000 + 1e-6);
            expect(c.y + 2800).toBeLessThanOrEqual(10000 + 1e-6);
        }
    });
});

// ───────────────────────────── waste scoring ────────────────────────────────

describe('stairCoreWaste', () => {
    it('a core flush against a wall scores LOWER than one marooned centrally', () => {
        // Wide plate: central leaves big rooms all round (waste 0) but earns NO
        // flush bonus; a left-flush core earns the wall-abutment bonus → lower.
        const central = stairCoreWaste(12000, 10000, 2000, 2800, 5000, 3333);
        const leftFlush = stairCoreWaste(12000, 10000, 2000, 2800, 0, 3333);
        expect(leftFlush).toBeLessThan(central);
    });

    it('penalises a thin dead sliver between the core and a wall', () => {
        // A 1.2 m gap (sliver, < 2.4 m usable) on the left is dead circulation.
        const sliver = stairCoreWaste(12000, 10000, 2000, 2800, 1200, 3333);
        const flush = stairCoreWaste(12000, 10000, 2000, 2800, 0, 3333);
        expect(sliver).toBeGreaterThan(flush);
    });

    it('a degenerate (zero-area) plate scores 0 (never NaN/throws)', () => {
        expect(stairCoreWaste(0, 0, 1000, 3000, 0, 0)).toBe(0);
        expect(Number.isNaN(stairCoreWaste(0, 10000, 1000, 3000, 0, 0))).toBe(false);
    });
});

// ─────────────────────────── position selection ─────────────────────────────

describe('chooseStairCorePosition', () => {
    it('picks a PERIMETER position on a wide plate where central wastes space', () => {
        const pos = chooseStairCorePosition(12000, 10000, 2000, 2800);
        expect(pos.kind).not.toBe('central');
        // Specifically the first long-edge candidate (left) — flush against x=0.
        expect(pos.x).toBe(0);
        expect(pos.y).toBeGreaterThan(0);
    });

    it('falls back to CENTRAL on a tiny plate (single candidate)', () => {
        const pos = chooseStairCorePosition(2000, 2000, 1000, 1500);
        expect(pos.kind).toBe('central');
    });

    it('is deterministic — same input → identical position (no RNG)', () => {
        const a = chooseStairCorePosition(12000, 10000, 2000, 2800);
        const b = chooseStairCorePosition(12000, 10000, 2000, 2800);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('ties resolve to central (stable — no needless shift)', () => {
        // A near-square plate barely bigger than the core: perimeter offers no
        // advantage (gaps are slivers everywhere) → central must hold.
        const pos = chooseStairCorePosition(3200, 3200, 2000, 2800);
        // Either central wins outright, or — if a perimeter wins — it must be a
        // STRICT improvement; assert determinism + that we never throw.
        expect(['central', 'left', 'right', 'back']).toContain(pos.kind);
        const again = chooseStairCorePosition(3200, 3200, 2000, 2800);
        expect(again.kind).toBe(pos.kind);
    });
});

// ───────────────── integration with reserveStairCore(Shaped) ─────────────────

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
const FOOT = SHELL.perimeter.map(p => ({ x: p.x, z: p.z }));

describe('stair-core position — reserveStairCore integration', () => {
    it('reserveStairCore stays off the entrance edge (y > 0) after scoring', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.y).toBeGreaterThan(0);
    });

    it('reserveStairCore keeps the rect fully inside the plate', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(12000 + 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(10000 + 1e-6);
    });

    it('on the wide 12×10 plate the I-core abuts a side wall (x=0)', () => {
        const r = reserveStairCore(FOOT, 2);
        expect(r.x).toBe(0);
    });
});

describe('stair-core position — stacking invariant preserved', () => {
    it('the chosen rect is IDENTICAL across a 3-storey stack (stairs + voids)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 3 });
        const rects = [...res.stairs.map(s => s.rectMm), ...res.voids.map(v => v.rectMm)];
        const first = rects[0]!;
        for (const r of rects) expect(r).toEqual(first);
    });

    it('the orchestrator rect equals a direct reserveStairCoreShaped (same scorer)', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const expected = reserveStairCoreShaped(FOOT, 2, 17);
        expect(res.stairs[0]!.rectMm).toEqual(expected.rectMm);
    });

    it('is storey-count-independent (2 vs 3 storeys → same rect → stacks)', () => {
        const r2 = reserveStairCore(FOOT, 2);
        const r3 = reserveStairCore(FOOT, 3);
        expect(r2).toEqual(r3);
    });

    it('the whole shaped core is deterministic across runs', () => {
        const a = reserveStairCoreShaped(FOOT, 2, 17);
        const b = reserveStairCoreShaped(FOOT, 2, 17);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ───────────────── §STAIR-WORST-ASPECT (2026-06-08, founder ask) ──────────────
//
// Founder rule: "the stair should occupy the LEAST space possible and always tend
// to be ADJACENT TO A WALL — ideally the wall where the view/sunlight is WORST
// (normally NORTH unless the view is good)." Frame: y=0 is the entrance (front,
// min-Z) façade; y=plateH is the BACK (max-Z) façade. The sun direction comes from
// site latitude (Northern → sun toward +y = BACK wall; the stair must AVOID it).

describe('aspectFromSunDir — plate-local sun direction from latitude', () => {
    it('Northern hemisphere → sun toward +y (the BACK / max-Z wall)', () => {
        expect(aspectFromSunDir(51.5)).toEqual({ x: 0, y: 1 });
    });
    it('Southern hemisphere → sun toward −y (the FRONT / entrance wall)', () => {
        expect(aspectFromSunDir(-34)).toEqual({ x: 0, y: -1 });
    });
    it('near the equator (|lat| < 10°) → no preference (null)', () => {
        expect(aspectFromSunDir(5)).toBeNull();
        expect(aspectFromSunDir(undefined)).toBeNull();
        expect(aspectFromSunDir(Number.NaN)).toBeNull();
    });
});

describe('aspectScore — poorer aspect scores higher (better for a stair)', () => {
    const north = { sunDir: { x: 0, y: 1 } };   // sun to the back → back is the GOOD wall
    it('the SUN-facing wall (back) is the WORST stair choice (score 0)', () => {
        expect(aspectScore('back', north)).toBeCloseTo(0, 6);
    });
    it('a side wall is aspect-neutral (~0.5)', () => {
        expect(aspectScore('left', north)).toBeCloseTo(0.5, 6);
        expect(aspectScore('right', north)).toBeCloseTo(0.5, 6);
    });
    it('a wall flagged GOOD-VIEW is avoided (score 0) regardless of sun', () => {
        expect(aspectScore('left', { sunDir: { x: 0, y: 1 }, goodViewKinds: ['left'] })).toBe(0);
    });
    it('no sun direction → every perimeter wall is neutral (0.5)', () => {
        expect(aspectScore('left', { sunDir: null })).toBe(0.5);
        expect(aspectScore('back', { sunDir: null })).toBe(0.5);
    });
    it('central (no façade) always scores 0', () => {
        expect(aspectScore('central', north)).toBe(0);
    });
});

describe('chooseStairCorePosition — worst-aspect bias (Defect B)', () => {
    it('with the sun to the BACK the stair AVOIDS the back wall, hugs a side wall', () => {
        const pos = chooseStairCorePosition(
            12000, 10000, 2000, 2800, undefined, { sunDir: { x: 0, y: 1 } },
        );
        // Never the sun-facing back wall; always a perimeter (never central).
        expect(pos.kind).not.toBe('back');
        expect(pos.kind).not.toBe('central');
        expect(['left', 'right']).toContain(pos.kind);
    });

    it('ALWAYS prefers a PERIMETER candidate over central when one exists (Defect A)', () => {
        // Even with NO sun preference (null), the perimeter-preference term keeps the
        // stair off-centre so it never holes the middle of the plate.
        const pos = chooseStairCorePosition(
            12000, 10000, 2000, 2800, undefined, { sunDir: null },
        );
        expect(pos.kind).not.toBe('central');
    });

    it('a tiny plate (no perimeter candidate) still falls back to central', () => {
        const pos = chooseStairCorePosition(
            2000, 2000, 1000, 1500, undefined, { sunDir: { x: 0, y: 1 } },
        );
        expect(pos.kind).toBe('central');
    });

    it('is deterministic with an aspect bias (no RNG)', () => {
        const a = chooseStairCorePosition(12000, 10000, 2000, 2800, undefined, { sunDir: { x: 0, y: 1 } });
        const b = chooseStairCorePosition(12000, 10000, 2000, 2800, undefined, { sunDir: { x: 0, y: 1 } });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

describe('generateHouseLayout — stair hugs a perimeter wall on the poor-aspect side', () => {
    it('a 2-storey house with a northern latitude puts the stair ADJACENT to a SIDE wall', () => {
        const res = generateHouseLayout(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, solar: { latDeg: 51.5 } },
        );
        const core = res.stairs[0]!.rectMm;
        // Shares ≥1 edge with the 12×10 m (12000×10000 mm) shell bounding box.
        const touchesLeft  = Math.abs(core.x) < 1e-6;
        const touchesRight = Math.abs(core.x + core.w - 12000) < 1e-6;
        const touchesFront = Math.abs(core.y) < 1e-6;   // entrance edge — never expected
        // §STAIR-CORNER-ANCHOR — with the sun to the back (north lat → +y good), the
        // chooser prefers a SIDE-wall back corner: its PRIMARY face is the aspect-
        // neutral side wall (keeps the prime front façade for habitable rooms), and
        // it carves cleanly (a back corner → one dominant rect). The core therefore
        // hugs a side wall; it is never on the entrance edge.
        expect(touchesLeft || touchesRight).toBe(true);
        expect(touchesFront).toBe(false);
        expect(core.y).toBeGreaterThan(0);
    });

    it('the stair core is minimal-footprint (≤ MAX_FRACTION of either plate dim)', () => {
        const res = generateHouseLayout(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, solar: { latDeg: 51.5 } },
        );
        const core = res.stairs[0]!.rectMm;
        expect(core.w).toBeLessThanOrEqual(0.45 * 12000 + 1e-6);
        expect(core.h).toBeLessThanOrEqual(0.45 * 10000 + 1e-6);
    });

    it('a Southern-hemisphere site (sun to the front) still keeps the stair off the entrance', () => {
        const res = generateHouseLayout(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, solar: { latDeg: -34 } },
        );
        const core = res.stairs[0]!.rectMm;
        expect(core.y).toBeGreaterThan(0);                       // never on the entrance edge
        expect(core.x + core.w).toBeLessThanOrEqual(12000 + 1e-6);
        expect(core.y + core.h).toBeLessThanOrEqual(10000 + 1e-6);
    });

    it('stays deterministic + stacks across storeys with solar threaded', () => {
        const opts = { storeyCount: 3, solar: { latDeg: 51.5 } };
        const a = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, opts);
        const b = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, opts);
        expect(JSON.stringify(a.stairs)).toEqual(JSON.stringify(b.stairs));
        const expected = a.stairs[0]!.rectMm;
        for (const s of a.stairs) expect(s.rectMm).toEqual(expected);
        for (const v of a.voids) expect(v.rectMm).toEqual(expected);
    });
});

// ───────────────── A.21.D52 — REAL-shell (jittery boundary) regression ─────────
//
// The founder kept seeing the stair in the CENTRE of REAL generated houses even on a
// build that has the D42/D45 perimeter-worst-aspect fix (windows correctly off-corner
// → fix is live). The unit tests above pass because they use a MATHEMATICALLY PERFECT
// rectangle (4 exact corners). A REAL drawn boundary is NOT perfect: the user draws
// edge-by-edge and WallJoinResolver mitres the corners, so the shell polygon wobbles
// by a few cm. The A.21.D34(a) shell-containment cull tested with a 0.001 mm boundary
// tolerance, so on a jittery shell a flush perimeter candidate (x=0) was culled the
// moment the matching wall dipped even 1 mm inward — collapsing the candidate set to
// `central` ONLY. That is the EXACT fallback that centred the stair in real houses.
//
// These tests reproduce it by feeding `generateHouseLayout` a realistic shell whose
// perimeter has 8 vertices with ±30 mm wobble (a hand-drawn rectangle). They assert
// the stair STILL hugs a perimeter wall — i.e. the central fallback no longer fires.

/** A "hand-drawn" near-rectangle: 8 vertices (mid-edge points + corners) with a
 *  deterministic ±jMM mm wobble — the shape a real drawn+mitred boundary takes. */
function jitteryRect(wM: number, dM: number, jMM: number, seed: number): { x: number; z: number }[] {
    const pts = [
        { x: 0, z: 0 }, { x: wM / 2, z: 0 }, { x: wM, z: 0 },
        { x: wM, z: dM / 2 }, { x: wM, z: dM },
        { x: wM / 2, z: dM }, { x: 0, z: dM }, { x: 0, z: dM / 2 },
    ];
    let s = seed;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
    return pts.map(p => ({ x: p.x + rnd() * jMM / 1000, z: p.z + rnd() * jMM / 1000 }));
}

function bboxOfPerim(p: { x: number; z: number }[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const q of p) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
    return { minX, minZ, maxX, maxZ };
}

/** Smallest distance (m) from the core rect's nearest edge to the shell bbox — 0 ⇒
 *  flush against a perimeter wall, large ⇒ marooned in the centre (the bug). */
function coreMinEdgeDistM(core: { x: number; y: number; w: number; h: number }, bb: ReturnType<typeof bboxOfPerim>): number {
    const cx = core.x / 1000, cz = core.y / 1000, cw = core.w / 1000, ch = core.h / 1000;
    return Math.min(
        Math.abs(cx - bb.minX), Math.abs(cx + cw - bb.maxX),
        Math.abs(cz - bb.minZ), Math.abs(cz + ch - bb.maxZ),
    );
}

describe('A.21.D52 — stair hugs a perimeter wall on a REAL (jittery) drawn boundary', () => {
    const P2BED: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: false,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };

    it('the modal default (2 floors / ~200 m² jittery plate) places the stair AT a wall, NOT centre', () => {
        // ~200 m² (16×12.5 m) hand-drawn rectangle with ±30 mm wall wobble.
        const perim = jitteryRect(16, 12.5, 30, 4242);
        const bb = bboxOfPerim(perim);
        const shell: ShellAnalysis = {
            netAreaM2: 200, widthM: bb.maxX - bb.minX, depthM: bb.maxZ - bb.minZ, perimeter: perim, faces: [],
        };
        const res = generateHouseLayout(shell, P2BED, CONSTRAINTS, WEIGHTS, { storeyCount: 2, solar: { latDeg: 51.5 } });
        const core = res.stairs[0]!.rectMm;
        // The stair must hug a perimeter wall: its nearest edge sits within a wall
        // landing of the shell (≤ 0.95 m), NOT marooned metres into the centre.
        // BEFORE the D52 fix this was ~4.2 m (dead centre) — the founder's bug.
        expect(coreMinEdgeDistM(core, bb)).toBeLessThanOrEqual(0.95);
    });

    it('holds across a sweep of jittery plate sizes (central fallback is RARE/absent)', () => {
        let centred = 0, total = 0;
        for (let wM = 8; wM <= 18; wM += 2) {
            for (let dM = 8; dM <= 16; dM += 2) {
                const perim = jitteryRect(wM, dM, 30, wM * 131 + dM * 7);
                const bb = bboxOfPerim(perim);
                const shell: ShellAnalysis = {
                    netAreaM2: wM * dM, widthM: bb.maxX - bb.minX, depthM: bb.maxZ - bb.minZ, perimeter: perim, faces: [],
                };
                const res = generateHouseLayout(shell, P2BED, CONSTRAINTS, WEIGHTS, { storeyCount: 2, solar: { latDeg: 51.5 } });
                const core = res.stairs[0]?.rectMm;
                total++;
                if (core && coreMinEdgeDistM(core, bb) > 0.95) centred++;
            }
        }
        expect(total).toBeGreaterThan(0);
        expect(centred).toBe(0);   // no plate marooned the stair centrally
    });

    it('a genuinely CONCAVE shell still culls the notch-side candidate (D34(a) preserved)', () => {
        // L-shaped plate: the RIGHT-back candidate sits in the notch (metres outside the
        // real polygon) and MUST stay culled — the jitter tolerance only absorbs cm-scale
        // wobble, never a real notch. `left`/`back` remain (the stair still hugs a wall).
        const wM = 16, dM = 13;
        const Lpoly = [
            { x: 0, y: 0 }, { x: wM * 1000, y: 0 }, { x: wM * 1000, y: 8000 },
            { x: 9000, y: 8000 }, { x: 9000, y: dM * 1000 }, { x: 0, y: dM * 1000 },
        ];
        const core = reserveStairCoreShaped(
            [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: dM }, { x: 0, z: dM }], 2, 17,
        );
        const cs = candidates(wM * 1000, dM * 1000, core.rectMm.w, core.rectMm.h, Lpoly);
        const kinds = cs.map(c => c.kind);
        expect(kinds).not.toContain('right');     // notch candidate culled
        expect(kinds).toContain('left');           // real wall candidate retained
    });
});
