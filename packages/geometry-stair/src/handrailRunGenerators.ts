/**
 * handrailRunGenerators — §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18).
 *
 * THE FOUNDER, in substance:
 *   "I want [the railing] created in the same way [as the wall] … the user could
 *    select from a number of railings and decide whether they want to create
 *    railing BY LINE, ORTHO, CURVED, BY SLAB and add SQUARE, CIRCULAR, ELLIPSE."
 *
 * WHAT THIS MODULE IS, AND WHAT IT DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * It is the PURE geometry of a handrail RUN: the vertex list a mode produces, and
 * the two-point SEGMENTS that vertex list decomposes into. It touches no store, no
 * command, no THREE and no DOM, so every mode can be proven by a unit test that
 * runs the same function the plan tool runs — not a look-alike (C84 §8.e).
 *
 * ⛔ IT IS NOT A SECOND HANDRAIL RECORD SHAPE. `HandrailData.baseLine` is a
 * 2-tuple and this module does not pretend otherwise: a multi-segment run IS N
 * two-point handrails, exactly as a multi-segment WALL run is N walls. That is the
 * parity the founder asked for, expressed structurally. C95 §5 D1 records that the
 * bus bridge REFUSES an N-point `path` by name rather than collapsing it; this
 * module is the other half of that answer — the capability the refusal was holding
 * the door open for.
 *
 * THE JOIN IS THE WHOLE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * `HandrailFragmentBuilder` emits an end post at BOTH ends of every segment. Two
 * segments meeting at a corner therefore put two coincident posts on that corner,
 * and a closed loop puts two on its closure point — a thickened, z-fighting stub
 * and a double count in every schedule. `segmentsFrom…` makes each vertex the
 * responsibility of exactly ONE segment by setting `suppressStartPost`:
 *
 *   OPEN run   v0…vN : segment 0 keeps its start post (nothing else owns v0);
 *                      every later segment suppresses its start post.
 *                      ⇒ posts at v0 (seg 0 start) and v1…vN (each segment's end).
 *   CLOSED loop v0…v(N-1) : EVERY segment suppresses its start post, because the
 *                      last segment's END post already stands on v0.
 *                      ⇒ posts at v1…v(N-1), v0. One per vertex, none doubled.
 *
 * Both cases: |posts| === |distinct vertices|. `handrailRunGenerators.spec.ts`
 * asserts that as an invariant rather than as N hand-written cases.
 *
 * CONTRACTS: C95 §D4 (creation parity) · C84 EI-3 (what the UI offers, the
 * pipeline accepts) · C73 (tolerance — the degenerate guards below).
 */

/** A point on the run, in world XZ. Y comes from the level + baseOffset. */
export interface HandrailRunPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * One two-point handrail of a run, ready to become a `CreateHandrailCommand`.
 * `suppressStartPost` is written straight onto `HandrailData` — see the header.
 */
export interface HandrailRunSegment {
    readonly start: HandrailRunPoint;
    readonly end: HandrailRunPoint;
    readonly suppressStartPost: boolean;
}

/**
 * The creation modes handrail offers. `linear` / `ortho` / `curved` are the WALL
 * modes (declared once in `elementCreationMatrix.WALL_DRAW_MODES` and mirrored
 * here only as a union, never as a second list of labels); `byslab` is wall's
 * By-Slab action; `square` / `circular` / `ellipse` are the closed-loop
 * generators the founder added.
 */
export type HandrailRunMode =
    | 'linear'
    | 'ortho'
    | 'curved'
    | 'byslab'
    | 'square'
    | 'circular'
    | 'ellipse';

/** The closed-loop generators — the modes that produce a whole run from ONE gesture. */
export const HANDRAIL_LOOP_MODES: readonly HandrailRunMode[] = ['square', 'circular', 'ellipse'] as const;

export function isHandrailLoopMode(m: string): m is 'square' | 'circular' | 'ellipse' {
    return (HANDRAIL_LOOP_MODES as readonly string[]).includes(m);
}

/**
 * The shortest segment `CreateHandrailCommand.canExecute` will accept
 * (`CreateHandrailCommand.ts` — "Handrail must be at least 0.1 m long").
 *
 * ⚠ THIS IS A MEASURED MIRROR OF THE COMMAND'S RULE, NOT A SECOND RULE. The
 * generators use it to CHOOSE a segment count that the command will accept, so a
 * circle can never be emitted as 64 sub-0.1 m chords of which the command silently
 * refuses every one. `handrailRunGenerators.spec.ts` asserts every emitted segment
 * clears it, which is what keeps the two numbers honest.
 */
export const MIN_HANDRAIL_SEGMENT_M = 0.1;

/** Below this a click-drag is a mis-click, not a shape. */
const MIN_LOOP_EXTENT_M = 0.2;

