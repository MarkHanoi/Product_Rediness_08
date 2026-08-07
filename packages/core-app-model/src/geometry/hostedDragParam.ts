// §FEAT-PLAN-HOSTED-DRAG-HANDLES (founder request, 2026-08-07) — the HOST-PARAMETER
// layer beneath the plan-view direct-manipulation affordance for hosted openings.
//
// ── Why this module exists ───────────────────────────────────────────────────
// The founder asked for "two arrows, as we have in 3D, so the user can DRAG a door
// or window easily in plan view" — starting with doors/windows precisely because
// they are HOSTED and therefore have exactly ONE degree of freedom.
//
// That framing is the architecture. A hosted opening's drag is NOT a constrained
// 2-D translation that happens to end up on a line; it is a 1-D **parameter edit**
// of `offset` — the distance along the host wall's CENTRELINE — with the host as
// the constraint. Everything in this file is expressed in that parameter:
//
//   • `resolveHostedSlide` maps a world cursor position → a legal `offset`.
//   • `computeHostedHandleLayout` maps an `offset` → where the arrows sit and
//     which way they point.
//
// Because both directions go through `@pryzm/geometry-wall`'s arc-length
// parameterisation (`arcLengthAtPointXZ` / `arcFrameAt`), the affordance is
// correct on a CURVED host the moment one exists — the arrows follow the local
// TANGENT at the opening's edges rather than a fixed world axis, and the slide
// runs along the arc rather than the chord. For a straight wall every function
// here reduces exactly to the legacy chord formula, so straight-wall behaviour is
// bit-identical. (§FEAT-HOSTED-ON-CURVED-WALL, C15 §2 / §5.)
//
// ── The offset datum: LEFT EDGE ──────────────────────────────────────────────
// ⚠ `offset` is the LEFT EDGE of the opening span, measured from `baseLine[0]`.
// This is the canonical datum asserted by `WallOccupancyStore.OpeningDims`
// ("LEFT-EDGE offset along the wall baseline"), by `canPlace(wall, offsetM, …)`
// whose interval is `[offsetM, offsetM + widthM]`, by `clampToWall`
// (`offset ∈ [0, wallLength − width]`), by `hostedElementFrame` ("stored LEFT-EDGE
// offset … whose centre sits at arc length offset + width/2"), and by the 3-D
// `HostedElementDragController` (§OPENING-OFFSET-LEFTEDGE-UNIFY). The cursor,
// however, grabs the opening's CENTRE — so every world→parameter conversion here
// subtracts `width / 2`, and every parameter→world conversion adds it back.
//
// ── Purity ───────────────────────────────────────────────────────────────────
// No DOM, no canvas, no THREE, no store writes. `computeHostedHandleLayout` takes
// the caller's `worldToScreen` as a function argument rather than reaching for a
// canvas, which is what lets the SAME layout serve both the renderer and the
// hit-test — they cannot drift apart, because there is only one of them.
//
// ⛔ This module OWNS no validity rules. `WallOccupancyStore` is the validity
// oracle and is called, never reimplemented (see `resolveHostedSlide`).

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import {
    wallCentreline,
    wallCentrelineLength,
    arcFrameAt,
    arcLengthAtPointXZ,
    wallOccupancyStore,
    type ArcHostWall,
    type WallCentreline,
} from '@pryzm/geometry-wall';

const TRACER = trace.getTracer('@pryzm/core-app-model/hosted-drag-param', '0.1.0');

function withSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.hosted-drag.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One opening already cut into the host, as the free-interval search needs it. */
export interface HostedOccupant {
    readonly id: string;
    /** The hosted element (door/window) id — distinct from the Opening id. */
    readonly elementId?: string;
    /** LEFT-EDGE offset along the centreline, metres. */
    readonly offset: number;
    readonly width: number;
}

/**
 * The host wall as this module needs it: an arc-parameterisable baseline plus the
 * openings already cut into it. Structurally typed so a test can pass a literal
 * and so the plan controller can pass its untyped `wallStore` record through.
 */
export interface HostedDragHost extends ArcHostWall {
    readonly id?: string;
    readonly openings?: ReadonlyArray<HostedOccupant> | null;
}

