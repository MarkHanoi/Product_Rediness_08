// §RESI-CORRIDOR-ECONOMY (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 §2.4 / P1-2, C53) —
// the corridor-economy objective + served-cell band trim.
//
// THE FINDING this suite pins: the candidate objective was (feasibleCount, cellCount,
// placedArea) — corridor area appeared in NO term, so a corridor-heavy candidate that tied
// on the first two terms won (or held the tie) over an identical-capacity tighter one, and
// every band ran the full plate width regardless of what it served. The fix charges
// corridor union area in the area term (λ=1) and trims each horizontal band to the hull of
// its served door spans + network junctions. OBJECTIVE STEERS, GATES DECIDE:
// §RESI-CORE-CIRCULATION repair/tag run AFTER the trim, and every assertion here checks the
// gates still pass (all reached, all core-reachable, no overlaps).
//
// The 36×64 fixture is measured, not invented: under the OLD objective it ships FIVE
// horizontal corridor lines (two near-duplicate pairs) for 24 apartments; the economy
// objective picks the THREE-line candidate serving the SAME 24 at the SAME fillRatio with
// ~103 m² less corridor.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    partitionLevelPlate,
    type PlatePartitionInput,
    type ApartmentDemand,
    type PlatePartitionResult,
} from '../platePartition';
import type { Pt, Rect } from '../../apartmentLayout/tgl/rectDecomposition';

const T2: ApartmentDemand = { typology: 'T2', minAreaM2: 55, maxAreaM2: 80 };

function rectPoly(w: number, d: number): Pt[] {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
}

function plateInput(w: number, d: number, demandCount = 40): PlatePartitionInput {
    const cx = w / 2, cz = d / 2;
    return {
        levelIndex: 1,
        footprint: rectPoly(w, d),
        core: { x0: cx - 1.5, z0: cz - 2, x1: cx + 1.5, z1: cz + 2 },
        corridor: { widthM: 1.5 },
        apartments: Array.from({ length: demandCount }, () => T2),
    };
}

function expectOk(out: ReturnType<typeof partitionLevelPlate>): PlatePartitionResult {
    expect(out.status).toBe('ok');
    return out as PlatePartitionResult;
}

function overlaps(a: Rect, b: Rect): boolean {
    return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-3 &&
           Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-3;
}

/** Distinct horizontal corridor centrelines (the shipped corridor "lines"). */
function horizontalLineCount(r: PlatePartitionResult): number {
    const distinct = new Set(
        r.publicCorridor
            .filter((b) => (b.x1 - b.x0) >= (b.z1 - b.z0))
            .map((b) => (((b.z0 + b.z1) / 2)).toFixed(1)),
    );
    return distinct.size;
}

/** The full gate battery: every cell reached, every cell core-reachable, no overlaps. */
function expectGatesPass(r: PlatePartitionResult): void {
    expect(r.apartmentsReached).toBe(r.apartmentCells.length);
    expect(r.apartmentsCoreReachable).toBe(r.apartmentCells.length);
    for (const c of r.apartmentCells) expect(c.coreReachable).toBe(true);
    const cells = r.apartmentCells;
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            expect(overlaps(cells[i]!.rect, cells[j]!.rect)).toBe(false);
        }
        for (const band of r.publicCorridor) {
            expect(overlaps(cells[i]!.rect, band)).toBe(false);
        }
    }
}

const g = globalThis as { __pryzmCorridorEconomy?: boolean };

