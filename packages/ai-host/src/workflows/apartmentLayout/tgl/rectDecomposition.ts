// TGL P1 — rectilinear decomposition (SPEC-APARTMENT-LAYOUT-GENERATOR, offline TGL).
//
// Splits a shell polygon into axis-aligned rectangles via a vertical slab sweep.
// EXACT for rectilinear polygons (rectangles, L / T / U shapes); a stair-step
// approximation for slanted edges (each slab takes the edge's z at the slab's
// midpoint). This is the geometric foundation that makes the offline generator
// POLYGON-AWARE — rooms are placed inside the real shell, not a bounding box that
// floats walls through the notch. Pure: ZERO imports, Node-testable.
//
// Coordinates are in METRES, plan frame { x, z } (z = world Z = plan "up"), matching
// shell.perimeter. The layout builder converts to mm + {x,y} at the very end.

export interface Pt { readonly x: number; readonly z: number }
/** Axis-aligned rectangle, metres, with x0<x1 and z0<z1. */
export interface Rect { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number }

const EPS = 1e-6;

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function rectWidth(r: Rect): number { return Math.max(0, r.x1 - r.x0); }
export function rectDepth(r: Rect): number { return Math.max(0, r.z1 - r.z0); }
export function rectArea(r: Rect): number { return rectWidth(r) * rectDepth(r); }
export function rectCenter(r: Rect): Pt { return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }; }

export function polygonBBox(poly: readonly Pt[]): Rect {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return poly.length ? { x0, z0, x1, z1 } : { x0: 0, z0: 0, x1: 0, z1: 0 };
}

/** z of edge a→b at the given x, only if x is strictly within the edge's x-span. */
function edgeZAtX(a: Pt, b: Pt, x: number): number | null {
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (x <= lo + EPS || x >= hi - EPS) return null;       // vertical edge or x outside → no crossing
    const t = (x - a.x) / (b.x - a.x);
    return a.z + t * (b.z - a.z);
}

// ── §RECTIFY-QUAD (D2 non-orthogonal, 2026-06-05) ────────────────────────────
//
// A SKEWED plot (a parallelogram / trapezoid drawn off-axis on the GIS map) is the
// founder's recurring failure case (Córdoba, Notting Hill). The principal-axis
// rotation (runDeterministicLayout §PRINCIPAL-AXIS) aligns the shell's DOMINANT
// edge family to the axes, but the two NON-dominant edges of a sheared quad stay
// slanted. The slab-sweep below then STAIR-STEPS those slanted edges into a big
// central rect + two unusable slivers, so subdivide packs every room into the one
// big rect → the "one giant 93 m² merged room + slivers" defect, or drops rooms via
// §HARD-MIN-SIDE and bails to the strip-slicer.
//
// FIX: when the (already principal-axis-rotated) shell is a CONVEX QUADRILATERAL,
// rectify it to its axis-aligned bounding rectangle before tiling. A skewed quad
// then yields the SAME clean single-rect tiling a true rectangle of its bbox would,
// so subdivide produces a full, detectable room set. TRADE-OFF: the interior rooms
// become rectangular in the rotated frame and fill the bbox (slightly larger than
// the real sheared area); the OUTER shell walls remain the real drawn shape
// (emitted separately + extended to the real perimeter in wallsAndDoors), so the
// apartment footprint is still the true plot — only the partition grid is rectified.
//
// Convex-quad gating is what makes this safe: an L / U / T shell is concave and/or
// has > 4 vertices, so it is NEVER rectified (its stair-step decomposition, which
// correctly avoids the notch, is preserved). Fill-ratio alone cannot separate a
// parallelogram from an L-shape (an L can fill its bbox MORE than a sheared quad),
// so vertex-count + convexity is the discriminator, not area.

const QUAD_EPS = 1e-4;

/** Drop vertices that are collinear with their neighbours (within QUAD_EPS of the
 *  edge) so a rectangle authored with redundant mid-edge points still reads as a
 *  4-vertex quad. Returns the simplified ring. */
