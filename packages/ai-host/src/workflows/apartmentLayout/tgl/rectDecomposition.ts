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
