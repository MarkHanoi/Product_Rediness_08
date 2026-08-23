// BoundaryLineGeometry — the pure maths of a construction / setting-out line.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900..L-7903) · C105 §2 · C73 (determinism).
//
// ⭐ EVERYTHING HERE IS A FUNCTION OF `vertices` + `closed`. Nothing derived is
// stored on the record (C84 §8.i): length, segment count, centroid, a point's world
// pose and the extruded solid are all computed on demand, so a vertex drag cannot
// leave a stale copy behind.
//
// LAYER / PURITY (L2): imports `@opentelemetry/api` and this package's own types.
// No DOM, no THREE, no I/O.

import { trace, type Tracer } from '@opentelemetry/api';
import type {
    BoundaryLineAttachment,
    BoundaryLineData,
    Vec2XZ,
    Vec3XYZ,
} from './BoundaryLineTypes';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/geometry-boundary-line', '0.1.0');
}

/**
 * Sub-millimetre. Below this a segment has no reliable direction, so an anchor on it
 * has no reliable normal. C73 §2 — one epsilon, named, never re-typed at a call site.
 */
export const BOUNDARY_LINE_EPSILON_M = 1e-6;

/** One segment of the line, with everything an anchor needs to be evaluated. */
export interface BoundaryLineSegment {
    readonly index: number;
    readonly a: Vec3XYZ;
    readonly b: Vec3XYZ;
    /** Metres. Zero-length segments are RETAINED and reported, never filtered out. */
    readonly length: number;
    /** Unit direction a→b in XZ, or `null` when the segment is degenerate. */
    readonly dir: Vec2XZ | null;
    /** Unit LEFT normal (dir rotated −90° in XZ), or `null` when degenerate. */
    readonly normal: Vec2XZ | null;
}

/**
 * Every segment of the line, in vertex order.
 *
 * ⚠ A DEGENERATE SEGMENT IS KEPT, WITH `dir: null`. Filtering it out would renumber
 * every segment after it, and every attachment stores a `segmentIndex` — so a filter
 * would silently re-anchor half the dependents to the wrong edge. "The segment is
 * degenerate" and "the segment is not there" are different facts (C78 §1.4), and the
 * propagator refuses BY NAME on the first rather than misplacing on the second.
 */
export function boundaryLineSegments(line: BoundaryLineData): readonly BoundaryLineSegment[] {
    const v = line.vertices;
    const n = line.closed ? v.length : v.length - 1;
    const out: BoundaryLineSegment[] = [];
    for (let i = 0; i < n; i++) {
        const a = v[i]!;
        const b = v[(i + 1) % v.length]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        const ok = length > BOUNDARY_LINE_EPSILON_M;
        out.push({
            index: i,
            a,
            b,
            length,
            dir: ok ? { x: dx / length, z: dz / length } : null,
            // LEFT normal in a right-handed XZ plan frame: (dx,dz) → (dz,−dx).
            // Sign convention is stated once, here, and every offset in the family
            // is measured against it — a second convention elsewhere would mirror
            // every dependent to the wrong side of the line.
            normal: ok ? { x: dz / length, z: -dx / length } : null,
        });
    }
    return out;
}

/** Total plan length in metres. */
export function boundaryLineLength(line: BoundaryLineData): number {
    let total = 0;
    for (const s of boundaryLineSegments(line)) total += s.length;
    return total;
}

/** Vertex-average centroid in the XZ plane. Sufficient for a containment probe. */
export function boundaryLineCentroid(line: BoundaryLineData): Vec2XZ {
    let x = 0;
    let z = 0;
    for (const p of line.vertices) {
        x += p.x;
        z += p.z;
    }
    const n = Math.max(1, line.vertices.length);
    return { x: x / n, z: z / n };
}

