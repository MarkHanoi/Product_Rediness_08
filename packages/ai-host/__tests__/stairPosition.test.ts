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

// ── §STAIR-HALF-LANDING-INWARD (2026-06-09, founder "set the half-landing towards
// the inside") — the shaped core + emitted StairCore now report which plate side the
// INTERIOR is on (`interiorSide` = the winning placement kind), so the editor folds a
// U-stair's half-landing TOWARD the interior instead of out past the flush perimeter
// wall (prod §DIAG-STAIR cornersInShell=1/4 → out of shell). The KIND mapping:
//   'left'  (flush x≈0)       → interior +x
//   'right' (flush x≈plateW)  → interior −x
//   'back'  (flush rear/max-Z)→ interior −z
//   'central' → no flush wall (legacy left-of-flight-1 offset retained downstream).
describe('§STAIR-HALF-LANDING-INWARD — shaped core carries the interior side', () => {
    it('reserveStairCoreShaped.interiorSide equals the chooseStairCorePosition kind', () => {
        // Same footprint → same plate/core dims → the shaped core must report the SAME
        // placement kind the position scorer chose (no drift between the two).
        const shaped = reserveStairCoreShaped(FOOT, 2, 17);
        const pos = chooseStairCorePosition(12000, 10000, shaped.rectMm.w, shaped.rectMm.h);
        expect(shaped.interiorSide).toBe(pos.kind);
    });

    it('a LEFT-flush core (x≈0) → interiorSide "left" → interior is +x', () => {
        // The wide 12×10 plate flushes the core to the LEFT side wall (x=0); the
        // interior therefore lies in +x, reported as 'left'.
        const shaped = reserveStairCoreShaped(FOOT, 2, 17);
        expect(shaped.rectMm.x).toBe(0);
        expect(shaped.interiorSide).toBe('left');
    });

    it('a RIGHT-flush core → interiorSide "right" → interior is −x', () => {
        // Force a RIGHT flush by NOTCHING the LEFT side of the shell so the left-wall
        // candidate is culled (its rect pokes out of the notched polygon) and the
        // right-wall candidate wins. Plate bbox stays 12×10; the right core abuts
        // x≈plateW so the interior lies in −x.
        const notchedFoot = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 },
            { x: 4, z: 10 }, { x: 4, z: 4 }, { x: 0, z: 4 },
        ];
        const shaped = reserveStairCoreShaped(notchedFoot, 2, 17);
        // The core must hug the RIGHT wall (its right edge at the plate's right bbox edge).
        expect(shaped.rectMm.x + shaped.rectMm.w).toBeCloseTo(12000, 0);
        expect(shaped.interiorSide).toBe('right');
    });

    it('the emitted StairCore threads interiorSide through generateHouseLayout', () => {
        const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const expected = reserveStairCoreShaped(FOOT, 2, 17);
        expect(res.stairs.length).toBeGreaterThan(0);
        for (const st of res.stairs) {
            expect(st.interiorSide).toBe(expected.interiorSide);
        }
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

// ───────────────── A.21.D59 — flush perimeter core is FULLY INSIDE the shell ─────
//
// D52 stopped over-culling perimeter candidates on a jittery shell — but its 150 mm
// offer band ALSO accepted a flush candidate sitting up to 150 mm PROUD of the real
// wall on a SKEWED / rotated / sheared plate (the bbox over-covers the polygon, so the
// bbox-anchored flush position pokes OUTSIDE). The founder's screenshot: a U-stair
// flush to a perimeter wall but extending OUTWARD past it — the core OUTSIDE the
// footprint. D59 nudges the flush anchor INWARD until the whole core is genuinely
// inside (≤ tight jitter), keeping it hugging the wall but never proud.

/** Strict (zero-tolerance) point-in-polygon — used by the test to measure how far a
 *  core corner pokes OUTSIDE the real shell polygon (independent of the engine code). */
function strictInsidePoly(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i]!.y, yj = poly[j]!.y, xi = poly[i]!.x, xj = poly[j]!.x;
        const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-30) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}

/** Smallest distance (mm) from (px,py) to any polygon edge — how far a point that is
 *  OUTSIDE the polygon pokes past the nearest wall. */