/** Outcome of mapping a cursor position to a legal host parameter. */
export interface HostedSlideResult {
    /**
     * The legal LEFT-EDGE offset the opening should take, metres.
     * `null` only when NO legal position exists anywhere on the host (the wall is
     * degenerate, or every free gap is narrower than the opening) — in which case
     * the caller must leave the opening where it was and commit nothing.
     */
    readonly offset: number | null;
    /**
     * True when the cursor asked for a position that was refused and the result
     * was pulled back to the nearest legal one. This is the signal the drag
     * overlay turns red on: the user learns the opening cannot go there WHILE
     * dragging, instead of watching it silently snap back on release.
     */
    readonly blocked: boolean;
    /** Why it was blocked — straight from `WallOccupancyStore`, or the bounds rule. */
    readonly reason?: string;
    /** Opening ids that refused the requested position. */
    readonly conflictIds: readonly string[];
    /** The host's centreline (arc) length, metres — the true extent of the 1 DOF. */
    readonly hostLength: number;
}

/** One arrow handle, laid out in SCREEN space. */
export interface HostedHandle {
    /** Which end of the opening this arrow sits off, along increasing `offset`. */
    readonly side: 'start' | 'end';
    /** Where the arrow's base sits (nearest the opening), screen px. */
    readonly baseSx: number;
    readonly baseSy: number;
    /** Where the arrow's tip sits (furthest from the opening), screen px. */
    readonly tipSx: number;
    readonly tipSy: number;
    /** Unit screen-space direction base→tip — the local host TANGENT, projected. */
    readonly dirSx: number;
    readonly dirSy: number;
}

/** The full plan-view affordance geometry for one selected hosted opening. */
export interface HostedHandleLayout {
    /** The opening's centre on screen — the anchor of the drag symbol. */
    readonly centreSx: number;
    readonly centreSy: number;
    /** The opening's two edges on screen (the extent the arrows bracket). */
    readonly startSx: number;
    readonly startSy: number;
    readonly endSx: number;
    readonly endSy: number;
    /** Exactly two arrows: one toward decreasing `offset`, one toward increasing. */
    readonly handles: readonly [HostedHandle, HostedHandle];
}

export interface HostedHandleLayoutOptions {
    /** Clear space between the opening edge and the arrow base, screen px. */
    readonly gapPx?: number;
    /** Arrow length, screen px. */
    readonly lengthPx?: number;
}

/**
 * Handle sizes are in SCREEN PIXELS, deliberately — the arrows are a UI
 * affordance, not model geometry. A world-sized arrow would vanish when the user
 * zooms out to see a whole floor and swallow the room when they zoom in to a
 * jamb; a pixel-sized one stays equally grabbable at every plan scale, which is
 * the only property that makes the gesture reliable. Same reasoning as the
 * existing `ENDPOINT_GRAB_PX` wall-endpoint zone in PlanElementDragController.
 */
const DEFAULT_GAP_PX = 6;
const DEFAULT_LENGTH_PX = 15;

/**
 * Grab tolerance around an arrow, screen px. Larger than the drawn arrow so the
 * handle is forgiving at speed, and larger than the 8–10 px body hit-test
 * threshold so an arrow reliably wins the arbitration against the wall linework
 * underneath it.
 */
export const HOSTED_HANDLE_HIT_PX = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Parameter mapping — world cursor → legal host offset
// ─────────────────────────────────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/**
 * Project a world XZ cursor position onto the host centreline and return the
 * LEFT-EDGE offset the opening's CENTRE would need in order to sit there.
 *
 * Arc-aware: on a curved host this is the arc length of the closest centreline
 * point, so the opening tracks the cursor along the curve instead of sliding off
 * the chord. Pure; performs no clamping and no validity check — compose it with
 * `resolveHostedSlide` for that.
 *
 * P8: `pryzm.hosted-drag.project` span.
 */
export function projectCursorToHostOffset(
    host: HostedDragHost,
    worldX: number,
    worldZ: number,
    width: number,
    cl?: WallCentreline,
): number {
    return withSpan('project', { 'pryzm.hosted.width': width }, () => {
        if (!isNum(worldX) || !isNum(worldZ)) return 0;
        const centreS = arcLengthAtPointXZ(host, worldX, worldZ, cl).s;
        return centreS - (isNum(width) ? width : 0) / 2;
    });
}