describe('§RESI-CORRIDOR-ECONOMY — corridor-charged objective + served-cell band trim', () => {
    beforeEach(() => { delete g.__pryzmCorridorEconomy; });
    afterEach(() => { delete g.__pryzmCorridorEconomy; });

    it('36×64 fixture — the OLD objective ships the corridor-heavy candidate; the economy objective picks the tighter one (same apartments, all gates passing)', () => {
        g.__pryzmCorridorEconomy = false;
        const old = expectOk(partitionLevelPlate(plateInput(36, 64)));
        delete g.__pryzmCorridorEconomy;   // default = economy ON
        const eco = expectOk(partitionLevelPlate(plateInput(36, 64)));

        // Same capacity, same fill — NOT one apartment traded away…
        expect(eco.apartmentCells.length).toBe(old.apartmentCells.length);
        expect(eco.fillRatio).toBeCloseTo(old.fillRatio, 3);
        // …but the tighter corridor network wins: fewer horizontal corridor lines and
        // materially less corridor m² (the measured fixture: 5 lines/346.5 m² → 3 lines/243 m²).
        expect(horizontalLineCount(eco)).toBeLessThan(horizontalLineCount(old));
        expect(eco.corridorAreaM2).toBeLessThan(old.corridorAreaM2 - 50);
        // The gates still decide — and they all pass on the tighter winner.
        expectGatesPass(eco);
    });

    it('band trim — a plate whose winner is unchanged still sheds dead corridor past its last served cell (40×24: same 8 apartments, ~27% less corridor)', () => {
        g.__pryzmCorridorEconomy = false;
        const old = expectOk(partitionLevelPlate(plateInput(40, 24)));
        delete g.__pryzmCorridorEconomy;
        const eco = expectOk(partitionLevelPlate(plateInput(40, 24)));

        expect(eco.apartmentCells.length).toBe(old.apartmentCells.length);
        expect(eco.fillRatio).toBeCloseTo(old.fillRatio, 3);
        expect(eco.corridorAreaM2).toBeLessThan(old.corridorAreaM2);
        expectGatesPass(eco);
        // Every cell's entry door still lands on a core-connected span (the trim keeps
        // served door spans by construction) — §RESI-CORE-DOOR offsets survive.
        const withDoor = eco.apartmentCells.filter((c) => typeof c.coreDoorOffset === 'number').length;
        const oldWithDoor = old.apartmentCells.filter((c) => typeof c.coreDoorOffset === 'number').length;
        expect(withDoor).toBeGreaterThanOrEqual(oldWithDoor);
    });

    it('fillRatio + corridorAreaM2 are surfaced on the result (no longer diagnostic-only)', () => {
        const r = expectOk(partitionLevelPlate(plateInput(36, 24)));
        expect(r.fillRatio).toBeGreaterThan(0);
        expect(r.fillRatio).toBeLessThanOrEqual(1);
        expect(r.corridorAreaM2).toBeGreaterThan(0);
        expect(r.diagnostic).toContain('§DIAG-RESI-FILL');
        expect(r.diagnostic).toContain('§RESI-CORRIDOR-ECONOMY');
    });

    it('deterministic — two economy runs are structurally identical', () => {
        const a = expectOk(partitionLevelPlate(plateInput(36, 64)));
        const b = expectOk(partitionLevelPlate(plateInput(36, 64)));
        expect(b.apartmentCells).toEqual(a.apartmentCells);
        expect(b.publicCorridor).toEqual(a.publicCorridor);
        expect(b.corridorAreaM2).toBe(a.corridorAreaM2);
    });

    it('kill-switch — __pryzmCorridorEconomy=false restores untrimmed full-width behaviour', () => {
        g.__pryzmCorridorEconomy = false;
        const off = expectOk(partitionLevelPlate(plateInput(40, 24)));
        // The old path's horizontal bands span the full plate width (modulo the core split);
        // the widest horizontal band reaches both plate edges.
        const horiz = off.publicCorridor.filter((b) => (b.x1 - b.x0) >= (b.z1 - b.z0));
        expect(Math.min(...horiz.map((b) => b.x0))).toBeCloseTo(0, 3);
        expect(Math.max(...horiz.map((b) => b.x1))).toBeCloseTo(40, 3);
        expectGatesPass(off);   // the old behaviour also passed its gates — unchanged
    });
});