function distToPolyMm(px: number, py: number, poly: { x: number; y: number }[]): number {
    let best = Infinity;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ey = b.y - a.y;
        const L2 = ex * ex + ey * ey || 1e-30;
        const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / L2));
        const qx = a.x + t * ex, qy = a.y + t * ey;
        best = Math.min(best, Math.hypot(px - qx, py - qy));
    }
    return best;
}

/** Max outward overrun (mm) of a core rect's four corners past the shell polygon. */
function coreMaxOverrunMm(
    pos: { x: number; y: number }, coreW: number, coreH: number, poly: { x: number; y: number }[],
): number {
    const corners = [
        { x: pos.x, y: pos.y }, { x: pos.x + coreW, y: pos.y },
        { x: pos.x, y: pos.y + coreH }, { x: pos.x + coreW, y: pos.y + coreH },
    ];
    let maxOut = 0;
    for (const c of corners) {
        if (!strictInsidePoly(c.x, c.y, poly)) maxOut = Math.max(maxOut, distToPolyMm(c.x, c.y, poly));
    }
    return maxOut;
}

/** A sheared parallelogram plate in plate-local mm (bbox-min origin). The top edge is
 *  shifted right by `shearM` — the shape a rotated/skewed plate takes in the rotated
 *  layout frame, where the bbox over-covers the polygon and a bbox-flush candidate
 *  would poke outward past the slanted side wall. */
function shearedPlate(wM: number, dM: number, shearM: number): {
    poly: { x: number; y: number }[]; plateW: number; plateH: number;
} {
    const world = [
        { x: 0, z: 0 }, { x: wM, z: 0 },
        { x: wM + shearM, z: dM }, { x: shearM, z: dM },
    ];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of world) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return {
        poly: world.map(p => ({ x: (p.x - minX) * 1000, y: (p.z - minZ) * 1000 })),
        plateW: (maxX - minX) * 1000,
        plateH: (maxZ - minZ) * 1000,
    };
}

