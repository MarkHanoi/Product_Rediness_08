/**
 * §ROOF-ENGINE-STAGE-1 — a TRUE mitred polygon offset for roof eaves.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random. Deterministic
 * (ADR-0061): the same footprint always yields byte-identical eaves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY IT IS NOT A REFACTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * `RoofGeometryBuilder._applyOverhang` expanded the footprint by pushing every
 * vertex `d` metres RADIALLY AWAY FROM THE CENTROID. That is not an offset. Its
 * error is a function of shape:
 *
 *   • On a square it is right only at the corners; the eave along each edge
 *     projects by d·cos45° ≈ 0.707·d, so a "300 mm overhang" is 212 mm.
 *   • On an ELONGATED footprint the vertices at the ends of the long axis move
 *     almost entirely ALONG the long edges, so the short-end eaves overshoot and
 *     the long-edge eaves barely move — the footprint is stretched, not offset.
 *   • On a CONCAVE footprint a re-entrant vertex is pushed AWAY from the centroid
 *     and therefore FURTHER INTO the notch — the eave inverts.
 *   • On a TESSELLATED ARC every sample point is at a different radius, so the
 *     arc's curvature is not preserved: the eave is a different curve, not a
 *     parallel one. This is the founder's *"overhangs well outside the
 *     building"* on a curved-wall region.
 *
 * The correct primitive is the parallel (Minkowski) offset: shift each edge's
 * SUPPORTING LINE along its own outward normal by `d` and intersect consecutive
 * shifted lines. That is also the first step of the straight-skeleton
 * construction the roof engine is heading toward (see the staged plan / ADR), so
 * this module is a foundation, not a patch.
 *
 * ⚠ HONEST LIMITS — stated rather than hidden:
 *   • A large offset on a CONCAVE polygon can self-intersect. This module does
 *     NOT resolve those events (that is the skeleton's job, Stage 2). It clamps
 *     spikes with a miter limit and returns a simple polygon, and reports via
 *     `OffsetResult.degenerate` when the result should not be trusted.
 *   • It does not split a polygon that pinches into two components under an
 *     inward offset; it returns `[]` and `degenerate: true` instead of inventing
 *     geometry (§CONTEXT-DATA-HONESTY: refusal beats a plausible wrong answer).
 *
 * @file packages/geometry-roof/src/pure/polygonOffset.ts
 */

export type Pt2 = [number, number]; // [x, z]

export interface OffsetResult {
    /** The offset ring, same winding as the input. Empty when it collapsed. */
    readonly polygon: Pt2[];
    /**
     * True when the offset could not be produced faithfully (collapse, pinch, or
     * a miter that had to be beveled beyond the limit). Callers should degrade
     * VISIBLY, never silently.
     */
    readonly degenerate: boolean;
    /** Human-readable reason when `degenerate` — for §DIAG logging. */
    readonly reason?: string;
}

const EPS = 1e-9;

/** Shoelace signed area in the XZ plane. Positive ⇒ the winding this module calls CCW. */
export function signedArea(poly: ReadonlyArray<Pt2>): number {
    let a = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const [x1, z1] = poly[i]!;
        const [x2, z2] = poly[(i + 1) % n]!;
        a += x1 * z2 - x2 * z1;
    }
    return a / 2;
}

/** Drop consecutive (and wrap-around) duplicate vertices within `tol`. */
export function dedupeRing(poly: ReadonlyArray<Pt2>, tol = 1e-7): Pt2[] {
    const out: Pt2[] = [];
    for (const p of poly) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tol) out.push([p[0], p[1]]);
    }
    while (out.length >= 2) {
        const first = out[0]!;
        const last = out[out.length - 1]!;
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= tol) out.pop();
        else break;
    }
    return out;
}

/**
 * Offset a simple polygon by `distance` metres along its edge normals.
 *
 * `distance > 0` grows the ring outward (an eave overhang); `distance < 0`
 * shrinks it inward (the ridge-ward step of a hip). Winding is detected from the
 * signed area, so callers need not normalise it and cannot get the sign wrong.
 *
 * `miterLimit` caps how far a mitred vertex may travel, as a multiple of
 * |distance|. At a very sharp corner the exact miter shoots off to infinity; past
 * the limit the corner is BEVELLED (two points on the two shifted lines) rather
 * than spiked. 4 is the common default and matches SVG/Clipper convention.
 */
