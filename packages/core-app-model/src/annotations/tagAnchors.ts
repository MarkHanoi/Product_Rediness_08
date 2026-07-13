// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — WHERE A TAG SITS, IN EITHER PROJECTION.
//
// ─────────────────────────────────────────────────────────────────────────────
// ELEVATION IS NOT PLAN WITH DIFFERENT NUMBERS (L-265 §3)
// ─────────────────────────────────────────────────────────────────────────────
// A tag is a leader from an ANCHOR (a point ON the element) to a TAG POINT (where
// the bubble is drawn). Both live in the VIEW'S projected plane:
//
//   PLAN      H = world X, V = world Z   → the anchor is the element's plan centre,
//                                          the leader runs along the wall NORMAL.
//   ELEVATION H = hSign·world[hWorldAxis], V = world Y (absolute elevation)
//                                        → the anchor is the element's position ON
//                                          THE FAÇADE, and the leader runs in world Y.
//
// The (H, V) frame is NOT reinvented here: it is the platform's existing `ViewPlane`
// (Contract 24 §3.1, `isVertical` / `hWorldAxis`), passed in by the executor — the
// same frame `applyElevationAutoDimensions` derives, and the same one the renderer's
// `_ptH`/`_ptV` project through. There is exactly one notion of "up" in PRYZM and
// this file consumes it rather than inventing a second.
//
// PURE — no stores, no THREE, no window. Anchors are world (x, y, z) triples because
// that is what an `AnnotationElement.geometry2D.modelPoints` holds; the renderer
// projects them. Unit-testable against known geometry.
//
// L-127 DIMENSIONAL TRUTH applies to positions too: every anchor is computed from
// the element's REAL baseline / offset / width / sill / height. No literal positions.

import { withAutoTagSpan } from './tracing.js';

export interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

/** The wall fields the anchor rules read (structural — mirrors the live store record). */
export interface TagWallLike {
    readonly id: string;
    readonly levelId?: string;
    readonly baseLine?: readonly [Vec3Like, Vec3Like];
    readonly thickness?: number;
    readonly height?: number;
}

/** The opening fields the anchor rules read. `offset` is the LEFT EDGE (§OPENING-OFFSET-LEFTEDGE-UNIFY). */
export interface TagOpeningLike {
    readonly id?: string;
    readonly elementId?: string;
    readonly type: 'door' | 'window';
    readonly offset?: number;
    readonly width?: number;
    readonly height?: number;
    readonly sillHeight?: number;
}

/** The view's (H, V) frame — taken from `ViewPlane`, never re-derived. */
export interface ViewFrame {
    readonly hWorldAxis: 'x' | 'z';
    readonly hSign: 1 | -1;
}

/** A leader: a point ON the element, and the point where the bubble is drawn. */
export interface TagAnchor {
    readonly anchor: Vec3Like;
    readonly tagPoint: Vec3Like;
}

// ── The rules, stated as constants so they are arguable, not buried ──────────

/** Plan: how far off the wall face an OPENING bubble stands (metres). */
export const PLAN_OPENING_LEADER_M = 1.2;
/** Plan: how far off the wall face a WALL diamond stands (metres). On the OTHER side. */
export const PLAN_WALL_LEADER_M = 0.9;
/** Alternating extra standoff so adjacent bubbles on one wall do not collide (metres). */
export const LEADER_STAGGER_M = 0.7;
/** Elevation: how far ABOVE an opening head its bubble sits (metres). */
export const ELEV_OPENING_LEADER_M = 0.7;
/** Elevation: how far above the wall MID-HEIGHT the wall diamond sits (metres). */
export const ELEV_WALL_LEADER_M = 0.6;

// ── Shared wall frame ────────────────────────────────────────────────────────

interface WallAxis {
    readonly a: Vec3Like;
    /** Unit direction along the baseline. */
    readonly u: { x: number; z: number };
    /** Unit LEFT normal of the baseline (−dz, dx). Deterministic, not "outward". */
    readonly n: { x: number; z: number };
    readonly length: number;
}

