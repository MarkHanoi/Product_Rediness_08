// ─── §MEASURED-PRISM-SPIKE — L-920 PROBE (supersedes the L-909a mechanism text) ──
//
// FOUNDER REPORT (raised many times, still shipping):
//   "TWO WALLS CONNECTED (LAYERED WALLS) IN L SHAPE, ANOTHER WALL JOINS — LOOK
//    THE JOINT, REALLY BAD. AND IN 3D WE GET A CORRUPTED GEOMETRY — TRIANGLE."
//
// WHAT IS TRUE AT HEAD: `WallJunctionInfill.computeJunctionInfills` builds a
// literal extruded TRIANGLE per 3-wall cluster from UNCLAMPED line-line
// intersection vertices. `_intersect2D_XZ` guards only `|denom| < 1e-9` — a
// DIMENSIONLESS near-parallel test with NO distance cap. That much of L-909a
// holds exactly, and this file measures vertices HUNDREDS OF METRES from the
// junction as a result.
//
// ⚠ WHAT L-909a GOT WRONG — recorded so the next reader does not chase it:
// L-909a named the trigger as "a near-collinear PASS-THROUGH T sends a vertex
// metres out". MEASURED, that case is SAFE at equal thickness (fixture E below:
// 0.303 m at 175 deg, and it gets SMALLER toward collinear, 0.290 m at 179.9).
// The reason is that the two edge-line ANCHORS converge at exactly the rate the
// denominator vanishes when the walls are anti-parallel, so the 1/sin blow-up
// cancels. The REAL trigger is the opposite geometry:
//
//   ⇒ TWO WALLS LEAVING THE JUNCTION CO-DIRECTIONALLY AT AN ACUTE ANGLE.
//     There the anchors sit a full thickness apart (one at +t/2 outward, one at
//     −t/2) while the denominator still vanishes — so the vertex distance goes
//     as t/sin(Δ) and is UNBOUNDED.
//
// ⇒ AND (not in L-909a at all) DIFFERING THICKNESSES BREAK THE CANCELLATION,
//   which re-arms the pass-through case: fixture F is the SAME 175 deg
//   pass-through as safe fixture E, but with a thinner joining wall, and it
//   spikes to 1.606 m. A layered 375 mm exterior wall + a thinner partition
//   joining is an utterly ordinary draw, and it is the likeliest match for the
//   founder's photos.
//
// THE CONTROL THAT MAKES THE VERDICT MEAN SOMETHING: fixture A (the founder's
// literal 90-degree L + perpendicular T) drives the SAME function, SAME walls,
// SAME snap radius and stays at 0.290 m. So the blow-up is the ANGLE and the
// THICKNESS RATIO, not a harness artefact.
//
// NOTE THE SHAPE OF THE BUG: the EXACT degeneracy is safe (fixture D, walls
// exactly parallel → denom ≈ 0 → the 1e-9 guard fires → midpoint fallback). It
// is the NEAR-MISS that is catastrophic. A guard that only catches exact
// parallelism is worse than useless here: it certifies the one case that was
// never dangerous and waves through the 215 m one.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED AT HEAD, PRE-FIX — layered walls, t = 0.375 m (wt-exterior-brick).
// Distances are max infill-vertex distance from the cluster consensus point.
//   A  L + perpendicular T (90 deg apart)      0.290 m =   0.77x t   SANE (control)
//   B  acute 5 deg between two legs            4.324 m =  11.5x t    SPIKE
//   C  near-duplicate 0.1 deg                214.884 m = 573x t      CATASTROPHIC
//   D  EXACTLY parallel (guard fires)          0.290 m =   0.77x t   safe
//   E  pass-through T 175 deg, equal t         0.303 m =   0.81x t   SANE  ← L-909a's
//                                                                      stated case
//   F  pass-through T 175 deg, W3 t=0.1        1.606 m =   4.3x t    SPIKE ← new
//   Acute sweep: 2x-thickness bound is crossed at ~30 deg of separation;
//   40 deg → 0.573 m, 30 deg → 0.749 m, 10 deg → 2.176 m, 1 deg → 21.511 m.
//
// AFTER §JUNCTION-VERTEX-CLAMP (this file now asserts the right-hand column):
//   A  0.290 → 0.290 m   unchanged (below the bound — byte-identical)
//   B  4.324 → 0.825 m   clamped
//   C  214.884 → 0.825 m clamped
//   D  0.290 → REFUSED   typed 'collapsed-polygon', no geometry emitted
//   E  0.303 → 0.303 m   unchanged
//   F  1.606 → 0.825 m   clamped
//   sweep 40/30 deg unchanged; 20/10/5/1/0.1 deg all pinned at the bound.
//   0.825 = the 0.800 m clamp bound + §JUNCTION-INFLATE's 0.025 m outward.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeJunctionInfills, computeJunctionInfillsDetailed } from '../src/WallJunctionInfill';
import type { WallData } from '../src/WallTypes';

const T = 0.375;   // wt-exterior-brick total thickness — the founder's layered wall

let _seq = 0;