export function offsetPolygon(
    poly: ReadonlyArray<Pt2>,
    distance: number,
    miterLimit = 4,
): OffsetResult {
    const ring = dedupeRing(poly);
    const n = ring.length;
    if (n < 3) return { polygon: [], degenerate: true, reason: 'fewer than 3 distinct vertices' };
    if (distance === 0 || !Number.isFinite(distance)) {
        return { polygon: ring.map((p): Pt2 => [p[0], p[1]]), degenerate: false };
    }

    // Outward normal convention: for a CCW ring (positive shoelace area) the
    // OUTWARD normal of edge (a→b) is (dz, −dx)/len. Flip for a CW ring so the
    // caller's winding is irrelevant.
    const ccw = signedArea(ring) > 0;
    const sign = ccw ? 1 : -1;

    // Shifted supporting line per edge: nx·x + nz·z = c
    const lines: Array<{ nx: number; nz: number; c: number } | null> = [];
    for (let i = 0; i < n; i++) {
        const [x1, z1] = ring[i]!;
        const [x2, z2] = ring[(i + 1) % n]!;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < EPS) { lines.push(null); continue; }
        const nx = (dz / len) * sign;
        const nz = (-dx / len) * sign;
        lines.push({ nx, nz, c: nx * x1 + nz * z1 + distance });
    }

    const out: Pt2[] = [];
    let bevelled = false;
    for (let i = 0; i < n; i++) {
        // Vertex i is the meeting point of edge (i−1) and edge (i).
        const prev = lines[(i - 1 + n) % n];
        const curr = lines[i];
        if (!prev || !curr) continue;

        const det = prev.nx * curr.nz - curr.nx * prev.nz;
        const [vx, vz] = ring[i]!;

        if (Math.abs(det) < 1e-12) {
            // Collinear (or antiparallel) edges — no unique miter. For collinear
            // edges the shifted lines coincide, so the vertex simply translates
            // along the shared normal; that is exact, not an approximation.
            out.push([vx + curr.nx * distance, vz + curr.nz * distance]);
            continue;
        }

        const ix = (prev.c * curr.nz - curr.c * prev.nz) / det;
        const iz = (prev.nx * curr.c - curr.nx * prev.c) / det;

        // Miter limit: how far did the vertex actually travel?
        const travel = Math.hypot(ix - vx, iz - vz);
        if (travel > Math.abs(distance) * miterLimit) {
            bevelled = true;
            out.push([vx + prev.nx * distance, vz + prev.nz * distance]);
            out.push([vx + curr.nx * distance, vz + curr.nz * distance]);
            continue;
        }
        out.push([ix, iz]);
    }

    const result = dedupeRing(out);
    if (result.length < 3) {
        return { polygon: [], degenerate: true, reason: 'offset collapsed the ring' };
    }

    // ⚠ A WINDING CHECK IS NOT ENOUGH. Over-shrinking a symmetric footprint
    // (e.g. a 2 m square offset by −5 m) flips BOTH axes, so the shoelace sign is
    // preserved while the ring has turned itself inside out. The reliable
    // invariant is MONOTONICITY OF AREA: an outward offset must grow the ring and
    // an inward offset must shrink it. Anything else means the offset passed
    // through a topological event this module does not model (Stage 2 —
    // straight skeleton) and we refuse rather than emit a plausible wrong ring.
    const areaBefore = Math.abs(signedArea(ring));
    const areaAfter = Math.abs(signedArea(result));
    if (signedArea(result) > 0 !== ccw) {
        return { polygon: [], degenerate: true, reason: 'offset inverted the ring winding' };
    }
    if (distance > 0 && areaAfter <= areaBefore) {
        return { polygon: [], degenerate: true, reason: 'outward offset did not grow the ring' };
    }
    if (distance < 0 && areaAfter >= areaBefore) {
        return { polygon: [], degenerate: true, reason: 'inward offset consumed the ring' };
    }

    return {
        polygon: result,
        degenerate: bevelled,
        reason: bevelled ? 'one or more corners exceeded the miter limit and were bevelled' : undefined,
    };
}

/**
 * Convenience wrapper matching the old `_applyOverhang(pts, d)` contract:
 * returns the offset ring, or the INPUT unchanged if the offset degenerated.
 * Never returns an empty polygon — a roof is always produced (fail-safe, same
 * policy as `deriveRoomFinishBoundary`), but the degradation is reported so the
 * caller can log it instead of silently shipping a wrong eave.
 */
export function offsetPolygonOrSelf(
    poly: ReadonlyArray<Pt2>,
    distance: number,
    miterLimit = 4,
): { polygon: Pt2[]; degenerate: boolean; reason?: string } {
    const r = offsetPolygon(poly, distance, miterLimit);
    if (r.polygon.length >= 3) return { polygon: r.polygon, degenerate: r.degenerate, reason: r.reason };
    return {
        polygon: poly.map((p): Pt2 => [p[0], p[1]]),
        degenerate: true,
        reason: r.reason ?? 'offset produced no ring',
    };
}
