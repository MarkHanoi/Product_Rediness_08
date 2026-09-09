// SiteworksGeometry — the sweep, the footprint resolver and the one area answer.
// C116 §10 · ADR-0384 D2 · C84 EI-1 / EI-9.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LAYERING — L2, and pure
// ═══════════════════════════════════════════════════════════════════════════════
// Imports `@pryzm/schemas` (L0) and `@pryzm/geometry-kernel` (L2, the anchor every
// `geometry-*` package is allowed to sit on). ⛔ THREE-free (P2), DOM-free, I/O-free.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THE OFFSET ARITHMETIC IS NOT IN THIS FILE, AND THAT IS DELIBERATE
// ═══════════════════════════════════════════════════════════════════════════════
// `sweepCentrelineToRing` is the family's ONE NAMED AUTHORITY under C84 EI-1 — but
// it CALLS `offsetOpenPolyline` in `@pryzm/geometry-kernel` rather than computing a
// mitre itself.
//
// The standing instruction was to grep for the existing solver before writing one
// ([[grep-for-the-existing-solver-first]]). Measured, and the answer was better than
// "one exists":
//
//   • `packages/geometry-kernel/src/pure/polygonOffset.ts` is, in its own header,
//     *"THE polygon offset for this repo … If you are about to add a third, don't:
//     extend this one and add a fixture."*
//   • `tools/ga-gate/check-offset-implementations.ts` COUNTS independent offset
//     implementations. It reads 0 outside that file and its exit target is 0. Its
//     `edge-shift-miter` signature matches the Cramer solve of two shifted
//     supporting lines — which is EXACTLY the arithmetic a ribbon sweep needs. A
//     mitre written here would have taken the gate 0 → 1 and failed it.
//   • The gate's header records why it exists: the same offset lived in three
//     places at three levels of correctness, the UNTOUCHED copy was the one the
//     shipping committer called, and a user asking for a 300 mm eave got 212 mm.
//     Each copy passed its own package's tests.
//
// ⭐ So the kernel gained `offsetOpenPolyline` — the OPEN half of the arithmetic it
//    already owned, sharing `shiftedLineFor` and `miterVertexInto` with
//    `offsetPolygon` — and this file assembles a ribbon from two calls to it. The
//    `polygonOffset.oracle.test.ts` suite (13/13) is the proof that extracting the
//    shared mitre changed no closed-ring behaviour.
//
// ═══════════════════════════════════════════════════════════════════════════════
// §CONTEXT-DATA-HONESTY (L-581 / L-616) — A REFUSAL IS NEVER AN EMPTY RING
// ═══════════════════════════════════════════════════════════════════════════════
// Every entry point returns a DISCRIMINATED UNION, never a bare array or number.
// "The sweep could not be computed" and "the surface has no area" must not share a
// value, or a panel would print 0 m² for a road it failed to solve and an
// architect would believe it.

import {
    offsetOpenPolyline,
    findSelfIntersection,
    dedupeRing,
    polygonSignedArea2D,
    type Pt2,
} from '@pryzm/geometry-kernel';
import type { Siteworks } from '@pryzm/schemas';

/** A ground-plane point as the schema stores it. `y` is always 0 (enforced there). */
export interface GroundPoint { readonly x: number; readonly y: number; readonly z: number }

const toPt2 = (p: GroundPoint): Pt2 => [p.x, p.z];
const toGround = (p: Pt2): GroundPoint => ({ x: p[0], y: 0, z: p[1] });

/**
 * ⭐ THE RESULT SHAPE. A refusal carries a REASON a human can act on; a success
 * carries the ring. There is no third state and no sentinel.
 */
export type SweepResult =
    | {
        readonly ok: true;
        /** The closed footprint ring, OPEN (the closing vertex is implied), CCW. */
        readonly ring: readonly GroundPoint[];
        /**
         * ⚠ True when at least one corner was too sharp for an exact mitre and was
         * BEVELLED. The ring is still usable — this is a fidelity note, not a
         * failure — but it is REPORTED rather than swallowed, because a road drawn
         * with a hairpin will not look like the user's polyline and they are
         * entitled to know which corner moved.
         */
        readonly bevelled: boolean;
    }
    | { readonly ok: false; readonly reason: string };

