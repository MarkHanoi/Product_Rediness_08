// §POST-RESOLVE-PRESERVE (founder 2026-06-19) — regression lock for the §A.21.D28
// POST-OPENINGS whole-level re-resolve DESTROYING a correctly-welded wall.
//
// SYMPTOM (production): a partition welded fine in the initial build is destroyed by
// the post-openings `WallJoinResolver.resolveLevel` re-trim:
//   • COLLAPSE — its start is BOTH clamped to the shell inner face (+99mm) AND
//     corner-joined → it shrinks to a ~0.10m stub → §RESOLVED-STUB-SWEEP flags it
//     invalid → the builder SKIPS it → the partition VANISHES ("wall is gone") + a
//     ~1.6m §DIAG-PERIM-CORNER-WHOLE gap opens; OR
//   • PIVOT — a shell wall's body swings >20mm laterally off the previewed line
//     (§DIAG-PARITY/§PARITY-GATE ground latMax=162mm).
// The weld-time §WELD-NO-LATERAL-SHIFT guard can't catch either — it runs pre-commit,
// the destruction happens in WallRebuildCoordinator._flush AFTER commit.
//
// THE FIX (WallRebuildCoordinator._flush): if the re-resolve's result is DESTRUCTIVE
// vs the committed (welded) baseline of a previously-VALID wall — collapse into the
// degenerate band, an invalid flag, or a lateral pivot >20mm — KEEP the committed
// baseline and build the wall VALID. Along-axis miter/trim of any size is preserved.
// These tests lock that decision (the exact math used in the guard).

import { describe, it, expect } from 'vitest';

type Pt = { x: number; y?: number; z: number };

const STUB_LEN = 0.15;      // = DEGENERATE_STUB_LENGTH
const LATERAL_TOL = 0.02;   // = PARITY_TOL_MM (20mm)
const EXTEND_TOL = 0.50;    // a real miter extends a wall by < half its thickness; 0.5m = spike

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.z - a.z);

/** Max perpendicular distance of BOTH resolved endpoints to the committed (source)
 *  centreline — the same metric §DIAG-PARITY reports (catches translation AND pivot). */
function lateralShift(src: [Pt, Pt], resolved: [Pt, Pt]): number {
    const L = dist(src[0], src[1]) || 1e-9;
    const ux = (src[1].x - src[0].x) / L, uz = (src[1].z - src[0].z) / L;
    const perp = (p: Pt) => Math.abs((p.x - src[0].x) * uz - (p.z - src[0].z) * ux);
    return Math.max(perp(resolved[0]), perp(resolved[1]));
}

/** The guard decision: should the post-openings re-resolve result be REVERTED to the
 *  committed baseline? Mirrors WallRebuildCoordinator._flush §POST-RESOLVE-PRESERVE. */
function shouldPreserve(src: [Pt, Pt], resolved: [Pt, Pt], adjInvalid: boolean): boolean {
    const preLen = dist(src[0], src[1]);
    const wasValid = preLen >= STUB_LEN;
    if (!wasValid) return false;                       // a stub before → not ours to defend
    const newLen = dist(resolved[0], resolved[1]);
    const overExtended = newLen > preLen + EXTEND_TOL;
    return adjInvalid || newLen < STUB_LEN || lateralShift(src, resolved) > LATERAL_TOL || overExtended;
}

describe('§POST-RESOLVE-PRESERVE', () => {
    const src: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 4.12, y: 0, z: 0 }];   // a 4.12m welded partition

    it('PRESERVES a wall the re-resolve COLLAPSES to a 0.099m stub (the vanished partition)', () => {
        const collapsed: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 0.099, y: 0, z: 0 }];
        expect(shouldPreserve(src, collapsed, /*adjInvalid*/ false)).toBe(true);
    });

    it('PRESERVES a wall the stub-sweep flagged INVALID (joinData.invalid=true)', () => {
        // even if the reported baseline looks fine, an invalid flag means it would be skipped
        const samish: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 4.0, y: 0, z: 0 }];
        expect(shouldPreserve(src, samish, /*adjInvalid*/ true)).toBe(true);
    });

    it('PRESERVES a wall PIVOTED 162mm laterally off the previewed line', () => {
        const pivoted: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 4.12, y: 0, z: 0.162 }];
        expect(lateralShift(src, pivoted) * 1000).toBeCloseTo(162, 0);
        expect(shouldPreserve(src, pivoted, false)).toBe(true);
    });

    it('PRESERVES a wall the re-resolve OVER-EXTENDS into a diagonal spike (WA004: 2.286m → multi-metre)', () => {
        const wa004src: [Pt, Pt] = [{ x: 19.568, y: 0, z: -1.945 }, { x: 17.675, y: 0, z: -0.663 }]; // 2.286m
        // ill-conditioned miter shoots the end ~10m out ALONG the wall axis (point on the
        // source line extended: src[0] + 10·unit, so lateral≈0 — the hole my guard had).
        const spike: [Pt, Pt] = [{ x: 19.568, y: 0, z: -1.945 }, { x: 11.288, y: 0, z: 3.663 }];
        expect(lateralShift(wa004src, spike)).toBeLessThan(LATERAL_TOL);   // along-axis, NOT lateral
        expect(dist(spike[0], spike[1])).toBeGreaterThan(8);
        expect(shouldPreserve(wa004src, spike, false)).toBe(true);
    });

    it('PERMITS a pure along-axis miter/trim of any length (endTrimMax=468mm) — no-op', () => {
        const trimmed: [Pt, Pt] = [{ x: 0.468, y: 0, z: 0 }, { x: 3.9, y: 0, z: 0 }];
        expect(lateralShift(src, trimmed)).toBeLessThan(LATERAL_TOL);
        expect(shouldPreserve(src, trimmed, false)).toBe(false);
    });

    it('PERMITS a sub-tolerance perpendicular snap (≤20mm) — Level-01 stays clean', () => {
        const snapped: [Pt, Pt] = [{ x: 0.4, y: 0, z: 0.018 }, { x: 3.7, y: 0, z: 0.018 }];
        expect(shouldPreserve(src, snapped, false)).toBe(false);
    });

    it('does NOT defend a wall that was ALREADY a stub before the re-resolve (legit short jog)', () => {
        const shortSrc: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 0.10, y: 0, z: 0 }];
        const shorter: [Pt, Pt] = [{ x: 0, y: 0, z: 0 }, { x: 0.08, y: 0, z: 0 }];
        expect(shouldPreserve(shortSrc, shorter, false)).toBe(false);
    });
});