/**
 * The world pose an anchor `(segmentIndex, t, offset)` names on THIS line.
 *
 * ⭐ THIS FUNCTION IS THE WHOLE PROPAGATION MECHANISM. A dependent's world position
 * is never stored against the line — it is COMPUTED from the anchor. Evaluate the
 * anchor against the OLD line and you get where the dependent is; evaluate the SAME
 * anchor against the NEW line and you get where it must go. The move is therefore a
 * re-evaluation, not a synchronisation someone has to remember to run.
 *
 * Returns `null` when the segment does not exist or is degenerate — the two cases
 * the caller must REFUSE BY NAME rather than approximate. Returning a plausible
 * point for a degenerate segment is exactly the silent-misplacement defect C84
 * EI-PROP-c calls "worse than no handler".
 */
export function poseOnBoundaryLine(
    line: BoundaryLineData,
    anchor: { segmentIndex: number; t: number; offset: number },
): Vec3XYZ | null {
    const segs = boundaryLineSegments(line);
    const seg = segs[anchor.segmentIndex];
    if (!seg || !seg.dir || !seg.normal) return null;
    const t = Math.min(1, Math.max(0, anchor.t));
    const bx = seg.a.x + (seg.b.x - seg.a.x) * t;
    const bz = seg.a.z + (seg.b.z - seg.a.z) * t;
    const by = seg.a.y + (seg.b.y - seg.a.y) * t;
    return {
        x: bx + seg.normal.x * anchor.offset,
        y: by,
        z: bz + seg.normal.z * anchor.offset,
    };
}

/**
 * The anchor that names a world point on this line — the inverse of
 * `poseOnBoundaryLine`, used at ATTACH time to capture where a dependent sits.
 *
 * Chooses the segment whose perpendicular foot is nearest the point. Ties are broken
 * by the LOWEST segment index, deterministically (C73 §1: a geometric routine that
 * can answer two ways must state which, or a rebuild will disagree with itself).
 *
 * Returns `null` when every segment is degenerate — i.e. the line has no direction
 * anywhere, so no anchor on it can mean anything.
 */
export function anchorOnBoundaryLine(
    line: BoundaryLineData,
    point: Vec2XZ,
): { segmentIndex: number; t: number; offset: number } | null {
    let best: { segmentIndex: number; t: number; offset: number; d2: number } | null = null;
    for (const seg of boundaryLineSegments(line)) {
        if (!seg.dir || !seg.normal) continue;
        const px = point.x - seg.a.x;
        const pz = point.z - seg.a.z;
        // Projection onto the segment, CLAMPED — a point beyond an end belongs to the
        // end, not to an imaginary extension. An unclamped t would let a dependent
        // fly off the end of a shortened line instead of riding its new corner.
        const along = Math.min(seg.length, Math.max(0, px * seg.dir.x + pz * seg.dir.z));
        const t = seg.length > 0 ? along / seg.length : 0;
        const footX = seg.a.x + seg.dir.x * along;
        const footZ = seg.a.z + seg.dir.z * along;
        const dx = point.x - footX;
        const dz = point.z - footZ;
        const d2 = dx * dx + dz * dz;
        // SIGNED offset, so which SIDE of the line the dependent sits on survives the
        // round trip. An unsigned distance would mirror every inset wall to the
        // outside on the first move.
        const offset = dx * seg.normal.x + dz * seg.normal.z;
        if (!best || d2 < best.d2 - BOUNDARY_LINE_EPSILON_M) {
            best = { segmentIndex: seg.index, t, offset, d2 };
        }
    }
    if (!best) return null;
    return { segmentIndex: best.segmentIndex, t: best.t, offset: best.offset };
}

/**
 * The rigid transform that carries a whole AREA dependent (slab, floor, ceiling,
 * room) when the line moves.
 *
 * ⭐ AN AREA DEPENDENT IS NOT RE-SEATED VERTEX BY VERTEX, AND THAT IS DELIBERATE.
 * A slab's polygon has its own vertices which are NOT the line's; re-projecting each
 * of them onto the nearest segment would re-shape the slab into the line, destroying
 * an authored outline the user never asked to change (C81 — intent preservation).
 * Instead the slab is TRANSLATED by the displacement its own anchor underwent. If
 * the line was re-shaped rather than displaced, the anchor's displacement is still
 * the honest single answer for "where did the thing this slab was pinned to go".
 *
 * Returns `null` when the anchor cannot be evaluated on either line.
 */