function dropCollinear(poly: readonly Pt[]): Pt[] {
    const n = poly.length;
    if (n < 4) return poly.slice();
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n]!, b = poly[i]!, c = poly[(i + 1) % n]!;
        // Cross product of (b-a)×(c-b); ~0 ⇒ b lies on the a→c line.
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        const scale = Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z);
        if (scale > QUAD_EPS && Math.abs(cross) / scale < QUAD_EPS) continue; // collinear → drop
        out.push(b);
    }
    return out.length >= 3 ? out : poly.slice();
}

/** True iff the ring is convex (all cross products share one sign). Degenerate
 *  (zero-area / spike) rings return false. */
function isConvex(poly: readonly Pt[]): boolean {
    const n = poly.length;
    if (n < 4) return false;
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!, c = poly[(i + 2) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < QUAD_EPS) continue;            // collinear edge — ignore
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return sign !== 0;
}

/**
 * If `poly` is a convex quadrilateral (after collinear-vertex removal) that fills
 * a sensible fraction of its bounding box, return that bounding box as a 4-vertex
 * rectangle ring; otherwise return the polygon unchanged. The fill floor
 * (`minFill`, default 0.5) rejects pathologically thin/degenerate quads where the
 * bbox would balloon the apartment area unrealistically.
 *
 * Exported for unit testing. Call AFTER the principal-axis rotation so the bbox is
 * tight against the shell's dominant edges.
 */
export function rectifyConvexQuad(poly: readonly Pt[], minFill = 0.5): Pt[] {
    const simplified = dropCollinear(poly);
    if (simplified.length !== 4 || !isConvex(simplified)) return poly.slice();
    const bb = polygonBBox(simplified);
    const bboxArea = rectArea(bb);
    if (bboxArea <= EPS) return poly.slice();
    // Shoelace area of the quad.
    let a2 = 0;
    for (let i = 0; i < 4; i++) {
        const p = simplified[i]!, q = simplified[(i + 1) % 4]!;
        a2 += p.x * q.z - q.x * p.z;
    }
    const quadArea = Math.abs(a2) / 2;
    if (quadArea / bboxArea < minFill) return poly.slice();   // too sheared — leave to stair-step
    return [
        { x: bb.x0, z: bb.z0 }, { x: bb.x1, z: bb.z0 },
        { x: bb.x1, z: bb.z1 }, { x: bb.x0, z: bb.z1 },
    ];
}

// ── §RECTIFY-SHELL-PROJECT (multi-storey room-merge cure, 2026-06-09) ─────────
//
// THE CURE for the rotated/sheared-plate room-merge (forensic root cause, ADR-0063
// §8.5). §RECTIFY-QUAD tiles the interior partitions inside the AXIS-ALIGNED BOUNDING
// RECTANGLE of the (principal-axis-rotated) sheared shell — so a partition endpoint
// that should terminate on the PERIMETER lands on the BBOX edge instead. The executor's
// perimeter ring (`HouseLayoutExecutor._buildPerimeterShell`, built from
// `storey.footprint === shell.perimeter`) is the REAL sheared shell, which sits INSIDE
// the bbox by up to ~1.9–2.1 m on a freehand quad (measured: a 0.75-fill quad diverges
// 2.12 m at a corner). The 0.60 m weld (§SHELL-SNAP-WIDEN) cannot bridge that → the
// partition never reaches the perimeter → RoomDetectionEngine floods across the open
// seam → every interior room merges into one.
//
// FIX (smallest, by-construction, engine-side): AFTER tiling in the rectified bbox and
// BEFORE the principal-axis rotate-back, PROJECT every partition endpoint that lies on a
// rectified-bbox EDGE OUTWARD/inward onto the REAL shell polygon edge — along the bbox
// edge's perpendicular (vertical for the top/bottom bbox edge → keep x, move z to the
// shell; horizontal for the left/right edge → keep z, move x). The interior tiling keeps
// its clean rectangular benefit; only the perimeter-TERMINATING endpoints are moved onto
// the true shell, so the partition perimeter contacts now meet the executor's real ring
// within the RoomDetection node grid by construction (the weld becomes a safety net).
//
// SAFETY (no apartment / axis-aligned regression):
//   • When `rectifyConvexQuad(realShell)` returns the shell UNCHANGED (axis-aligned
//     rectangle, concave L/U/T, > 4 vertices, or sub-fill sheared quad → no rectify),
//     this returns the walls UNCHANGED (reference-preserving) → BYTE-IDENTICAL. The
//     apartment (which never rectifies its small flat plates) and every rectilinear
//     shell are untouched.
//   • Only endpoints WITHIN `edgeTolM` of a bbox edge are candidates — a genuinely
//     interior junction (metres from any bbox edge) is never moved.
//   • An endpoint is moved only if the projection target is found on the real ring and
//     the move is ≤ `maxMoveM` (a sane cap; the bbox→shell gap is bounded by the shear).
//   • Pure + deterministic; no I/O, no THREE, no DOM (L2 invariant).