/**
 * Build the ascending list of FREE intervals along the host centreline — the gaps
 * between the openings already cut into it, excluding the one being moved.
 *
 * Pure read of `host.openings`. `excludeId` is matched against BOTH `id` and
 * `elementId`, exactly as `WallOccupancyStore.canPlace` documents, because the
 * caller holds the door/window element id while the stored `Opening.id` is
 * distinct — without matching both, an opening would collide with its own slot.
 */
function freeIntervals(
    host: HostedDragHost,
    hostLength: number,
    excludeId?: string,
): Array<{ lo: number; hi: number }> {
    const occupied = (host.openings ?? [])
        .filter(o =>
            o && isNum(o.offset) && isNum(o.width) && o.width > 0 &&
            !(excludeId && (o.id === excludeId || o.elementId === excludeId)))
        .map(o => ({ lo: Math.max(0, o.offset), hi: Math.min(hostLength, o.offset + o.width) }))
        .filter(s => s.hi > s.lo)
        .sort((a, b) => a.lo - b.lo);

    const free: Array<{ lo: number; hi: number }> = [];
    let cursor = 0;
    for (const span of occupied) {
        if (span.lo > cursor) free.push({ lo: cursor, hi: span.lo });
        cursor = Math.max(cursor, span.hi);
    }
    if (cursor < hostLength) free.push({ lo: cursor, hi: hostLength });
    return free;
}

/**
 * Map a DESIRED left-edge offset to the nearest LEGAL one on the host.
 *
 * This is the whole constraint model of the gesture, and it is deliberately a
 * CLAMP rather than a rejection:
 *
 *   • Past a wall end        → clamped to `[0, hostLength − width]`.
 *   • Into a neighbouring    → clamped to rest flush against the neighbour's
 *     opening                  facing edge, like a physical stop. The opening
 *                              stops moving and the overlay goes red; it never
 *                              enters the illegal interval at all.
 *   • Nowhere legal at all   → `offset: null`; the caller commits nothing.
 *
 * Clamping (rather than letting the opening follow the cursor into an illegal
 * position and reverting on drop) is what makes the constraint VISIBLE DURING the
 * drag, which is the behaviour the founder's logs show was missing: today a plan
 * drag writes the illegal offset into the store live, then `canExecute` rejects
 * the commit — leaving the store holding a position with no undo entry behind it.
 * With this clamp the previewed offset is legal by construction, so the commit
 * can never be refused.
 *
 * ⛔ `WallOccupancyStore.canPlace` remains the SOLE oracle of validity — it is
 * called, not reimplemented. The free-interval search answers a DIFFERENT
 * question (*where is the nearest legal spot*) for which no API exists yet; see
 * the `nearestFreeOffset` request in this feature's report.
 *
 * P8: `pryzm.hosted-drag.resolve` span.
 */