/**
 * ⭐ THE ONE AUTHORITY (C84 EI-1) that turns a LINEAR siteworks surface into a
 * footprint ring. Every consumer that needs the footprint of a linear surface calls
 * this. A second sweep anywhere is [[same-rule-two-implementations]].
 *
 * ⛔ THE RING IS NEVER STORED (ADR-0384 D2). This is the wall's own rule: `Wall`
 * stores `start`, `end` and `thickness` and does not store the rectangle those three
 * imply. A stored ring destroys the authored intent — *"make this road 9 m wide"*
 * becomes an edit of forty vertices instead of one number — and storing BOTH would
 * be two answers to *"where is this road"* (C84 EI-9) where the second goes stale on
 * the next `setWidth`.
 *
 * ⭐ SELF-INTERSECTION IS MEASURED, NOT ASSUMED AWAY. C116 §10b listed
 * *"self-intersection on a tight reversal"* as `NOT MEASURED`. It is measured here:
 * the assembled ring is run through the kernel's `findSelfIntersection` and a fold
 * is REFUSED BY NAME with the two crossing edge indices. A folded ribbon rendered as
 * if it were sound is geometry the user believes.
 *
 * ⚠ WHAT IS STILL NOT MEASURED: whether a bevelled hairpin is the shape a road
 * designer would want (it is the shape the mitre limit produces), and the behaviour
 * of a centreline whose corner radius is smaller than half the width but which does
 * NOT actually cross — that ring is returned, and it may pinch.
 */
export function sweepCentrelineToRing(
    centreline: readonly GroundPoint[],
    widthM: number,
): SweepResult {
    if (centreline.length < 2) {
        return {
            ok: false,
            reason:
                `A centreline needs at least 2 points to sweep; got ${centreline.length}. `
                + 'One point is a location, not a road.',
        };
    }
    if (!Number.isFinite(widthM) || widthM <= 0) {
        return {
            ok: false,
            reason:
                `Width must be a positive, finite number of metres; got ${String(widthM)}. `
                + 'A zero-width road is a line, and a line has no footprint to render.',
        };
    }

    const pts = centreline.map(toPt2);
    const half = widthM / 2;

    // Two offsets of the SAME polyline, one to each side. The kernel owns both.
    const right = offsetOpenPolyline(pts, half);
    const left = offsetOpenPolyline(pts, -half);

    if (right.degenerate || left.degenerate) {
        const why = right.degenerate ? right.reason : left.reason;
        return {
            ok: false,
            reason: `The centreline could not be offset by ${half} m: ${why ?? 'unknown'}.`,
        };
    }

    // ⭐ WALK OUT ALONG THE +NORMAL SIDE AND BACK ALONG THE −NORMAL SIDE. That order
    // is not arbitrary and it is not a detail: it is what makes the ring CCW, which
    // is the winding every ring consumer in this repo assumes. Because the +normal
    // side is always to one fixed hand of the direction of travel, the traversal
    // sense is the same whichever way the user drew the centreline — a road drawn
    // right-to-left produces the same winding as one drawn left-to-right.
    //
    // ⚠ AN EXPLICIT `signedArea > 0 ? ring : reverse(ring)` NORMALISATION STOOD HERE
    // AND WAS REMOVED, because it was DEAD CODE and the scramble control proved it:
    // deleting it changed no test result, since the assembly order had already made
    // every ring CCW. A guard that cannot fire reads as protection and provides
    // none — it would have told a future reader that winding was a hazard being
    // handled here, when in fact it is an invariant established one line above.
    const assembled: Pt2[] = [...right.polyline, ...[...left.polyline].reverse()];
    const ring = dedupeRing(assembled);

    if (ring.length < 3) {
        return {
            ok: false,
            reason:
                `The swept ring collapsed to ${ring.length} distinct point(s). The centreline `
                + 'is probably shorter than the width is wide.',
        };
    }

    const fold = findSelfIntersection(ring);
    if (fold) {
        return {
            ok: false,
            reason:
                `The swept ring self-intersects (edges ${fold.i}/${fold.j}). The centreline `
                + `turns more tightly than a ${widthM} m width can follow. Widen the corner or `
                + 'narrow the surface — this module does not resolve the fold, and returning '
                + 'the folded ring would be geometry you could not see was wrong.',
        };
    }

    return { ok: true, ring: ring.map(toGround), bevelled: right.bevelled || left.bevelled };
}