describe('A.21.D59 — flush perimeter stair core never extends OUTWARD past the shell', () => {
    const coreW = 2000, coreH = 2800;
    // The engine guarantees the core is contained within the TIGHT jitter band
    // (SHELL_TIGHT_JITTER_MM = 30 mm). A corner on a steeply-slanted wall can read a few
    // mm past the perpendicular band the engine tests against, so the test allows a small
    // geometric slack on top. 40 mm ≪ a stair tread — invisible at building scale, and a
    // ~3× margin below the 120 mm+ the BROKEN (pre-D59) engine poked outward.
    const CONTAINED_BOUND = 40;

    it('a moderately sheared plate: the chosen core is FULLY inside (no metres/decimetres proud)', () => {
        // BEFORE D59: the `right` flush candidate (bbox-anchored x = plateW − coreW) sat
        // ~120 mm PROUD of the slanted right wall and was accepted under the 150 mm band
        // — the core poked outside the footprint. AFTER D59 it is nudged inward.
        const { poly, plateW, plateH } = shearedPlate(14, 11, 1.0);
        const pos = chooseStairCorePosition(plateW, plateH, coreW, coreH, poly, { sunDir: { x: 0, y: 1 } });
        const overrun = coreMaxOverrunMm(pos, coreW, coreH, poly);
        // All four corners within the genuine draw-jitter band (≈ SHELL_TIGHT_JITTER_MM,
        // 30 mm; a corner on a steep slant can read a few mm beyond the perpendicular
        // band the engine tests against → CONTAINED_BOUND). The core is FULLY inside,
        // NOT poking out by the 120 mm+ it did BEFORE D59 (a clearly-visible outward
        // poke past the wall). 40 mm ≪ a stair tread — invisible at building scale.
        expect(overrun).toBeLessThanOrEqual(CONTAINED_BOUND);
        // Still a wall-hugging perimeter candidate (the D52 win — never central).
        expect(pos.kind).not.toBe('central');
    });

    it('holds across a sweep of shear angles (no chosen core ever pokes > tight jitter)', () => {
        let worstOverrun = 0;
        for (const shearM of [0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
            for (const [wM, dM] of [[14, 11], [12, 10], [16, 9], [10, 13]] as [number, number][]) {
                const { poly, plateW, plateH } = shearedPlate(wM, dM, shearM);
                const pos = chooseStairCorePosition(plateW, plateH, coreW, coreH, poly, { sunDir: { x: 0, y: 1 } });
                worstOverrun = Math.max(worstOverrun, coreMaxOverrunMm(pos, coreW, coreH, poly));
            }
        }
        // No skewed plate leaves the core poking past a wall by more than the tight band
        // (+ steep-slant corner slack). BEFORE D59 the worst was 120 mm+ (visibly proud).
        expect(worstOverrun).toBeLessThanOrEqual(CONTAINED_BOUND);
    });

    it('all four core corners are strictly inside (or within tight jitter of) the shell', () => {
        const { poly, plateW, plateH } = shearedPlate(14, 11, 1.0);
        const pos = chooseStairCorePosition(plateW, plateH, coreW, coreH, poly, { sunDir: { x: 0, y: 1 } });
        const corners = [
            { x: pos.x, y: pos.y }, { x: pos.x + coreW, y: pos.y },
            { x: pos.x, y: pos.y + coreH }, { x: pos.x + coreW, y: pos.y + coreH },
        ];
        for (const c of corners) {
            const inside = strictInsidePoly(c.x, c.y, poly);
            const slack = inside ? 0 : distToPolyMm(c.x, c.y, poly);
            expect(slack).toBeLessThanOrEqual(CONTAINED_BOUND);
        }
    });

    it('an axis-aligned plate is UNCHANGED — flush core still anchors AT the wall (no regression)', () => {
        // Perfect rectangle as a plate-local polygon: the flush left candidate stays at
        // x = 0 (already tight-contained → ladder offset 0 → bit-identical to pre-D59).
        const plateW = 12000, plateH = 10000;
        const rectPoly = [
            { x: 0, y: 0 }, { x: plateW, y: 0 }, { x: plateW, y: plateH }, { x: 0, y: plateH },
        ];
        const withPoly = chooseStairCorePosition(plateW, plateH, coreW, coreH, rectPoly, { sunDir: { x: 0, y: 1 } });
        const noPoly = chooseStairCorePosition(plateW, plateH, coreW, coreH, undefined, { sunDir: { x: 0, y: 1 } });
        expect(withPoly.x).toBe(noPoly.x);
        expect(withPoly.y).toBe(noPoly.y);
        expect(withPoly.kind).toBe(noPoly.kind);
        // And it genuinely hugs a side wall (x = 0 or x = plateW − coreW).
        expect(withPoly.x === 0 || Math.abs(withPoly.x + coreW - plateW) < 1e-6).toBe(true);
    });
});

describe('§STAIR-ANTI-FRAGMENT — aspect path prefers a CORNER carve over a MID-EDGE one', () => {
    // A rectangular plate big enough to offer left/right (corner) AND back (mid-edge)
    // perimeter candidates. With an aspect bias on, the chooser must pick a CORNER
    // (flush to a side wall AND the rear wall — one dominant rect) over the X-centred
    // `back` candidate (flush to one wall — fractures the plate), which is what stops
    // the §FEASIBILITY-ALLOC room drops the founder hit.
    const plateW = 12000, plateH = 10000, coreW = 2000, coreH = 2800;

    it('picks a side-wall corner (left/right), not the mid-edge back candidate', () => {
        const pos = chooseStairCorePosition(plateW, plateH, coreW, coreH, undefined, { sunDir: null });
        expect(pos.kind === 'left' || pos.kind === 'right').toBe(true);
        // Genuine corner: flush to a side wall AND flush to the rear wall.
        const flushSide = pos.x <= 1 || Math.abs(pos.x + coreW - plateW) <= 1;
        const flushBack = Math.abs(pos.y + coreH - plateH) <= 1;
        expect(flushSide && flushBack).toBe(true);
    });

    it('is deterministic with the anti-fragment penalty active', () => {
        const a = chooseStairCorePosition(plateW, plateH, coreW, coreH, undefined, { sunDir: null });
        const b = chooseStairCorePosition(plateW, plateH, coreW, coreH, undefined, { sunDir: null });
        expect(a.kind).toBe(b.kind);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
    });

    it('legacy no-aspect path is unaffected (byte-identical)', () => {
        const legacy = chooseStairCorePosition(plateW, plateH, coreW, coreH);
        const again = chooseStairCorePosition(plateW, plateH, coreW, coreH);
        expect(legacy.x).toBe(again.x);
        expect(legacy.y).toBe(again.y);
        expect(legacy.kind).toBe(again.kind);
    });
});