/** Chord length a curved loop aims for. Coarser than a rendered curve on purpose:
 *  each chord is a REAL handrail element with its own posts, so over-tessellating
 *  a 2 m circle into 60 elements would be a schedule full of 100 mm rails. */
const TARGET_CHORD_M = 0.6;

const MIN_LOOP_SEGMENTS = 8;
const MAX_LOOP_SEGMENTS = 48;

// ─────────────────────────────────────────────────────────────────────────────
// Vertex lists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A closed rectangular loop from two OPPOSITE corners — the `square` mode.
 *
 * The mode is named "Square" because that is the founder's word for it; what it
 * builds is the axis-aligned RECTANGLE through the two clicked corners, which is
 * the useful gesture (a balcony guard is rarely equilateral). The vertex order is
 * CCW in the XZ plane so the run has a consistent handedness.
 *
 * Returns `[]` for a degenerate drag — an empty run, never a zero-area loop.
 */
export function rectangleLoopVertices(
    a: HandrailRunPoint,
    b: HandrailRunPoint,
): HandrailRunPoint[] {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const z0 = Math.min(a.z, b.z);
    const z1 = Math.max(a.z, b.z);
    if (x1 - x0 < MIN_LOOP_EXTENT_M || z1 - z0 < MIN_LOOP_EXTENT_M) return [];
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}

/**
 * How many chords to cut a loop of the given circumference into.
 *
 * Bounded on BOTH sides for reasons that are not cosmetic:
 *   • the lower bound keeps a small circle recognisable as a circle;
 *   • the upper bound, and the `MIN_HANDRAIL_SEGMENT_M` clamp, keep every chord
 *     long enough for `CreateHandrailCommand` to accept it. A generator that
 *     emitted segments the command refuses would report success and create
 *     nothing — the exact "committed ≠ reachable" failure this repo keeps paying
 *     for.
 */
export function loopSegmentCount(circumference: number): number {
    if (!Number.isFinite(circumference) || circumference <= 0) return 0;
    const byChord = Math.round(circumference / TARGET_CHORD_M);
    const maxByMinLength = Math.floor(circumference / MIN_HANDRAIL_SEGMENT_M);
    const n = Math.min(Math.max(byChord, MIN_LOOP_SEGMENTS), MAX_LOOP_SEGMENTS, maxByMinLength);
    return n >= 3 ? n : 0;
}

/**
 * A closed circular loop — the `circular` mode. `centre` then a point ON the
 * circle (the second click) give the radius.
 */
export function circleLoopVertices(
    centre: HandrailRunPoint,
    rim: HandrailRunPoint,
): HandrailRunPoint[] {
    const r = Math.hypot(rim.x - centre.x, rim.z - centre.z);
    if (!(r >= MIN_LOOP_EXTENT_M)) return [];
    return ellipseLoopVerticesFromRadii(centre, r, r);
}

/**
 * A closed elliptical loop — the `ellipse` mode. `centre` then a BOUNDING-BOX
 * corner: the second click gives the two semi-axes as |dx| and |dz|, so dragging
 * out a square corner degenerates gracefully into a circle rather than refusing.
 */
export function ellipseLoopVertices(
    centre: HandrailRunPoint,
    corner: HandrailRunPoint,
): HandrailRunPoint[] {
    const rx = Math.abs(corner.x - centre.x);
    const rz = Math.abs(corner.z - centre.z);
    if (rx < MIN_LOOP_EXTENT_M || rz < MIN_LOOP_EXTENT_M) return [];
    return ellipseLoopVerticesFromRadii(centre, rx, rz);
}

function ellipseLoopVerticesFromRadii(
    centre: HandrailRunPoint,
    rx: number,
    rz: number,
): HandrailRunPoint[] {
    // Ramanujan's first approximation — exact enough to CHOOSE a segment count,
    // and named so nobody mistakes it for an exact perimeter.
    const h = ((rx - rz) * (rx - rz)) / ((rx + rz) * (rx + rz));
    const circumference = Math.PI * (rx + rz) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    const n = loopSegmentCount(circumference);
    if (n === 0) return [];
    const out: HandrailRunPoint[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        out.push({ x: centre.x + rx * Math.cos(t), z: centre.z + rz * Math.sin(t) });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertices → segments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decompose a vertex list into the two-point handrails that represent it, with
 * the post ownership resolved (see the header).
 *
 * Degenerate edges — anything shorter than the command's own minimum — are
 * DROPPED, and dropping is reported through the return value rather than a
 * console line, so a caller can say how many and why. A silently shortened run is
 * the defect class this whole lane exists to remove.
 */
export function segmentsFromVertices(
    vertices: readonly HandrailRunPoint[],
    closed: boolean,
): { segments: HandrailRunSegment[]; droppedDegenerate: number } {
    const segments: HandrailRunSegment[] = [];
    let droppedDegenerate = 0;
    if (vertices.length < 2) return { segments, droppedDegenerate };
    if (closed && vertices.length < 3) return { segments, droppedDegenerate };

    const edgeCount = closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < edgeCount; i++) {
        const a = vertices[i]!;
        const b = vertices[(i + 1) % vertices.length]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_HANDRAIL_SEGMENT_M) {
            droppedDegenerate++;
            continue;
        }
        segments.push({
            start: a,
            end: b,
            // OPEN: only the very first segment owns its start vertex.
            // CLOSED: nobody does — the last segment's END post stands there.
            suppressStartPost: closed ? true : i > 0,
        });
    }
    return { segments, droppedDegenerate };
}