/** mm point in the LayoutOption frame (plan-y = world-z). */
interface XYmm { x: number; y: number }

/** Real-shell-projection tuning. Defaults match the RoomDetection 20 mm node grid +
 *  the observed sheared-quad divergence band. */
export interface ShellProjectOpts {
    /** A bbox-edge endpoint is a candidate when within this (metres) of a bbox edge.
     *  60 mm covers float / emitter dust without catching a true interior endpoint. */
    readonly edgeTolM?: number;
    /** Reject a projection that would move an endpoint further than this (metres) — a
     *  guard against a pathological cast. The sheared-quad gap is bounded (≤ ~2.2 m on
     *  a 0.5-fill quad), so 3 m never clips a legitimate move. */
    readonly maxMoveM?: number;
}

/** Cast a ray from `p` in unit direction (dx,dz) and return the nearest forward
 *  intersection distance with the closed polygon ring, or null if none within `maxT`. */
function rayRingHit(p: Pt, dx: number, dz: number, ring: readonly Pt[], maxT: number): number | null {
    let best: number | null = null;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        // Solve p + t*d = a + s*e  →  t along the ray, s along the edge ([0,1]).
        const denom = dx * ez - dz * ex;
        if (Math.abs(denom) < EPS) continue;                 // parallel
        const wx = a.x - p.x, wz = a.z - p.z;
        const t = (wx * ez - wz * ex) / denom;
        const s = (wx * dz - wz * dx) / denom;
        if (t < -EPS || t > maxT + EPS) continue;
        if (s < -EPS || s > 1 + EPS) continue;
        if (best === null || t < best) best = Math.max(0, t);
    }
    return best;
}

/**
 * §RECTIFY-SHELL-PROJECT — project bbox-edge partition endpoints onto the real shell.
 *
 * `walls` are LayoutOption walls (mm, plan-y = world-z) emitted in the principal-axis
 * frame BEFORE rotate-back. `realShellPolyM` is the REAL (un-rectified) shell polygon
 * in that SAME rotated frame (metres {x,z}) — the executor builds its perimeter ring
 * from exactly this shape. Returns a NEW walls array with perimeter-terminating
 * endpoints moved onto the real shell; on a non-rectified shell it returns `walls`
 * UNCHANGED (same reference) so the apartment / axis-aligned paths are byte-identical.
 *
 * Exported for unit testing + reuse.
 */
