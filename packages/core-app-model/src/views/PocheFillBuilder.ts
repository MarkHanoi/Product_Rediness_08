/**
 * PocheFillBuilder — DOC-2.5j (VQ-02)
 *
 * Reconstructs closed wall outline polygons from plan-view LineSegments geometry
 * so SVG/PDF exports can render wall poche (solid fill) rather than outlines only.
 *
 * Algorithm:
 *   1. Walk the Float32Array position buffer: every pair of 3-component vertices
 *      is one line segment.  Map XZ coordinates only (Y is the vertical axis in
 *      Three.js plan views; plan outlines lie in the XZ plane).
 *   2. Snap each endpoint to a 1 mm grid (quantise) and build an adjacency list:
 *      endpoint key → set of segment indices that touch it.
 *   3. Walk unvisited segments to form chains; when a chain closes back to its
 *      start vertex the chain is a closed polygon.  Polygons with fewer than 3
 *      vertices are discarded (degenerate).
 *   4. Convert each closed polygon to an SVG `points` attribute string and return
 *      it together with the VG fill colour and opacity.
 *
 * Why graph stitching instead of convex hull?
 *   Walls produce thin elongated polygons with many interior lines (wall-layer
 *   subdivision, opening faces).  A convex hull over all vertices would fill the
 *   bounding box of all walls rather than individual wall bodies.  Graph stitching
 *   follows the actual projected outline.
 *
 * Scale note:
 *   The returned `points` strings are in Three.js world-space metres (XZ).
 *   The consuming renderer (SVGCompositeRenderer) is responsible for applying the
 *   viewbox transform (scale + translate) before inserting them into SVG markup.
 *
 * Contract compliance:
 *   §01 §5 — Pure geometry utility; no Three.js scene graph manipulation.
 *   §05 §4 — No DOM, no rendering; data-transform only.
 *   §01 §3.3 — All inputs/outputs are plain objects + primitives (serialisable).
 */

import * as THREE from '@pryzm/renderer-three/three';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** SVG-ready polygon descriptor.  One element per detected closed wall outline. */
export interface PochePolygon {
    /**
     * SVG `points` attribute value: space-separated "x,z" pairs in world metres.
     * Example: "0,0 3.5,0 3.5,0.3 0,0.3"
     */
    points: string;
    /** CSS hex fill colour, e.g. '#1a1a1a'. Sourced from VGCategoryStyle.fillColor. */
    fill: string;
    /** Fill opacity 0..1. Derived from VGCategoryStyle.transparency (0 = opaque → 1.0). */
    opacity: number;
    /**
     * DOC-4.6 — Optional hatch pattern key (see HatchPatternLibrary.HatchPattern).
     * When absent or 'solid', the polygon renders with a plain solid fill.
     * Set by SVGCompositeRenderer.buildWallPoche() from VGCategoryStyle.fillPattern.
     */
    fillPattern?: string;
    /**
     * DOC-4.6 — Optional hatch line stroke colour for patterned fills.
     * Defaults to a dark tone derived from `fill` when not set explicitly.
     */
    strokeColor?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §SECTION-POCHE-HAS-A-PLANE (founder 2026-09-09 · L-13269 · C09 §4.6)
 *
 * WHICH TWO WORLD AXES the cut ring is flattened onto before it is stitched into a loop.
 *
 * ⛔ THIS EXISTS BECAUSE THE BUILDER HARD-CODED `xz` AND SECTIONS COULD THEREFORE NEVER HATCH.
 * A PLAN cut ring is horizontal — it varies in x and z at a constant y — so reading
 * `positions[i]` and `positions[i+2]` is exactly right, and that is what the old comment
 * ("XZ plane only — Y is ignored (plan view geometry is flat)") correctly described.
 *
 * ⭐ A SECTION CUT RING IS VERTICAL. `buildMeshPlaneIntersectionGeometry` emits a ring that is
 * COPLANAR WITH THE SECTION DEPTH PLANE: it varies in y and in ONE horizontal axis, and is
 * CONSTANT in the other. Flattened onto xz, every vertex of a vertical wall face collapses to
 * the same point — `aKey === bKey` — so every segment is dropped as degenerate, the loop
 * stitcher receives an empty array, and the function returns `[]`. Not a faint poché: NO
 * poché, silently, for every section and elevation this product has ever drawn.
 */
export type PochePlane =
    /** Horizontal — the PLAN cut. Reduce (x, z); ignore y. The default, unchanged. */
    | 'xz'
    /** Vertical, looking along +z — reduce (x, y). A section/elevation cut facing z. */
    | 'xy'
    /** Vertical, looking along +x — reduce (z, y). A section/elevation cut facing x. */
    | 'zy';

/** The component offsets, within one XYZ triple, that a plane reduces onto. */
const PLANE_OFFSETS: Readonly<Record<PochePlane, readonly [number, number]>> = {
    xz: [0, 2],
    xy: [0, 1],
    zy: [2, 1],
};

/**
 * A point on the chosen plane. ⚠ `u` / `v` are the two IN-PLANE axes, NOT world x / world z —
 * they were named `x` / `z` until L-13269, which is precisely how the hard-coded plane went
 * unnoticed: a variable that means "world x" in one reading and "first in-plane axis" in
 * another is the shape this repo keeps paying for.
 */
interface Vertex {
    u: number;
    v: number;
}

interface Segment {
    a: Vertex;
    b: Vertex;
    aKey: string;
    bKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PocheFillBuilder
// ─────────────────────────────────────────────────────────────────────────────

export class PocheFillBuilder {