/** The run a closed-loop MODE produces from its two gesture points. */
export function loopSegmentsForMode(
    mode: 'square' | 'circular' | 'ellipse',
    first: HandrailRunPoint,
    second: HandrailRunPoint,
): { segments: HandrailRunSegment[]; droppedDegenerate: number } {
    const vertices =
        mode === 'square'   ? rectangleLoopVertices(first, second) :
        mode === 'circular' ? circleLoopVertices(first, second) :
                              ellipseLoopVertices(first, second);
    return segmentsFromVertices(vertices, true);
}

/**
 * The run that guards a slab — the `byslab` ACTION, wall's "By Slab" in handrail
 * form. Takes the slab's boundary vertices in order and returns the closed run
 * that sits on them.
 *
 * ⚠ It does NOT inset the loop by half the rail thickness. A guard is set out on
 * the slab EDGE here, which is what the wall By-Slab action does with the wall
 * centreline, and matching it is the point. Recorded in C95 §12 so the absence is
 * declared rather than discovered.
 */
export function slabOutlineSegments(
    outline: readonly HandrailRunPoint[],
): { segments: HandrailRunSegment[]; droppedDegenerate: number } {
    // A boundary that repeats its first point as its last is a common encoding;
    // it would otherwise mint a zero-length closing edge.
    let pts = outline;
    if (pts.length >= 2) {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-9) pts = pts.slice(0, -1);
    }
    return segmentsFromVertices(pts, true);
}

/**
 * The ORTHO constraint, shared with the polyline path: snap `next` onto the
 * horizontal or vertical axis through `anchor`, whichever it is already closer
 * to. This is the wall tool's rule (90°-constrained segments) applied to a run.
 */
export function applyOrthoConstraint(
    anchor: HandrailRunPoint,
    next: HandrailRunPoint,
): HandrailRunPoint {
    const dx = next.x - anchor.x;
    const dz = next.z - anchor.z;
    return Math.abs(dx) >= Math.abs(dz)
        ? { x: next.x, z: anchor.z }
        : { x: anchor.x, z: next.z };
}

/**
 * The CURVED mode's vertex list: a quadratic Bézier through the clicked mid-point,
 * flattened to chords the command will accept.
 *
 * The construction is the boundary tools' "arc through a clicked midpoint"
 * (`CreationMode CURVED` — "Arc through a clicked midpoint"), expressed here in
 * the only form a handrail run can hold: a polyline. The control point is placed
 * so the curve PASSES THROUGH the clicked mid-point rather than merely being
 * pulled toward it — `C = 2M − (A + B)/2` — which is what makes the drawn arc
 * agree with the preview.
 */
export function curvedRunVertices(
    start: HandrailRunPoint,
    mid: HandrailRunPoint,
    end: HandrailRunPoint,
): HandrailRunPoint[] {
    const chord = Math.hypot(end.x - start.x, end.z - start.z);
    if (chord < MIN_HANDRAIL_SEGMENT_M) return [];
    const cx = 2 * mid.x - (start.x + end.x) / 2;
    const cz = 2 * mid.z - (start.z + end.z) / 2;
    // Rough arc length: the control polygon is an upper bound, the chord a lower
    // one; their mean is close enough to pick a segment count.
    const approxLen =
        (chord +
            Math.hypot(cx - start.x, cz - start.z) +
            Math.hypot(end.x - cx, end.z - cz)) / 2;
    const n = Math.min(
        Math.max(Math.round(approxLen / TARGET_CHORD_M), 2),
        MAX_LOOP_SEGMENTS,
        Math.max(1, Math.floor(approxLen / MIN_HANDRAIL_SEGMENT_M)),
    );
    const out: HandrailRunPoint[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        out.push({
            x: u * u * start.x + 2 * u * t * cx + t * t * end.x,
            z: u * u * start.z + 2 * u * t * cz + t * t * end.z,
        });
    }
    return out;
}