export function resolveHostedSlide(
    host: HostedDragHost,
    desiredOffset: number,
    width: number,
    excludeId?: string,
    /**
     * The opening's CURRENT offset, when a drag is in progress.
     *
     * Supplying it makes the obstruction behave like a physical STOP rather than
     * a magnet. Without it, "nearest legal offset" is measured from the desired
     * position alone — so dragging a door rightward into a window makes the door
     * TELEPORT to the window's far side the instant the far gap becomes marginally
     * nearer (a 2.2 m jump, mid-gesture, for a 1.2 m window). With it, the search
     * is confined to the free gap the opening is currently IN, so the opening
     * slides up to the neighbour and stops dead against it.
     *
     * Crossing the neighbour is still possible and needs no special case: once the
     * cursor has moved far enough that the requested span fits ENTIRELY in the far
     * gap, `canPlace` accepts it outright at step 2 and the opening moves there.
     * So the user gets a firm stop while pushing against an obstruction, and a
     * clean hand-off once they have clearly moved past it.
     */
    fromOffset?: number,
): HostedSlideResult {
    return withSpan('resolve', { 'pryzm.hosted.exclude': excludeId ?? '' }, (): HostedSlideResult => {
        const hostLength = wallCentrelineLength(host);

        if (!(hostLength > 0) || !isNum(width) || width <= 0) {
            return {
                offset: null, blocked: true, conflictIds: [], hostLength: hostLength || 0,
                reason: 'Host wall has no usable length',
            };
        }
        if (width > hostLength) {
            return {
                offset: null, blocked: true, conflictIds: [], hostLength,
                reason: `Opening (${width.toFixed(3)} m) is wider than its host (${hostLength.toFixed(3)} m)`,
            };
        }

        // ── 1. Bounds clamp — the wall's own ends. ────────────────────────────
        const wanted = isNum(desiredOffset) ? desiredOffset : 0;
        const bounded = clamp(wanted, 0, hostLength - width);
        const hitEnd = Math.abs(bounded - wanted) > 1e-9;

        // ── 2. Ask the oracle. ───────────────────────────────────────────────
        const ok = wallOccupancyStore.canPlace(
            host as never, bounded, width, excludeId,
        );
        if (ok.valid) {
            return {
                offset: bounded,
                blocked: hitEnd,
                conflictIds: [],
                hostLength,
                ...(hitEnd ? { reason: 'Wall end' } : {}),
            };
        }

        // ── 3. Refused — stop against the obstruction. ───────────────────────
        const gaps = freeIntervals(host, hostLength, excludeId)
            .filter(g => g.hi - g.lo >= width);                // must fit the opening

        // Prefer the gap the opening is currently sitting in: that turns the
        // neighbour into a stop the opening rests against, instead of a magnet
        // that flings it to the far side (see `fromOffset`).
        let searchSpace = gaps;
        if (isNum(fromOffset)) {
            const home = gaps.filter(g => fromOffset >= g.lo - 1e-9 && fromOffset + width <= g.hi + 1e-9);
            if (home.length > 0) searchSpace = home;
        }

        let best: number | null = null;
        let bestDist = Infinity;
        for (const gap of searchSpace) {
            const candidate = clamp(bounded, gap.lo, gap.hi - width);
            const d = Math.abs(candidate - bounded);
            if (d < bestDist) { bestDist = d; best = candidate; }
        }

        return {
            offset: best,
            blocked: true,
            conflictIds: ok.conflictIds ?? [],
            hostLength,
            ...(ok.reason ? { reason: ok.reason } : {}),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Affordance layout — host offset → two screen-space arrows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lay out the two drag arrows for a hosted opening, in SCREEN space.
 *
 * The arrows bracket the opening's two edges and point ALONG the host, outward:
 * the `start` arrow toward decreasing `offset`, the `end` arrow toward
 * increasing. This is the plan reading of the same idiom the 3-D gizmo uses (an
 * axis rail through the element with a cone at each end), so the two views teach
 * one gesture rather than two.
 *
 * ── Why the direction is measured, not computed ──────────────────────────────
 * The arrow direction is derived by projecting two nearby CENTRELINE points
 * through the caller's `worldToScreen` and normalising the screen delta — not by
 * rotating the world tangent by an assumed screen basis. That matters twice
 * over: the plan canvas may flip its vertical axis (`_sectionFlipV`) or carry a
 * project-north rotation, and on a CURVED host the tangent genuinely differs at
 * the two edges, so each arrow must be sampled at its OWN edge. Straight host →
 * the two arrows come out exactly antiparallel, as they must.
 *
 * Returns `null` for a degenerate host, so callers render nothing rather than
 * drawing a NaN arrow.
 *
 * P8: `pryzm.hosted-drag.layout` span.
 */
export function computeHostedHandleLayout(
    host: HostedDragHost,
    offset: number,
    width: number,
    worldToScreen: (worldX: number, worldZ: number) => { sx: number; sy: number },
    opts: HostedHandleLayoutOptions = {},
): HostedHandleLayout | null {
    return withSpan('layout', { 'pryzm.hosted.offset': isNum(offset) ? offset : -1 }, () => {
        const cl = wallCentreline(host);
        const hostLength = cl.length;
        if (!(hostLength > 0) || !isNum(offset) || !isNum(width) || width <= 0) return null;

        const gapPx = opts.gapPx ?? DEFAULT_GAP_PX;
        const lengthPx = opts.lengthPx ?? DEFAULT_LENGTH_PX;

        const sStart = clamp(offset, 0, hostLength);
        const sEnd = clamp(offset + width, 0, hostLength);
        const sMid = (sStart + sEnd) / 2;

        const fStart = arcFrameAt(host, sStart, cl);
        const fEnd = arcFrameAt(host, sEnd, cl);
        const fMid = arcFrameAt(host, sMid, cl);

        const pStart = worldToScreen(fStart.x, fStart.z);
        const pEnd = worldToScreen(fEnd.x, fEnd.z);
        const pMid = worldToScreen(fMid.x, fMid.z);
        if (!isNum(pStart.sx) || !isNum(pEnd.sx) || !isNum(pMid.sx)) return null;

        // Probe step along the arc for the screen-space tangent. Small enough to
        // be local on a tight curve, large enough to survive float noise.
        const step = Math.min(0.05, hostLength / 100) || 1e-3;

        /**
         * Unit screen direction at arc length `s`, pointing OUTWARD from the
         * opening (`sign` = -1 at the start edge, +1 at the end edge).
         */
        const screenDirAt = (s: number, sign: -1 | 1): { dx: number; dy: number } => {
            const near = arcFrameAt(host, clamp(s, 0, hostLength), cl);
            const far = arcFrameAt(host, clamp(s + sign * step, 0, hostLength), cl);
            const a = worldToScreen(near.x, near.z);
            const b = worldToScreen(far.x, far.z);
            let dx = b.sx - a.sx;
            let dy = b.sy - a.sy;
            const len = Math.hypot(dx, dy);
            if (!(len > 1e-9)) {
                // Degenerate probe (fully zoomed out, or s pinned at a wall end
                // so `near` and `far` coincide). Fall back to the opening's own
                // screen axis, which is always well defined for a real opening.
                dx = (pEnd.sx - pStart.sx) * sign;
                dy = (pEnd.sy - pStart.sy) * sign;
                const l2 = Math.hypot(dx, dy);
                if (!(l2 > 1e-9)) return { dx: sign, dy: 0 };
                return { dx: dx / l2, dy: dy / l2 };
            }
            return { dx: dx / len, dy: dy / len };
        };

        const build = (
            side: 'start' | 'end',
            anchor: { sx: number; sy: number },
            s: number,
            sign: -1 | 1,
        ): HostedHandle => {
            const d = screenDirAt(s, sign);
            return {
                side,
                baseSx: anchor.sx + d.dx * gapPx,
                baseSy: anchor.sy + d.dy * gapPx,
                tipSx: anchor.sx + d.dx * (gapPx + lengthPx),
                tipSy: anchor.sy + d.dy * (gapPx + lengthPx),
                dirSx: d.dx,
                dirSy: d.dy,
            };
        };

        return {
            centreSx: pMid.sx,
            centreSy: pMid.sy,
            startSx: pStart.sx,
            startSy: pStart.sy,
            endSx: pEnd.sx,
            endSy: pEnd.sy,
            handles: [
                build('start', pStart, sStart, -1),
                build('end', pEnd, sEnd, +1),
            ],
        };
    });
}

/** Squared distance from a point to a segment, screen px. */
function distToSegment(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number,
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
    let u = ((px - x1) * dx + (py - y1) * dy) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u));
}

/**
 * Hit-test a laid-out affordance. Returns the grabbed handle, or `null`.
 *
 * Tests the whole arrow (base→tip segment) rather than just its tip, so the user
 * can grab anywhere on the glyph they can see. Shares `computeHostedHandleLayout`
 * with the renderer by construction — the drawn arrow and the grabbable arrow are
 * the same object, so they cannot drift.
 *
 * P8: `pryzm.hosted-drag.hit` span.
 */
export function hitTestHostedHandles(
    layout: HostedHandleLayout | null,
    sx: number,
    sy: number,
    tolerancePx: number = HOSTED_HANDLE_HIT_PX,
): HostedHandle | null {
    return withSpan('hit', {}, () => {
        if (!layout) return null;
        let best: HostedHandle | null = null;
        let bestD = tolerancePx;
        for (const h of layout.handles) {
            const d = distToSegment(sx, sy, h.baseSx, h.baseSy, h.tipSx, h.tipSy);
            if (d <= bestD) { bestD = d; best = h; }
        }
        return best;
    });
}