/** A LAYERED wall — the path the founder is on, and the path the infill is still live for. */
function layeredWall(s: [number, number], e: [number, number], thickness = T): WallData {
    return {
        id: `sp${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: [
            { name: 'render-ext', thickness: thickness * 0.04 },
            { name: 'core',       thickness: thickness * 0.92 },
            { name: 'render-int', thickness: thickness * 0.04 },
        ],
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

/** The junction corner every fixture shares. */
const P = { x: 5, z: 0 };

/**
 * The founder's L, plus a third wall joining AT the corner.
 *
 * W1 arrives along -x and ENDS at the corner — so its direction FROM the corner
 * (which is what the infill sorts on) is 180 deg. W2 LEAVES the corner along +z,
 * direction 90 deg. `deg` is W3's direction from the corner, CCW from +x.
 * So the separation from W2 is |90 - deg| and from W1 is |180 - deg|.
 */
function founderCluster(deg: number, w3Thickness = T): WallData[] {
    const r = (deg * Math.PI) / 180;
    return [
        layeredWall([0, 0], [P.x, P.z]),                                          // W1  L leg
        layeredWall([P.x, P.z], [P.x, P.z + 5]),                                  // W2  L leg
        layeredWall([P.x, P.z], [P.x + 5 * Math.cos(r), P.z + 5 * Math.sin(r)], w3Thickness),
    ];
}

/** Max distance, in metres, of any emitted infill vertex from the junction. */
function maxVertexDistance(walls: WallData[]): { count: number; max: number } {
    const infills = computeJunctionInfills(walls);
    let max = 0;
    for (const inf of infills) {
        for (const v of inf.vertices) max = Math.max(max, Math.hypot(v.x - P.x, v.z - P.z));
    }
    return { count: infills.length, max };
}

describe('§MEASURED-PRISM-SPIKE — junction infill vertex distance (L-920)', () => {

    it('CONTROL — founder L + perpendicular T stays inside a real mitre (0.290 m)', () => {
        const m = maxVertexDistance(founderCluster(-90));
        expect(m.count).toBe(1);
        expect(m.max).toBeCloseTo(0.290, 2);
        // If this control ever exceeds 2x thickness the harness is lying and every
        // other number in this file is worthless.
        expect(m.max).toBeLessThan(2 * T);
    });

    // §JUNCTION-VERTEX-CLAMP bound for these fixtures: 4*(t/2) + 0.05 = 0.800 m,
    // plus §JUNCTION-INFLATE's 0.025 m outward = 0.825 m as EMITTED.
    const BOUND_EMITTED = 0.825;

    it('§JUNCTION-VERTEX-CLAMP — the acute 5 deg corner: 4.324 m BEFORE → 0.825 m after', () => {
        const m = maxVertexDistance(founderCluster(85));   // 5 deg from W2
        expect(m.count).toBe(1);
        expect(m.max).toBeCloseTo(BOUND_EMITTED, 3);
    });

    it('§JUNCTION-VERTEX-CLAMP — the near-duplicate: 214.884 m BEFORE → 0.825 m after', () => {
        const m = maxVertexDistance(founderCluster(89.9));
        expect(m.count).toBe(1);
        expect(m.max).toBeCloseTo(BOUND_EMITTED, 3);
    });

    it('EXACTLY parallel — a duplicate wall now REFUSES rather than emitting a patch', () => {
        const r = computeJunctionInfillsDetailed(founderCluster(90));
        expect(r.infills).toHaveLength(0);
        expect(r.refusals).toHaveLength(1);
        // Typed refusal, not a console.warn — a developer trace is not a refusal.
        // The vertices are SPREAD but collinear (the duplicate wall contributes no
        // independent direction), so it is the zero-area arm that catches it, not
        // the collapsed-onto-the-junction arm.
        expect(r.refusals[0].reason).toBe('zero-area-polygon');
        expect(r.refusals[0].clampBound).toBeCloseTo(0.800, 3);
    });

    it('L-909a\'s STATED case (pass-through T, equal thickness) is SAFE and UNTOUCHED by the clamp', () => {
        // Byte-identical to the pre-fix measurement: a legitimate vertex is well
        // inside the bound and passes through unchanged.
        expect(maxVertexDistance(founderCluster(5)).max).toBeCloseTo(0.303, 2);
        expect(maxVertexDistance(founderCluster(0.1)).max).toBeLessThan(0.303);
    });

    it('§JUNCTION-VERTEX-CLAMP — the thin-newcomer pass-through: 1.606 m BEFORE → 0.825 m after', () => {
        const m = maxVertexDistance(founderCluster(5, 0.1));
        expect(m.max).toBeCloseTo(BOUND_EMITTED, 3);
    });

    it('ACUTE SWEEP — legitimate values unchanged, every runaway pinned at the bound', () => {
        // Below the bound → BYTE-IDENTICAL to the pre-fix numbers (the clamp only
        // ever touches the runaway, exactly as §MITER-T-CLAMP does).
        expect(maxVertexDistance(founderCluster(90 - 40)).max).toBeCloseTo(0.573, 2);
        expect(maxVertexDistance(founderCluster(90 - 30)).max).toBeCloseTo(0.749, 2);
        // Above the bound → clamped. Pre-fix these were 1.105 / 2.176 / 4.324 /
        // 21.511 / 214.884 m.
        for (const sep of [20, 10, 5, 1, 0.1]) {
            expect(maxVertexDistance(founderCluster(90 - sep)).max).toBeCloseTo(BOUND_EMITTED, 3);
        }
    });

    it('NOTHING on this path can emit a vertex past the bound, at any angle or thickness', () => {
        // The honest form of the fix: a sweep of the WHOLE parameter space this
        // lane can reach, not one fixture. 3-wall clusters only — see the header
        // of WallJunctionIncumbentAuthority.measure.test.ts for what is NOT proven.
        for (let deg = -180; deg <= 180; deg += 0.5) {
            for (const t3 of [0.05, 0.1, 0.2, 0.375, 0.6]) {
                const m = maxVertexDistance(founderCluster(deg, t3));
                const bound = 4 * (Math.max(T, t3) / 2) + 0.05 + 0.025 + 1e-9;
                expect(m.max).toBeLessThanOrEqual(bound);
            }
        }
    });
});