export function projectPartitionEndpointsToShell<W extends { start: XYmm; end: XYmm; isExternal?: boolean }>(
    walls: readonly W[],
    realShellPolyM: readonly Pt[],
    opts: ShellProjectOpts = {},
): readonly W[] {
    if (realShellPolyM.length < 3) return walls;
    const rectified = rectifyConvexQuad(realShellPolyM);
    // No rectify → the tiling frame === the real shell → nothing to project (byte-identical).
    if (rectified.length === realShellPolyM.length) {
        let identical = true;
        for (let i = 0; i < rectified.length; i++) {
            if (Math.abs(rectified[i]!.x - realShellPolyM[i]!.x) > EPS || Math.abs(rectified[i]!.z - realShellPolyM[i]!.z) > EPS) { identical = false; break; }
        }
        if (identical) return walls;
    }
    const bb = polygonBBox(rectified);
    const edgeTolM = opts.edgeTolM ?? 0.06;
    const maxMoveM = opts.maxMoveM ?? 3.0;
    const realRing = realShellPolyM;

    /** Project one mm endpoint (if on a bbox edge) onto the real shell; returns the
     *  moved mm point or the original if no move applies. */
    const project = (pt: XYmm): XYmm => {
        const xM = pt.x / 1000, zM = pt.y / 1000;
        const onLeft = Math.abs(xM - bb.x0) <= edgeTolM;
        const onRight = Math.abs(xM - bb.x1) <= edgeTolM;
        const onBottom = Math.abs(zM - bb.z0) <= edgeTolM;
        const onTop = Math.abs(zM - bb.z1) <= edgeTolM;
        if (!onLeft && !onRight && !onBottom && !onTop) return pt;   // interior endpoint
        const p: Pt = { x: xM, z: zM };
        // Cast INWARD along the bbox-edge perpendicular to find the real shell.
        // Prefer the vertical cast for top/bottom edges, horizontal for left/right.
        // A corner endpoint (on two edges) tries both and takes the shorter move.
        let bestX = xM, bestZ = zM, bestMove = Infinity;
        const tryCast = (dx: number, dz: number): void => {
            const t = rayRingHit(p, dx, dz, realRing, maxMoveM);
            if (t === null) return;
            const nx = xM + dx * t, nz = zM + dz * t;
            const move = Math.hypot(nx - xM, nz - zM);
            if (move <= maxMoveM && move < bestMove) { bestMove = move; bestX = nx; bestZ = nz; }
        };
        if (onBottom) tryCast(0, +1);
        if (onTop) tryCast(0, -1);
        if (onLeft) tryCast(+1, 0);
        if (onRight) tryCast(-1, 0);
        if (!Number.isFinite(bestMove)) return pt;
        return { x: Math.round(bestX * 1e9) / 1e6, y: Math.round(bestZ * 1e9) / 1e6 };
    };

    // Only project INTERIOR partitions. External/perimeter walls are dropped by the
    // executor (skipExteriorWalls) and moving them would shift already-emitted window
    // offsets (windows reference wallRef + offset-along-wall). Skip them entirely.
    let moved = false;
    const out = walls.map(w => {
        if (w.isExternal === true) return w;
        const start = project(w.start), end = project(w.end);
        if (start !== w.start || end !== w.end) moved = true;
        return { ...w, start, end };
    });
    // Reference-preserving no-op when nothing moved (keeps callers' byte-identical fast path).
    return moved ? out : walls;
}

/**
 * Decompose a simple polygon (CW or CCW) into axis-aligned rectangles.
 * `minCellM` drops slivers narrower/shallower than that. Exact for rectilinear
 * polygons; stair-step approximation for slanted edges.
 *
 * §RECTIFY-QUAD: a convex quadrilateral (skewed plot / parallelogram / trapezoid,
 * typically already principal-axis-rotated) is first rectified to its bounding box
 * so it tiles as ONE clean rect rather than a big rect + slivers. Rectilinear L / U
 * / T shells are concave or have > 4 vertices → never rectified, so their notch-
 * aware stair-step decomposition is preserved bit-identically.
 */