/**
 * The wall's 2D frame, or null for a degenerate wall. Exported so the executor and
 * the tests share ONE definition of "along the wall" and "across the wall".
 */
export function wallAxis(wall: TagWallLike): WallAxis | null {
    const bl = wall.baseLine;
    if (!bl || bl.length < 2) return null;
    const dx = bl[1].x - bl[0].x;
    const dz = bl[1].z - bl[0].z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return null;
    const u = { x: dx / length, z: dz / length };
    const n = { x: -u.z, z: u.x };
    return { a: bl[0], u, n, length };
}

/** The world-XZ centre of an opening along its host wall. Null when unusable. */
export function openingCentreXZ(wall: TagWallLike, opening: TagOpeningLike): Vec3Like | null {
    const ax = wallAxis(wall);
    if (!ax) return null;
    const offset = opening.offset;
    const width = opening.width;
    if (typeof offset !== 'number' || typeof width !== 'number' || width <= 0) return null;
    // §OPENING-OFFSET-LEFTEDGE-UNIFY — the store offset is the LEFT EDGE of the span,
    // so the centre is offset + width/2 (the same conversion `buildEvalSnapshot` makes).
    const s = offset + width / 2;
    return { x: ax.a.x + ax.u.x * s, y: 0, z: ax.a.z + ax.u.z * s };
}

// ── PLAN (H = X, V = Z) ──────────────────────────────────────────────────────

/**
 * PLAN — an opening's tag: anchor at the opening centre, bubble standing off the
 * wall on the +normal side. `index` staggers alternate bubbles along one wall so two
 * adjacent doors do not overlap; it is a deterministic function of the opening's
 * order on the wall, so a re-run places the tag in exactly the same place (which is
 * what makes "run it twice" a no-op instead of a jitter).
 *
 * P8 — opens `pryzm.autotag.anchor`.
 */
export function planOpeningTagAnchor(
    wall: TagWallLike,
    opening: TagOpeningLike,
    index = 0,
): TagAnchor | null {
    return withAutoTagSpan('anchor', (span): TagAnchor | null => {
        span.setAttribute('pryzm.autotag.projection', 'plan');
        const ax = wallAxis(wall);
        const centre = openingCentreXZ(wall, opening);
        if (!ax || !centre) return null;
        const standoff = PLAN_OPENING_LEADER_M + (index % 2) * LEADER_STAGGER_M;
        return {
            anchor: centre,
            tagPoint: {
                x: centre.x + ax.n.x * standoff,
                y: 0,
                z: centre.z + ax.n.z * standoff,
            },
        };
    });
}

/**
 * PLAN — a wall's tag: anchor at the baseline midpoint, diamond standing off on the
 * −normal side (the opposite side from the opening bubbles, so the two families of
 * tags never fight for the same strip of paper).
 *
 * P8 — opens `pryzm.autotag.anchor`.
 */
export function planWallTagAnchor(wall: TagWallLike, index = 0): TagAnchor | null {
    return withAutoTagSpan('anchor', (span): TagAnchor | null => {
        span.setAttribute('pryzm.autotag.projection', 'plan');
        const ax = wallAxis(wall);
        const bl = wall.baseLine;
        if (!ax || !bl) return null;
        const mid: Vec3Like = {
            x: (bl[0].x + bl[1].x) / 2,
            y: 0,
            z: (bl[0].z + bl[1].z) / 2,
        };
        const standoff = PLAN_WALL_LEADER_M + (index % 2) * LEADER_STAGGER_M;
        return {
            anchor: mid,
            tagPoint: {
                x: mid.x - ax.n.x * standoff,
                y: 0,
                z: mid.z - ax.n.z * standoff,
            },
        };
    });
}

// ── ELEVATION (H = hSign·world[hWorldAxis], V = world Y) ─────────────────────

/**
 * Invert the view's H projection back to a world point on the façade plane.
 * `worldH = h · hSign` (hSign is ±1, hence its own inverse); the depth coordinate is
 * pinned to the façade so the tag is coplanar with the wall it names. This mirrors
 * `elevationSegmentToAnnotation` exactly — one inversion rule, used twice.
 */
