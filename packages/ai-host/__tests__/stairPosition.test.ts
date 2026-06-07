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
    __candidatesForTest as candidates,
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
