// §GROUND-WALL-FRAME (PREVIEW↔EXECUTION PARITY, 2026-06-18) — regression lock for the
// founder's 1.5 m GROUND wall lateral-shift defect.
//
// SYMPTOM (production, repeatable): §DIAG-PARITY reported the ground floor with
// `walls=16 shifted=5 latMax=1504mm` while Level 01 read `latMax=0mm`. FIVE ground
// partitions were welded ~1.5 m off their previewed (OPTION) centreline and left open
// `§DIAG-PERIM-CORNER-WHOLE GAP=1517mm` corners, yet the §WELD-NO-LATERAL-SHIFT guard —
// which is SUPPOSED to revert any weld body-shift >0.10 m to the previewed baseline —
// never fired.
//
// ROOT (HouseLayoutExecutor `_weldGroundPartitions`): the PROJECT-NORTH weld rectifies
// the de-rotated DRAWN ground shell and welds partitions onto the RECTIFIED shell; the
// re-rotation lever arm amplifies the per-edge rectify (≤0.50 m) to ~1.5 m at a long
// partition's perimeter end, PIVOTING the wall off the previewed line. The upper floor
// is immune because its perimeter is the clean `storey.footprint` ring (rectify ≈ no-op).
//
// WHY THE GUARD MISSED IT: it measured ONLY the welded MIDPOINT's perpendicular distance
// to the OPTION line. A wall pivoted about (near) its centre keeps its MIDPOINT on the
// line (lateral ≈ 0) while both ENDPOINTS swing ±1.5 m off it — so a gross rotation slips
// straight through the midpoint test.
//
// THE FIX: measure lateral as the MAX perpendicular distance of BOTH welded ENDPOINTS to
// the OPTION centreline (the SAME metric §DIAG-PARITY reports), so body translation AND
// rotation/pivot are both caught and reverted to the previewed baseline. These tests lock
// that the endpoint-max metric flags the pivot the midpoint metric misses, while a clean
// along-axis end-trim (the legitimate miter) stays UN-flagged on both metrics.

import { describe, it, expect } from 'vitest';

type Pt = { x: number; z: number };

const WELD_LATERAL_REVERT_M = 0.10;

/** The OLD (buggy) metric — perpendicular distance of the welded MIDPOINT to the OPTION
 *  centreline. Misses a pivot about the midpoint. */
function midpointLateral(option: [Pt, Pt], welded: [Pt, Pt]): number {
    const [ob0, ob1] = option;
    const origLen = Math.hypot(ob1.x - ob0.x, ob1.z - ob0.z);
    const odx = (ob1.x - ob0.x) / origLen, odz = (ob1.z - ob0.z) / origLen;
    const wmx = (welded[0].x + welded[1].x) / 2, wmz = (welded[0].z + welded[1].z) / 2;
    return Math.abs((wmx - ob0.x) * odz - (wmz - ob0.z) * odx);
}

/** The FIXED metric — MAX perpendicular distance of BOTH welded ENDPOINTS to the OPTION
 *  centreline (identical to §DIAG-PARITY's own `latMm`). Catches translation AND rotation. */
function endpointMaxLateral(option: [Pt, Pt], welded: [Pt, Pt]): number {
    const [ob0, ob1] = option;
    const origLen = Math.hypot(ob1.x - ob0.x, ob1.z - ob0.z);
    const odx = (ob1.x - ob0.x) / origLen, odz = (ob1.z - ob0.z) / origLen;
    const perp = (p: Pt): number => Math.abs((p.x - ob0.x) * odz - (p.z - ob0.z) * odx);
    return Math.max(perp(welded[0]), perp(welded[1]));
}

describe('§GROUND-WALL-FRAME — §WELD-NO-LATERAL-SHIFT lateral metric', () => {
    // A 6 m horizontal partition the engine/preview drew along z = 0.
    const option: [Pt, Pt] = [{ x: 0, z: 0 }, { x: 6, z: 0 }];

    it('reverts a 1.5 m PIVOT the old midpoint metric missed (the founder defect)', () => {
        // The PN weld pivoted the wall about its centre: each end swings 1.5 m off the
        // previewed line in opposite directions. This is the §DIAG-PARITY latMax=1504mm.
        const pivoted: [Pt, Pt] = [{ x: 0, z: -1.5 }, { x: 6, z: 1.5 }];

        // OLD metric: midpoint sits on the line → lateral ≈ 0 → NOT reverted (the bug).
        expect(midpointLateral(option, pivoted)).toBeLessThan(WELD_LATERAL_REVERT_M);

        // FIXED metric: endpoint-max lateral = 1.5 m → reverted to the previewed baseline.
        const lat = endpointMaxLateral(option, pivoted);
        expect(lat).toBeGreaterThan(WELD_LATERAL_REVERT_M);
        expect(lat).toBeCloseTo(1.5, 6);
    });

    it('reverts a pure BODY translation (the upper-floor latMax=237mm case) on BOTH metrics', () => {
        // Both ends shifted the SAME 0.237 m sideways — the midpoint moves too, so the old
        // metric already caught this; the new metric must keep catching it (no regression).
        const translated: [Pt, Pt] = [{ x: 0, z: 0.237 }, { x: 6, z: 0.237 }];
        expect(midpointLateral(option, translated)).toBeGreaterThan(WELD_LATERAL_REVERT_M);
        expect(endpointMaxLateral(option, translated)).toBeGreaterThan(WELD_LATERAL_REVERT_M);
    });

    it('does NOT revert a legitimate along-axis end-trim (the expected miter) — byte-identical', () => {
        // A clean shell-snap / miter moves endpoints only ALONG the wall axis (shorter at a
        // junction) — it never shifts the body laterally. Both metrics read ~0 → preserved.
        const trimmed: [Pt, Pt] = [{ x: 0.4, z: 0 }, { x: 5.6, z: 0 }];
        expect(midpointLateral(option, trimmed)).toBeLessThan(WELD_LATERAL_REVERT_M);
        expect(endpointMaxLateral(option, trimmed)).toBeLessThan(WELD_LATERAL_REVERT_M);
        // Sub-tolerance perpendicular snap (≤0.10 m onto a shell line) is also preserved.
        const snapped: [Pt, Pt] = [{ x: 0.4, z: 0.08 }, { x: 5.6, z: 0.08 }];
        expect(endpointMaxLateral(option, snapped)).toBeLessThan(WELD_LATERAL_REVERT_M);
    });
});