export function decomposeToRects(rawPoly: readonly Pt[], minCellM = 0.5): Rect[] {
    if (rawPoly.length < 3) return [];
    const poly = rectifyConvexQuad(rawPoly);

    const xs = Array.from(new Set(poly.map(p => round6(p.x)))).sort((a, b) => a - b);
    const edges: Array<readonly [Pt, Pt]> = [];
    for (let i = 0; i < poly.length; i++) edges.push([poly[i]!, poly[(i + 1) % poly.length]!]);

    const rects: Rect[] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
        const x0 = xs[i]!, x1 = xs[i + 1]!;
        if (x1 - x0 < minCellM) continue;
        const xMid = (x0 + x1) / 2;

        // Even-odd: crossings of the vertical line x=xMid, sorted by z → inside bands.
        const zsCross: number[] = [];
        for (const [a, b] of edges) {
            const z = edgeZAtX(a, b, xMid);
            if (z !== null) zsCross.push(z);
        }
        zsCross.sort((a, b) => a - b);
        for (let j = 0; j + 1 < zsCross.length; j += 2) {
            const z0 = zsCross[j]!, z1 = zsCross[j + 1]!;
            if (z1 - z0 >= minCellM) rects.push({ x0, z0, x1, z1 });
        }
    }
    return mergeHorizontally(rects);
}

// ── §PRINCIPAL-AXIS (LAYOUT-QUALITY-DEEP, 2026-06-04) ────────────────────────
//
// The slab-sweep decomposition above is EXACT for axis-aligned rectilinear shells
// (rectangle / L / T / U) but STAIR-STEPS slanted edges — a SKEWED quad (a plot
// drawn off-axis on the GIS map) decomposes into a staircase of slivers, most of
// which fall below `minCellM` and get dropped. The room subdivider then sees a
// near-empty rect set and the whole D-TGL candidate fails → the generator bails to
// the bounding-box strip-slicer (proceduralLayout.ts), which ignores the drawn
// shape entirely. To keep rooms INSIDE the real (rotated) plot, the engine rotates
// the shell to its dominant-edge orientation, runs the entire axis-aligned pipeline
// in that frame, then rotates the emitted geometry back (see runDeterministicLayout
// `withPrincipalAxis`). These pure helpers are that rotation.

/** Rotate a point about `about` by `angleRad` (CCW, plan frame {x,z}). */
export function rotatePt(p: Pt, angleRad: number, about: Pt = { x: 0, z: 0 }): Pt {
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    const dx = p.x - about.x, dz = p.z - about.z;
    return { x: about.x + dx * c - dz * s, z: about.z + dx * s + dz * c };
}

/** Rotate every vertex of a polygon by `angleRad` about `about`. */
export function rotatePoly(poly: readonly Pt[], angleRad: number, about: Pt = { x: 0, z: 0 }): Pt[] {
    return poly.map(p => rotatePt(p, angleRad, about));
}

/**
 * The polygon's DOMINANT-EDGE orientation, reduced to the residual rotation needed
 * to make that edge axis-aligned. Returns an angle in (−π/4, π/4]: rotating the
 * polygon by `−angle` lands its dominant edge family on the X/Z axes.
 *
 * "Dominant" is the length-weighted circular mean of the edge directions, taken at
 * 4× the edge angle so the two orthogonal edge families of a rectilinear plot
 * (a→b vs the perpendicular run) collapse together and align as one. A perfectly
 * axis-aligned shell returns 0 (no rotation). Deterministic + pure.
 */
export function principalAxisAngle(poly: readonly Pt[]): number {
    if (poly.length < 3) return 0;
    let sx = 0, sz = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < EPS) continue;
        const theta = Math.atan2(dz, dx);
        sx += len * Math.cos(4 * theta);
        sz += len * Math.sin(4 * theta);
    }
    if (Math.abs(sx) < EPS && Math.abs(sz) < EPS) return 0;
    // mean 4θ → θ; then normalise into (−π/4, π/4].
    let angle = Math.atan2(sz, sx) / 4;
    const Q = Math.PI / 2;
    while (angle > Q / 2 + EPS) angle -= Q;
    while (angle <= -Q / 2 + EPS) angle += Q;
    return angle;
}

