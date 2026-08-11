/**
 * §ROOF-ENGINE-STAGE-1 / §W2A-ONE-OFFSET — THE polygon offset for this repo.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random. Deterministic
 * (ADR-0061): the same footprint always yields byte-identical output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE LIVES IN `geometry-kernel` AND NOT IN `geometry-roof`
 * ─────────────────────────────────────────────────────────────────────────────
 * It used to live at `packages/geometry-roof/src/pure/polygonOffset.ts`, and that
 * is exactly why the defect it was written to fix stayed live for users: the
 * SHIPPING roof path is `plugins/roof` → `@pryzm/plugin-sdk` → `produceRoof`
 * (`geometry-kernel`), and `geometry-kernel` CANNOT import `geometry-roof`
 * (`geometry-roof` depends on `core-app-model` and `renderer-three`, so the edge
 * would run upward through L4). The fix therefore could not reach the code the
 * committer actually calls, and a verbatim, UNFIXED clone kept serving users
 * (`producers/_internal/roof/polygon.ts::applyOverhang` / `shrinkPolygon`).
 *
 * `geometry-kernel` is L2 with three pure dependencies, so it is the lowest point
 * BOTH roof stacks can reach. `geometry-roof/src/pure/polygonOffset.ts` is now a
 * re-export of this module. **Neither module owns a second offset routine** — the
 * same rule `room-topology`/`site-parcel-data` state for their inset. If you are
 * about to add a third, don't: extend this one and add a fixture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY IT IS NOT A REFACTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * `applyOverhang` expanded the footprint by pushing every vertex `d` metres
 * RADIALLY AWAY FROM THE CENTROID. That is a SCALE, not an offset, and its error
 * is a function of shape. Measured against an independent oracle (perpendicular
 * distance at every edge midpoint of the result, W2-A):
 *
 *     fixture              requested   radial dilation delivers   spread
 *     square 10×10           300 mm      212.13 mm (= d·cos45°)     0.00 mm
 *     elongated 40×4         300 mm       29.85 … 298.51 mm       268.66 mm
 *     L-shape                300 mm      121.77 … 260.96 mm       139.19 mm
 *     U-shape                300 mm      183.24 … 228.13 mm        44.89 mm
 *     cadastral arc          300 mm      204.48 … 297.20 mm        92.71 mm
 *
 * The SPREAD is the discriminator: a scale pulls back in proportion to distance
 * from the centre, so it cannot hold a constant perpendicular gain. This module
 * measures 0.00 mm spread on all six fixtures.
 *
 * On a CONCAVE footprint the radial push moves a re-entrant vertex FURTHER INTO
 * the notch — the eave inverts. On a TESSELLATED ARC every sample sits at a
 * different radius, so the eave is a different curve rather than a parallel one:
 * that is the founder's *"overhangs well outside the building"* on a curved-wall
 * region (2026-08-07).
 *
 * The correct primitive is the parallel (Minkowski) offset: shift each edge's
 * SUPPORTING LINE along its own outward normal by `d` and intersect consecutive
 * shifted lines. That is also the first step of the straight-skeleton
 * construction the roof engine is heading toward, so this is a foundation.
 *
 * ⚠ HONEST LIMITS — stated rather than hidden:
 *   • A large offset on a CONCAVE polygon can SELF-INTERSECT. This module does
 *     NOT resolve those events (that is the skeleton's job, Stage 2). It DETECTS
 *     them (`§W2A-FOLD-DETECT` below) and reports `degenerate: true` — it does not
 *     pretend the folded ring is an offset.
 *   • It does not split a polygon that pinches into two components; it returns
 *     `[]` and `degenerate: true` instead of inventing geometry
 *     (§CONTEXT-DATA-HONESTY: refusal beats a plausible wrong answer).
 *   • It offsets ONE simple ring. A ring-with-hole must be offset as two rings,
 *     outer outward and hole inward, by the caller.
 *
 * @file packages/geometry-kernel/src/pure/polygonOffset.ts
 */

export type Pt2 = [number, number]; // [x, z]

export interface OffsetResult {
    /** The offset ring, same winding as the input. Empty when it collapsed. */
    readonly polygon: Pt2[];
    /**
     * True when the offset could not be produced faithfully (collapse, pinch,
     * fold, or a miter that had to be beveled beyond the limit). Callers should
     * degrade VISIBLY, never silently.
     */
    readonly degenerate: boolean;
    /** Human-readable reason when `degenerate` — for §DIAG logging. */
    readonly reason?: string;
}

const EPS = 1e-9;

/**
 * Above this vertex count the exact O(n²) fold test is skipped. It is reported
 * through `reason` rather than silently assumed clean — an unchecked ring is not
 * the same value as a checked-clean ring (§CONTEXT-DATA-HONESTY).
 */
