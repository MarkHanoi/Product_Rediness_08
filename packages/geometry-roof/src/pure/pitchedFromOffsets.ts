/**
 * §ROOF-ENGINE-STAGE-1 — a REAL sloping roof over an ARBITRARY simple polygon,
 * built by progressive inward offsetting.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random. Deterministic
 * (ADR-0061) — same footprint, same slope ⇒ byte-identical rings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — the founder's defect, stated precisely
 * ─────────────────────────────────────────────────────────────────────────────
 * `RoofGeometryBuilder.generate()` routes a pitched roofType (gable/hip/dutch)
 * on a CONCAVE footprint into `_buildConcavePitched`, which requires the shell to
 * be RECTILINEAR (every edge axis-aligned, in the world frame or the principal
 * frame). Anything else returns `null` and the roof **flat-degrades**.
 *
 * That gate is fine for a generated L/T/U house. It is fatal for a footprint the
 * USER drew — and it is *guaranteed* to fail on any region bounded by a CURVED
 * wall, because a tessellated arc has 16 chords at 16 different angles and is
 * rectilinear in no frame whatsoever. So the founder chose "By Region" over a
 * room with a curved wall and got a flat plane: not a rendering fault, an
 * ALGORITHMIC REFUSAL that presented itself as a roof.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE APPROACH — and its honest relationship to the straight skeleton
 * ─────────────────────────────────────────────────────────────────────────────
 * A uniform-pitch hip roof is exactly the graph of
 *
 *     height(p) = slope × distance(p, boundary)
 *
 * whose exact ridge/valley network is the polygon's STRAIGHT SKELETON. This
 * module computes a DISCRETE approximation of that surface: offset the footprint
 * inward in equal steps and lift each ring by `step × slope`. Every ring is a
 * true parallel offset, so:
 *
 *   • convex corners produce hips,
 *   • re-entrant corners produce valleys,
 *   • a tessellated arc produces a conical surface that follows the arc,
 *
 * — the three things the rectilinear decomposition could not do — and it needs
 * no special cases per footprint shape.
 *
 * ⚠ WHAT THIS IS NOT, STATED PLAINLY. It is not a straight skeleton. It does not
 * detect EDGE or SPLIT events, so it cannot place an exact ridge line, and on a
 * strongly concave footprint a large offset step can self-intersect. The module
 * therefore stops at the first ring that fails the offset's own monotonicity
 * check and caps what it has, reporting `terminatedEarly`. That is a coarser
 * roof, never a wrong one — and never a silent flat plane. Stage 2 of the engine
 * plan replaces the ring stack with a real skeleton; the ring API is designed so
 * that swap is invisible to `RoofGeometryBuilder`.
 *
 * ⚠ VERTEX CORRESPONDENCE IS LOAD-BEARING. `offsetPolygon` emits exactly one
 * vertex per input vertex when no corner exceeds the miter limit, so consecutive
 * rings share an index correspondence and the mesh between them is a trivial
 * quad strip. This module therefore offsets with an INFINITE miter limit and
 * relies on the ring-collapse guard instead — a bevel would desynchronise the
 * indices and silently shear the roof surface.
 *
 * @file packages/geometry-roof/src/pure/pitchedFromOffsets.ts
 */

import { offsetPolygon, signedArea, dedupeRing, type Pt2 } from './polygonOffset.js';

export type { Pt2 };

export interface PitchedRing {
    /** Ring vertices in XZ. Index i corresponds to index i of every other ring. */
    readonly polygon: Pt2[];
    /** Height above the eave plane, in metres. Ring 0 is always 0. */
    readonly height: number;
    /** Inward offset distance that produced this ring, in metres. */
    readonly depth: number;
}

export interface PitchedRingStack {
    /** Ring 0 = the eave polygon; subsequent rings step inward and upward. */
    readonly rings: PitchedRing[];
    /**
     * True when the stack stopped before the footprint was exhausted — the last
     * ring is a plateau rather than a ridge. Callers MUST log this: a plateau the
     * user did not ask for is a degradation, not a design.
     */
    readonly terminatedEarly: boolean;
    /** Reason for early termination, for §DIAG logging. */
    readonly reason?: string;
    /** Peak height reached, in metres. */
    readonly peakHeight: number;
}

/** Largest number of offset rings. Bounds work on a pathological footprint. */
export const MAX_RINGS = 24;

