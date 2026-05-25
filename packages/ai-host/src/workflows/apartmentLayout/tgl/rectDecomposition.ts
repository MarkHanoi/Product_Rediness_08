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