    /**
     * Build poche polygons from a Three.js `BufferGeometry` that belongs to a
     * `THREE.LineSegments` object (the geometry representation used by OBC's
     * TechnicalDrawing wall layers after edge projection).
     *
     * @param geometry   - BufferGeometry with a `position` attribute.
     * @param fill       - CSS hex colour for the filled region.
     * @param opacity    - Fill opacity 0..1.
     * @param toleranceM - Snap tolerance in metres (default 0.002 = 2 mm).
     */
    static fromGeometry(
        geometry: THREE.BufferGeometry,
        fill: string,
        opacity: number,
        toleranceM = 0.002,
        plane: PochePlane = 'xz',
    ): PochePolygon[] {
        const posAttr = geometry.getAttribute('position');
        if (!posAttr) return [];

        const arr = posAttr.array as Float32Array;
        return PocheFillBuilder._fromRawBuffer(arr, fill, opacity, toleranceM, plane);
    }

    /**
     * Build poche polygons from a raw Float32Array of interleaved XYZ vertices.
     * Every consecutive pair of vertices is one line segment.
     * (Matches the layout produced by THREE.LineSegments geometry.)
     */
    static fromRawBuffer(
        positions: ArrayLike<number>,
        fill: string,
        opacity: number,
        toleranceM = 0.002,
        plane: PochePlane = 'xz',
    ): PochePolygon[] {
        return PocheFillBuilder._fromRawBuffer(positions, fill, opacity, toleranceM, plane);
    }

    // ── Private implementation ─────────────────────────────────────────────

    private static _fromRawBuffer(
        positions: ArrayLike<number>,
        fill: string,
        opacity: number,
        toleranceM: number,
        plane: PochePlane = 'xz',
    ): PochePolygon[] {
        const segments = PocheFillBuilder._parseSegments(positions, toleranceM, plane);
        if (segments.length === 0) return [];

        const closedLoops = PocheFillBuilder._stitchClosedLoops(segments);
        return closedLoops.map(loop => ({
            points: loop.map(pt => `${pt.u.toFixed(4)},${pt.v.toFixed(4)}`).join(' '),
            fill,
            opacity,
        }));
    }

    /**
     * Parse an interleaved XYZ buffer into deduplicated Segment objects, reduced onto `plane`.
     *
     * ⚠ A DEGENERATE SEGMENT IS STILL DROPPED, and must be: two coincident points carry no
     * edge. What changed in L-13269 is WHICH points are coincident — on a vertical ring read as
     * `xz`, ALL of them were.
     */
    private static _parseSegments(
        positions: ArrayLike<number>,
        toleranceM: number,
        plane: PochePlane,
    ): Segment[] {
        const segments: Segment[] = [];
        const quantise = (v: number) => {
            const factor = 1 / toleranceM;
            return Math.round(v * factor) / factor;
        };
        const key = (u: number, v: number) => `${u.toFixed(4)}|${v.toFixed(4)}`;
        const [o0, o1] = PLANE_OFFSETS[plane];

        for (let i = 0; i + 5 < positions.length; i += 6) {
            const au = quantise(positions[i + o0]!);
            const av = quantise(positions[i + o1]!);
            const bu = quantise(positions[i + 3 + o0]!);
            const bv = quantise(positions[i + 3 + o1]!);

            const aKey = key(au, av);
            const bKey = key(bu, bv);

            if (aKey === bKey) continue;

            segments.push({ a: { u: au, v: av }, b: { u: bu, v: bv }, aKey, bKey });
        }
        return segments;
    }

    /**
     * Graph-based edge stitching.
     *
     * Build adjacency: endpointKey → list of (segIndex, otherEndKey).
     * Walk from each unvisited segment; extend the chain by finding any unvisited
     * segment that shares the current chain tip's endpoint.  When the tip matches
     * the chain's start key, the chain is a closed loop.
     *
     * Produces only closed loops with ≥ 3 vertices.
     */
    private static _stitchClosedLoops(segments: Segment[]): Vertex[][] {
        const adj = new Map<string, Array<{ segIdx: number; otherKey: string; otherVert: Vertex }>>();

        for (let i = 0; i < segments.length; i++) {
            const s = segments[i] as Segment;
            if (!adj.has(s.aKey)) adj.set(s.aKey, []);
            if (!adj.has(s.bKey)) adj.set(s.bKey, []);
            adj.get(s.aKey)!.push({ segIdx: i, otherKey: s.bKey, otherVert: s.b });
            adj.get(s.bKey)!.push({ segIdx: i, otherKey: s.aKey, otherVert: s.a });
        }

        const usedSegments = new Uint8Array(segments.length);
        const closedLoops: Vertex[][] = [];

        for (let startIdx = 0; startIdx < segments.length; startIdx++) {
            if (usedSegments[startIdx]) continue;

            const s0 = segments[startIdx] as Segment;
            usedSegments[startIdx] = 1;

            const chain: Vertex[] = [s0.a, s0.b];
            let tipKey  = s0.bKey;
            const startKey = s0.aKey;

            let extended = true;
            while (extended) {
                extended = false;
                if (tipKey === startKey && chain.length >= 3) {
                    chain.pop();
                    closedLoops.push([...chain]);
                    break;
                }

                const neighbours = adj.get(tipKey) ?? [];
                for (const nb of neighbours) {
                    if (usedSegments[nb.segIdx]) continue;
                    usedSegments[nb.segIdx] = 1;
                    chain.push(nb.otherVert);
                    tipKey = nb.otherKey;
                    extended = true;
                    break;
                }
            }
        }

        return closedLoops;
    }
}