/**
 * The largest inward offset a polygon admits before it collapses — i.e. its
 * "inradius" in the offset sense, found by bisection on the offset's own
 * degeneracy test. Pure and deterministic (fixed iteration count, no tolerance
 * on wall-clock).
 *
 * This is the right quantity for a roof: `maxInset × slope` is the height of the
 * ridge/apex, exactly as `inradius × slope` is for a convex polygon — but it is
 * correct for CONCAVE and CURVED footprints too, where the centroid-to-edge
 * "inradius" `RoofGeometryBuilder._computeInradius` computes is simply wrong (it
 * measures from the centroid, which need not even lie inside the polygon).
 */
export function maxInwardOffset(poly: ReadonlyArray<Pt2>, iterations = 40): number {
    const ring = dedupeRing(poly);
    if (ring.length < 3) return 0;

    // Upper bound: half the bounding-box minor extent can never be exceeded.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    let hi = Math.min(maxX - minX, maxZ - minZ) / 2;
    if (!(hi > 0)) return 0;
    let lo = 0;

    for (let i = 0; i < iterations; i++) {
        const mid = (lo + hi) / 2;
        const r = offsetPolygon(ring, -mid, Number.POSITIVE_INFINITY);
        if (r.polygon.length >= 3 && !r.degenerate) lo = mid;
        else hi = mid;
    }
    return lo;
}

/**
 * Build the ring stack for a uniform-pitch roof over `poly`.
 *
 * @param poly     the EAVE polygon (overhang already applied), in XZ.
 * @param slope    rise/run ratio. `0` yields a single flat ring.
 * @param ringCount how many offset steps to take. More rings = a smoother
 *                 approximation of the skeleton surface at more triangles.
 *                 Clamped to `[1, MAX_RINGS]`.
 */
export function pitchedRingsFromOffsets(
    poly: ReadonlyArray<Pt2>,
    slope: number,
    ringCount = 8,
): PitchedRingStack {
    const base = dedupeRing(poly);
    if (base.length < 3) {
        return { rings: [], terminatedEarly: true, reason: 'degenerate footprint', peakHeight: 0 };
    }
    const eave: PitchedRing = { polygon: base.map((p): Pt2 => [p[0], p[1]]), height: 0, depth: 0 };
    if (!(slope > 0) || !Number.isFinite(slope)) {
        return { rings: [eave], terminatedEarly: false, peakHeight: 0 };
    }

    const maxInset = maxInwardOffset(base);
    if (!(maxInset > 1e-6)) {
        return { rings: [eave], terminatedEarly: true, reason: 'footprint admits no inward offset', peakHeight: 0 };
    }

    const steps = Math.max(1, Math.min(MAX_RINGS, Math.floor(ringCount)));
    const rings: PitchedRing[] = [eave];
    let terminatedEarly = false;
    let reason: string | undefined;

    for (let k = 1; k <= steps; k++) {
        // The final step stops just short of the true collapse so the apex ring
        // is a small but non-degenerate polygon rather than a numerical accident.
        const depth = (maxInset * k) / steps * (k === steps ? 0.999 : 1);
        const r = offsetPolygon(base, -depth, Number.POSITIVE_INFINITY);
        if (r.polygon.length < 3 || r.degenerate) {
            terminatedEarly = true;
            reason = r.reason ?? `ring ${k} of ${steps} degenerated`;
            break;
        }
        // ⚠ Correspondence guard — see the file header. If the offset did not
        // return one vertex per input vertex the quad strip would connect the
        // wrong pairs, shearing the roof. Stop rather than emit a sheared surface.
        if (r.polygon.length !== base.length) {
            terminatedEarly = true;
            reason = `ring ${k} lost vertex correspondence (${r.polygon.length} vs ${base.length})`;
            break;
        }
        rings.push({ polygon: r.polygon, height: depth * slope, depth });
    }

    const peakHeight = rings[rings.length - 1]!.height;
    return { rings, terminatedEarly, reason, peakHeight };
}

/**
 * True when this footprint needs the general (offset) pitched builder rather
 * than one of the closed-form convex builders — i.e. it is concave, or it has
 * enough vertices that it is plainly a traced/tessellated boundary rather than a
 * hand-drawn rectangle.
 *
 * Exposed so `RoofGeometryBuilder` gates on ONE predicate instead of repeating
 * the condition, and so a test can pin exactly which footprints route here.
 */
export function needsGeneralPitchedBuilder(poly: ReadonlyArray<Pt2>): boolean {
    const ring = dedupeRing(poly);
    const n = ring.length;
    if (n < 4) return false;
    const positive = signedArea(ring) > 0;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const c = ring[(i + 2) % n]!;
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 1e-12) continue;
        if (cross > 0 !== positive) return true; // a re-entrant corner ⇒ concave
    }
    return false;
}