function fromViewHV(h: number, v: number, frame: ViewFrame, facadeDepth: number): Vec3Like {
    const worldH = h * frame.hSign;
    return frame.hWorldAxis === 'x'
        ? { x: worldH, y: v, z: facadeDepth }
        : { x: facadeDepth, y: v, z: worldH };
}

/** Project a world point onto the view's H axis. */
function toViewH(p: Vec3Like, frame: ViewFrame): number {
    return frame.hSign * (frame.hWorldAxis === 'x' ? p.x : p.z);
}

/**
 * ELEVATION — an opening's tag. The anchor is the opening's centre ON THE FAÇADE:
 * H = the opening's along-wall centre projected to the view's H axis, V = the
 * mid-height between its REAL sill and head (`levelElevation + sillHeight`,
 * `+ height`). The bubble sits above the head — in world Y, which is the elevation's
 * V axis. In plan that same tag would stand off in Z; the difference is the whole
 * point of the ticket.
 *
 * @param levelElevation absolute Y of the host wall's level (from the level record).
 * @param facadeDepth    the depth coordinate of the façade plane (view normal axis).
 *
 * P8 — opens `pryzm.autotag.anchor`.
 */
export function elevationOpeningTagAnchor(
    wall: TagWallLike,
    opening: TagOpeningLike,
    levelElevation: number,
    frame: ViewFrame,
    facadeDepth: number,
    index = 0,
): TagAnchor | null {
    return withAutoTagSpan('anchor', (span): TagAnchor | null => {
        span.setAttribute('pryzm.autotag.projection', 'elevation');
        const centre = openingCentreXZ(wall, opening);
        if (!centre) return null;
        const height = opening.height;
        if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null;
        const sillHeight = typeof opening.sillHeight === 'number' && Number.isFinite(opening.sillHeight)
            ? opening.sillHeight
            : 0;
        const sill = levelElevation + sillHeight;   // ABSOLUTE world-Y (L-127)
        const head = sill + height;                 // from the REAL opening height

        const h = toViewH(centre, frame);
        const standoff = ELEV_OPENING_LEADER_M + (index % 2) * LEADER_STAGGER_M;
        return {
            anchor: fromViewHV(h, (sill + head) / 2, frame, facadeDepth),
            tagPoint: fromViewHV(h, head + standoff, frame, facadeDepth),
        };
    });
}

/**
 * ELEVATION — a façade wall's tag. Anchored at the wall's mid-height on its
 * along-wall midpoint; the diamond sits a short standoff ABOVE that, still INSIDE
 * the drawn façade (so it can never be mistaken for a roof/ridge annotation and
 * never collides with the elevation dimension stacks, which are offset in H).
 *
 * P8 — opens `pryzm.autotag.anchor`.
 */
export function elevationWallTagAnchor(
    wall: TagWallLike,
    levelElevation: number,
    frame: ViewFrame,
    facadeDepth: number,
    index = 0,
): TagAnchor | null {
    return withAutoTagSpan('anchor', (span): TagAnchor | null => {
        span.setAttribute('pryzm.autotag.projection', 'elevation');
        const bl = wall.baseLine;
        const ax = wallAxis(wall);
        if (!ax || !bl) return null;
        const height = typeof wall.height === 'number' && Number.isFinite(wall.height) && wall.height > 0
            ? wall.height
            : undefined;
        if (height === undefined) return null;

        const mid: Vec3Like = { x: (bl[0].x + bl[1].x) / 2, y: 0, z: (bl[0].z + bl[1].z) / 2 };
        const h = toViewH(mid, frame);
        const midV = levelElevation + height / 2;
        const standoff = ELEV_WALL_LEADER_M + (index % 2) * LEADER_STAGGER_M;
        return {
            anchor: fromViewHV(h, midV, frame, facadeDepth),
            tagPoint: fromViewHV(h, Math.min(midV + standoff, levelElevation + height * 0.95), frame, facadeDepth),
        };
    });
}
