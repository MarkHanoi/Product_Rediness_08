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

/**
 * Decompose a simple polygon (CW or CCW) into axis-aligned rectangles.
 * `minCellM` drops slivers narrower/shallower than that. Exact for rectilinear
 * polygons; stair-step approximation for slanted edges.
 */
export function decomposeToRects(poly: readonly Pt[], minCellM = 0.5): Rect[] {
    if (poly.length < 3) return [];

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