// ── §STAIR-KEEPOUT (A.21.D21, 2026-06-06) ────────────────────────────────────
//
// A multi-storey HOUSE reserves a vertical stair core that must be a REAL spatial
// keep-out: no room/partition may tile across it (SPEC-CASA §7 — resolves
// Deviation A, which only shrank the area budget and left the core's LOCATION
// un-carved, so partitions could still cross the stair). Subtracting the core rect
// from the buildable rect set BEFORE subdivide means the subdivider never places a
// room over the core and interior walls terminate at the core edge — a genuine
// keep-out, not a post-hoc clip. Pure + deterministic; apartment path never passes
// a hole, so its decomposition is bit-identical (additive helper, no existing
// export changed).

/** Subtract an axis-aligned `hole` from one `rect` via a guillotine split, yielding
 *  0–4 non-overlapping sub-rects that together cover `rect \ hole`. Sub-cells thinner
 *  than `minCellM` in either dimension are dropped (unusable slivers). When the hole
 *  doesn't overlap, the original rect is returned unchanged. */
function subtractRectFromRect(rect: Rect, hole: Rect, minCellM: number): Rect[] {
    // Intersection of rect and hole.
    const ix0 = Math.max(rect.x0, hole.x0);
    const ix1 = Math.min(rect.x1, hole.x1);
    const iz0 = Math.max(rect.z0, hole.z0);
    const iz1 = Math.min(rect.z1, hole.z1);
    if (ix1 - ix0 <= EPS || iz1 - iz0 <= EPS) return [rect];   // no real overlap

    const out: Rect[] = [];
    const push = (x0: number, z0: number, x1: number, z1: number): void => {
        if (x1 - x0 >= minCellM && z1 - z0 >= minCellM) {
            out.push({ x0: round6(x0), z0: round6(z0), x1: round6(x1), z1: round6(z1) });
        }
    };
    // Bottom band (below the hole), spanning the rect's full width.
    push(rect.x0, rect.z0, rect.x1, iz0);
    // Top band (above the hole), spanning the rect's full width.
    push(rect.x0, iz1, rect.x1, rect.z1);
    // Left band (beside the hole), only across the hole's z-extent.
    push(rect.x0, iz0, ix0, iz1);
    // Right band (beside the hole), only across the hole's z-extent.
    push(ix1, iz0, rect.x1, iz1);
    return out;
}

/**
 * Subtract one or more axis-aligned `holes` from a set of `rects`, returning the
 * covering rect set of `(⋃rects) \ (⋃holes)`. Each hole is guillotine-subtracted
 * from every (possibly already-split) rect in turn. Slivers thinner than `minCellM`
 * are dropped. Empty `holes` ⇒ the input rects unchanged (no-op). Pure + deterministic.
 */
export function subtractRectsFromRects(
    rects: readonly Rect[], holes: readonly Rect[], minCellM = 0.5,
): Rect[] {
    if (holes.length === 0) return rects.map(r => ({ ...r }));
    let cur: Rect[] = rects.map(r => ({ ...r }));
    for (const hole of holes) {
        const next: Rect[] = [];
        for (const r of cur) next.push(...subtractRectFromRect(r, hole, minCellM));
        cur = next;
    }
    return cur;
}

/** Greedy-merge rectangles that share a vertical seam (a.x1 === b.x0) and the
 *  same [z0,z1] band — collapses a sliced rectangle back into one. */
export function mergeHorizontally(rects: readonly Rect[]): Rect[] {
    const out = rects.map(r => ({ ...r }));
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                const a = out[i]!, b = out[j]!;
                const sameBand = Math.abs(a.z0 - b.z0) < EPS && Math.abs(a.z1 - b.z1) < EPS;
                if (!sameBand) continue;
                if (Math.abs(a.x1 - b.x0) < EPS) { out[i] = { x0: a.x0, z0: a.z0, x1: b.x1, z1: a.z1 }; out.splice(j, 1); merged = true; break; }
                if (Math.abs(b.x1 - a.x0) < EPS) { out[i] = { x0: b.x0, z0: a.z0, x1: a.x1, z1: a.z1 }; out.splice(j, 1); merged = true; break; }
            }
            if (merged) break;
        }
    }
    return out;
}