/**
 * The footprint ring of ANY siteworks surface, whichever form it was authored in.
 *
 * ⭐ THIS IS THE SEAM THAT KEEPS `form` FROM LEAKING. Every consumer — the renderer,
 * the area function, any future plan symbol — asks this one question and never
 * branches on `form` itself. ADR-0384 D2 made `form` a representation detail; a
 * consumer that switches on it would make it a semantic one, and then a third form
 * would mean touching every consumer.
 *
 * ⚠ HOLES ARE NOT RETURNED HERE. This is the OUTER ring only, and the name says
 * `Ring`, singular. `siteworksAreaM2` subtracts the holes itself; a renderer that
 * needs them reads `surface.holes` directly. Folding them in would make the return
 * type lie about what a "ring" is.
 */
export function siteworksFootprintRing(surface: Siteworks): SweepResult {
    if (surface.form === 'linear') {
        return sweepCentrelineToRing(surface.centreline, surface.widthM);
    }
    if (surface.boundary.length < 3) {
        return {
            ok: false,
            reason:
                `An areal siteworks surface needs a boundary of at least 3 points; got `
                + `${surface.boundary.length}.`,
        };
    }
    return { ok: true, ring: surface.boundary, bevelled: false };
}

/** The area answer, or the reason there is not one. Never a sentinel zero. */
export type AreaResult =
    | { readonly ok: true; readonly areaM2: number }
    | { readonly ok: false; readonly reason: string };

/**
 * ⭐ THE ONE AREA ANSWER (C84 EI-9), computed on demand and NEVER cached on the
 * record.
 *
 * ⚠ THIS DIVERGES FROM `SpaceEnvelope.footprintAreaM2`, AND THE DIVERGENCE IS
 * NAMED RATHER THAN SILENT (C116 §5). An envelope's cached area feeds panels that
 * SUM many records, so the read is hot. A siteworks area is a pure function of two
 * fields the user edits directly, so a cache would need a writer at every mutation
 * site — and the mutation site that forgets is the one that ships.
 *
 * ⛔ THIS NUMBER MUST NEVER ENTER A FLOOR-AREA OR GFA TOTAL (C116 §12). Paved ground
 * is not built floor area; a car park in a GFA figure is a wrong number with a
 * citation attached.
 */
export function siteworksAreaM2(surface: Siteworks): AreaResult {
    const outer = siteworksFootprintRing(surface);
    if (!outer.ok) return { ok: false, reason: outer.reason };

    const gross = Math.abs(polygonSignedArea2D(outer.ring.map(toPt2)));

    // Only an areal surface can carry holes — the schema refuses them on a linear
    // one — so this loop is a no-op there rather than a branch on `form`.
    let voids = 0;
    for (const hole of surface.holes) {
        if (hole.length < 3) {
            return {
                ok: false,
                reason:
                    `A hole with ${hole.length} point(s) has no area and cannot be subtracted. `
                    + 'Refusing rather than ignoring it: a silently dropped void would overstate '
                    + 'the paved area, and overstatement on real land is L-616.',
            };
        }
        voids += Math.abs(polygonSignedArea2D(hole.map(toPt2)));
    }

    if (voids > gross) {
        return {
            ok: false,
            reason:
                `The holes (${voids.toFixed(2)} m²) are larger than the surface `
                + `(${gross.toFixed(2)} m²). Something is inside-out; a negative paved area is `
                + 'not a number this function will return.',
        };
    }

    return { ok: true, areaM2: gross - voids };
}

/**
 * The world-space Y at which the FINISHED surface sits, and the Y its underside
 * reaches.
 *
 * ⭐ MEASURED OUT OF `Slab`, NOT REASONED TO (ADR-0384 D4):
 *     `worldY = level.elevation + baseOffset − thickness`
 * — `packages/geometry-slab/src/SlabFragmentBuilder.ts:1090`, and `:1258`
 * `return topY - data.thickness`. The user positions the surface they will STAND ON;
 * the construction hangs underneath it. Adopting the existing convention rather than
 * deriving one is the difference between one rule and two — two surfaces at the same
 * `baseOffset` must meet.
 */
export function siteworksDatum(
    surface: Siteworks,
    levelElevationM: number,
): { readonly topY: number; readonly bottomY: number } {
    const topY = levelElevationM + surface.baseOffset;
    return { topY, bottomY: topY - surface.thickness };
}