export const FOLD_CHECK_MAX_VERTS = 1024;

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
 * §W2A-FOLD-DETECT — does this ring cross itself?
 *
 * ⚠ THIS TEST IS WHY THE MODULE'S `degenerate` FLAG CAN BE BELIEVED. Before it
 * existed, the area-monotonicity guard below was the only gate, and a fold that
 * still SHRINKS the ring passes area monotonicity. Measured (W2-A oracle, the
 * cadastral arc fixture, inward 2.095 m): the result self-intersected, the
 * perpendicular-distance spread was 81.59 mm against a 0.1 mm bar — and the
 * module reported `degenerate: false`. A caller that trusted the flag shipped a
 * folded ring as an offset. Exactly the ADR-0299 failure mode.
 *
 * A folded ring is also what `THREE.ShapeUtils.triangulateShape` (earcut) is
 * contractually forbidden to receive — see `SlabFragmentBuilder`
 * §REFUSE-NONSIMPLE-SLAB-RING, which refuses on the same predicate.
 *
 * Exact O(n²) segment-pair test, adjacency-skipping. Returns `null` when the ring
 * is simple, else `{ i, j }` — the two edge indices that cross.
 */
export function findSelfIntersection(
    ring: ReadonlyArray<Pt2>,
): { readonly i: number; readonly j: number } | null {
    const n = ring.length;
    if (n < 4) return null;
    const cross = (o: Pt2, a: Pt2, b: Pt2): number =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            // Adjacent edges legitimately share an endpoint — skip those pairs.
            if ((j + 1) % n === i || (i + 1) % n === j) continue;
            const c = ring[j]!;
            const d = ring[(j + 1) % n]!;
            const d1 = cross(a, b, c);
            const d2 = cross(a, b, d);
            const d3 = cross(c, d, a);
            const d4 = cross(c, d, b);
            if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) return { i, j };
        }
    }
    return null;
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
            //
            // ⚠ NOTE THE CONTRAST WITH THE ROUTINE THIS REPLACES. `shrinkPolygon`
            // hit this same branch and `continue`d — it DELETED the vertex and
            // still returned success. Here the vertex survives, translated exactly.
            //
            // ⚠ RETRACTED FIGURE: an earlier draft said this "silently ate half the
            // boundary (49% near-parallel vertices, measured)". It does not, and 49%
            // was never measured on this routine — it is `insetPolygon.ts:437`'s
            // statistic for cadastral vertices turning by less than 1°, which is a
            // different quantity at a threshold six orders of magnitude looser than
            // `|det| < 1e-8`. Re-measured on the HEAD implementation: 1–3 vertices
            // lost in absolute terms, a share that FALLS with tessellation density
            // (10.0% at 30 verts, 0.1% at 1006). The silent deletion is the defect;
            // its size was overstated.
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

    // §W2A-FOLD-DETECT — area monotonicity does NOT catch a fold (see the header
    // of `findSelfIntersection`). Run the exact test and report it.
    if (result.length <= FOLD_CHECK_MAX_VERTS) {
        const hit = findSelfIntersection(result);
        if (hit) {
            return {
                polygon: result,
                degenerate: true,
                reason: `offset ring self-intersects (edges ${hit.i}/${hit.j}) — a fold this module does not resolve (Stage 2: straight skeleton)`,
            };
        }
    } else if (!bevelled) {
        return {
            polygon: result,
            degenerate: true,
            reason: `ring has ${result.length} vertices (> ${FOLD_CHECK_MAX_VERTS}); the self-intersection test was NOT run, so simplicity is UNKNOWN, not confirmed`,
        };
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
 *
 * ⚠ THE RETURN TYPE IS THE POINT. Do NOT add a helper that flattens this to a
 * bare `Pt2[]`: `RoofGeometryBuilder._applyOverhang` did exactly that, so a roof
 * with ZERO overhang where 300 mm was requested was committed and dimensioned as
 * authoritative with nothing but a `console.warn` behind it (W2-A defect 4).
 */
export function offsetPolygonOrSelf(
    poly: ReadonlyArray<Pt2>,
    distance: number,
    miterLimit = 4,
): OffsetResult {
    const r = offsetPolygon(poly, distance, miterLimit);
    // A folded or bevelled ring is KEPT together with its reason — the caller
    // decides whether to use it. Only a total collapse falls back to the input.
    if (r.polygon.length >= 3) return r;
    return {
        polygon: poly.map((p): Pt2 => [p[0], p[1]]),
        degenerate: true,
        reason: r.reason ?? 'offset produced no ring',
    };
}