export function anchorDisplacement(
    prev: BoundaryLineData,
    next: BoundaryLineData,
    anchor: { segmentIndex: number; t: number; offset: number },
): { dx: number; dy: number; dz: number } | null {
    const from = poseOnBoundaryLine(prev, anchor);
    const to = poseOnBoundaryLine(next, anchor);
    if (!from || !to) return null;
    return { dx: to.x - from.x, dy: to.y - from.y, dz: to.z - from.z };
}

/** Both endpoints of a LINE-shaped dependent, as the new line places them. */
export function spanOnBoundaryLine(
    line: BoundaryLineData,
    attachment: BoundaryLineAttachment,
): { start: Vec3XYZ; end: Vec3XYZ } | null {
    const start = poseOnBoundaryLine(line, attachment);
    if (!start) return null;
    if (!attachment.end) return null;
    const end = poseOnBoundaryLine(line, attachment.end);
    if (!end) return null;
    return { start, end };
}

/**
 * ⭐ THE FOUNDER'S VOLUME — *"the line could have volume also"*.
 *
 * The extruded SOLID of a boundary line: one prism per segment, `thickness` wide
 * (centred on the line) and `height` tall, based at `baseOffset` above the level FFL.
 *
 * Returned as PURE DATA — a footprint ring per segment plus the two Y values — never
 * as a mesh. The mesh is built by the renderer from this, which is what keeps this
 * package THREE-free and testable (P2), and what lets the plan projector draw the
 * same footprint the 3-D solid stands on rather than a second one.
 *
 * ⛔ Returns `[]` when `hasVolume` is false. That is not an error state and callers
 * MUST NOT treat it as one: a linework boundary line legitimately has no solid, and
 * conflating "no volume, by intent" with "the extruder failed" is the emptiness /
 * failure collapse (C78 §1.4).
 */
export interface BoundaryLineSolidSlice {
    readonly segmentIndex: number;
    /** Footprint ring in world XZ, OPEN loop of 4 points, CCW when thickness > 0. */
    readonly footprint: readonly Vec2XZ[];
    readonly baseY: number;
    readonly topY: number;
}

export function boundaryLineSolid(
    line: BoundaryLineData,
    resolved: { height: number; thickness: number; baseOffset: number },
    levelElevation = 0,
): readonly BoundaryLineSolidSlice[] {
    return _tracer().startActiveSpan('pryzm.boundary_line.solid', (span) => {
        try {
            span.setAttribute('pryzm.boundary_line.has_volume', line.hasVolume);
            if (!line.hasVolume) {
                span.setAttribute('pryzm.boundary_line.slices', 0);
                return [];
            }
            const half = resolved.thickness / 2;
            const baseY = levelElevation + resolved.baseOffset;
            const topY = baseY + resolved.height;
            const out: BoundaryLineSolidSlice[] = [];
            for (const seg of boundaryLineSegments(line)) {
                if (!seg.normal) continue; // degenerate: nothing to extrude, and saying so is the caller's job
                const nx = seg.normal.x * half;
                const nz = seg.normal.z * half;
                out.push({
                    segmentIndex: seg.index,
                    footprint: [
                        { x: seg.a.x + nx, z: seg.a.z + nz },
                        { x: seg.b.x + nx, z: seg.b.z + nz },
                        { x: seg.b.x - nx, z: seg.b.z - nz },
                        { x: seg.a.x - nx, z: seg.a.z - nz },
                    ],
                    baseY,
                    topY,
                });
            }
            span.setAttribute('pryzm.boundary_line.slices', out.length);
            return out;
        } finally {
            span.end();
        }
    });
}
