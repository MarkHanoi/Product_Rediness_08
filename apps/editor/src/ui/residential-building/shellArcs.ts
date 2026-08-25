// shellArcs — ROUNDED PLAN CORNERS for the generated shell (§L-11130 · §L-11170).
//
// THE GAP. The boundary-line tool has a Curved mode and PRYZM builds CURVED WALLS
// (`Wall.curve`, a quadratic Bézier — live in production). But a curved boundary
// reaches the generator as a DENSIFIED POLYLINE (`arcSegmentThroughMidpoint`), and
// the shell builders emit one STRAIGHT wall per ring edge — so a rounded corner
// came out as a fan of short facets, and the founder's photograph (rounded ends,
// one continuous curved wall) could not be built. He said it plainly: "we can
// definitely do curved walls — this is fully working on production."
//
// WHAT THIS DOES. Split the footprint ring into RUNS: straight edges stay straight;
// an arc the tool tessellated becomes ONE arc run and one curved wall.
//
// ⛔ §L-11170 — THE FIRST VERSION OF THIS FILE WAS A HEURISTIC, AND IT FAILED THE
// FOUNDER'S OWN SHAPE. It flagged "short, gently-turning, same-sign" edges relative
// to the ring's LONGEST edge. Measured on the ring the Curved tool ACTUALLY emits
// (`shellArcsRealTool.spec.ts`, built by calling the tool's own sampler):
//   • a 30 × 12 block with BOTH right-hand corners rounded at r = 4 — the
//     photograph — came back as ONE arc of 33 chords: the 4 m straight between the
//     two corners is "short" against a 30 m façade, so the walk ran straight through
//     it and asked one quadratic Bézier to turn 180°, which it cannot.
//   • a user who never leaves Curved mode (straight edges as collinear "arcs") got
//     68 straight walls — the L-965 drum, one storey up.
// A relative threshold cannot tell "a short straight between two arcs" from "a
// chord". The fix is not another constant: the repo ALREADY has the exact answer.
//
// ⭐ THE ONE ARC-RECOVERY AUTHORITY. `resolveBoundarySegments` in
// `@pryzm/geometry-slab` (§L965-RECOVER-BOUNDARY-ARCS) reads a uniformly-sampled
// quadratic Bézier run back out of a polygon EXACTLY — constant second difference,
// control point solved in closed form, every claim REBUILT through the forward
// sampler and refused unless it reproduces the vertices to 1 mm. It was written for
// "walls by slab" on precisely this input (the same `arcSegmentThroughMidpoint`
// output), and it handles two gestures sharing a vertex. This module CONSUMES it;
// it does not re-derive it (C84 EI-8 — one vocabulary; the same lesson
// `curvedWallTessellation.ts` records after being copied three times).
//
// WHAT THAT BUYS. The curved wall's control is the control the user AUTHORED —
// the wall passes through the clicked midpoint exactly, not to "~1–2%". And a ring
// this recovery cannot read (an imported polyline, a ring decimated by the
// executor's 5 cm de-dupe at r < ~0.5 m, a true circle) falls back to straight
// edges — the pre-L-11130 behaviour, which is the honest fallback rather than a
// guessed curve. That limit is NAMED in the spec, not hidden.
//
// COLLINEAR CHORDS ARE ONE WALL. After recovery, consecutive straight chords whose
// interior vertices lie within 1 mm of the merged line are ONE straight run. That
// is the Curved-mode-for-everything case above (a collinear "arc" tessellates to 16
// exactly collinear chords) and it is a 1 mm rule, not an angle: a 5 cm wobble a
// user actually clicked on a 20 m façade is NOT merged, because it is 5 cm.

import { resolveBoundarySegments } from '@pryzm/geometry-slab';

export interface XZ { readonly x: number; readonly z: number }

export type ShellRun =
    | { readonly kind: 'line'; readonly a: XZ; readonly b: XZ }
    | {
          readonly kind: 'arc';
          readonly a: XZ;
          readonly b: XZ;
          /** Quadratic-Bézier control (world XZ) — the control the tool authored, recovered exactly. */
          readonly control: XZ;
          /** Tessellation count for `Wall.curve.segments` (≥ 4). */
          readonly segments: number;
          /** How many polyline chords the arc replaced — reported on the transcript. */
          readonly chords: number;
      };

/**
 * A straight vertex is dropped only when it sits within this distance of the line
 * through its run's endpoints — the same 1 mm the arc recovery uses to accept a
 * claim. Geometry never moves by more than this.
 */
export const COLLINEAR_TOLERANCE_M = 1e-3;

/** `Wall.curve.segments` for a recovered arc: twice the drawn chord count, never under 8. */
function segmentsFor(chords: number): number {
    return Math.max(8, chords * 2);
}

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function distToLine(p: XZ, a: XZ, b: XZ): number {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
    return Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / len;
}

/**
 * Split a CLOSED ring (no repeated last vertex) into runs. Pure and deterministic.
 * The result covers every ring edge exactly once, in ring order.
 * A ring with fewer than 3 vertices returns straight edges only.
 */
export function splitRingIntoRuns(ring: ReadonlyArray<XZ>): ShellRun[] {
    const n = ring.length;
    if (n < 3) {
        const out: ShellRun[] = [];
        for (let i = 0; i < n; i++) out.push({ kind: 'line', a: ring[i]!, b: ring[(i + 1) % n]! });
        return out;
    }

    // 1 · EXACT recovery. Segments come back in ring order covering all n chords;
    //     an arc carries `control`, a straight chord does not.
    const segments = resolveBoundarySegments(ring);

    // 2 · Straight chords between arcs are grouped into maximal collinear runs.
    const runs: ShellRun[] = [];
    let i = 0;
    while (i < segments.length) {
        const seg = segments[i]!;
        if (seg.control !== undefined) {
            runs.push({
                kind: 'arc',
                a: ring[seg.startIndex]!,
                b: ring[seg.endIndex]!,
                control: { x: seg.control.x, z: seg.control.z },
                segments: segmentsFor(seg.chords),
                chords: seg.chords,
            });
            i++;
            continue;
        }
        // Extend a straight run over following straight chords while every interior
        // vertex stays within tolerance of the line from the run's start to the
        // candidate end. Never across an arc (the loop stops at `control`).
        const startIdx = seg.startIndex;
        let endIdx = seg.endIndex;
        let j = i + 1;
        while (j < segments.length && segments[j]!.control === undefined) {
            const candEnd = segments[j]!.endIndex;
            const a = ring[startIdx]!, b = ring[candEnd]!;
            // interior vertices: startIdx+1 … candEnd-1 (ring order, wrapping)
            let ok = true;
            for (let k = (startIdx + 1) % n; k !== candEnd; k = (k + 1) % n) {
                if (distToLine(ring[k]!, a, b) > COLLINEAR_TOLERANCE_M) { ok = false; break; }
            }
            if (!ok) break;
            endIdx = candEnd;
            j++;
        }
        runs.push({ kind: 'line', a: ring[startIdx]!, b: ring[endIdx]! });
        i = j;
    }
    return runs;
}
