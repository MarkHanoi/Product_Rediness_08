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

interface Vertex {
    x: number;
    z: number;
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
    ): PochePolygon[] {
        const posAttr = geometry.getAttribute('position');
        if (!posAttr) return [];

        const arr = posAttr.array as Float32Array;
        return PocheFillBuilder._fromRawBuffer(arr, fill, opacity, toleranceM);
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
    ): PochePolygon[] {
        return PocheFillBuilder._fromRawBuffer(positions, fill, opacity, toleranceM);
    }

    // ── Private implementation ─────────────────────────────────────────────

    private static _fromRawBuffer(
        positions: ArrayLike<number>,
        fill: string,
        opacity: number,
        toleranceM: number,
    ): PochePolygon[] {
        const segments = PocheFillBuilder._parseSegments(positions, toleranceM);
        if (segments.length === 0) return [];

        const closedLoops = PocheFillBuilder._stitchClosedLoops(segments);
        return closedLoops.map(loop => ({
            points: loop.map(v => `${v.x.toFixed(4)},${v.z.toFixed(4)}`).join(' '),
            fill,
            opacity,
        }));
    }

    /**
     * Parse interleaved XYZ buffer into deduplicated Segment objects.
     * XZ plane only — Y is ignored (plan view geometry is flat).
     */
    private static _parseSegments(
        positions: ArrayLike<number>,
        toleranceM: number,
    ): Segment[] {
        const segments: Segment[] = [];
        const quantise = (v: number) => {
            const factor = 1 / toleranceM;
            return Math.round(v * factor) / factor;
        };
        const key = (x: number, z: number) => `${x.toFixed(4)}|${z.toFixed(4)}`;

        for (let i = 0; i + 5 < positions.length; i += 6) {
            const ax = quantise(positions[i]!);
            const az = quantise(positions[i + 2]!);
            const bx = quantise(positions[i + 3]!);
            const bz = quantise(positions[i + 5]!);

            const aKey = key(ax, az);
            const bKey = key(bx, bz);

            if (aKey === bKey) continue;

            segments.push({ a: { x: ax, z: az }, b: { x: bx, z: bz }, aKey, bKey });
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
