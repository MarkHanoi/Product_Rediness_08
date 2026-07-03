// §FEAT-HOSTED-MOVE-DIMENSIONS (founder L-30, 2026-07-03) — pure move-time set-out
// geometry for a HOSTED opening (door / window) dragged ALONG its host wall.
//
// L-29 (`§FEAT-WALL-MOVE-DIMENSIONS`) gave a whole-wall move its live PERPENDICULAR
// gaps to parallel neighbours. The founder's explicit follow-up (L-29 message) was
// the SAME affordance for hosted elements, but ALONG the host wall's vector — a
// door/window slides only along its host wall, so the meaningful feedback is the
// 1D gap it is closing / opening on each side.
//
// Unlike L-29's world-XZ perpendicular maths, a hosted opening lives in the wall's
// own 1D parameter space: a scalar `offset` in metres from the wall's start
// endpoint (baseLine[0]) measured along the baseline. So this helper works purely
// in that 1D space — offsets and widths in metres — and returns the along-wall gap
// on each side of the moving opening to the NEAREST reference: either the wall end
// or the nearest edge of an adjacent opening on the SAME wall, whichever is closer.
//
// The render layer (`PlanElementDragController._renderDoorWindowOverlay`) maps each
// returned 1D offset onto the wall's on-screen line (t = offset / wallLength, lerp
// between the two projected endpoints) and draws it with the SAME blue dashed
// `_drawDimensionLine` renderer L-29 and the existing hosted-drag dims already use.
//
// PURE: no DOM, no THREE, no canvas, no store. Plain 1D maths, fully unit-testable.

/** Another opening on the SAME host wall — the along-wall gap maths only needs its span. */
export interface HostedNeighbourOpening {
    /** Centre offset from the wall start (baseLine[0]) along the baseline, metres. */
    readonly offset: number;
    /** Opening width, metres. */
    readonly width: number;
}

export interface HostedMoveDimensionInput {
    /** The moving opening's live centre offset from the wall start, metres. */
    readonly offset: number;
    /** The moving opening's width, metres. */
    readonly width: number;
    /** Host wall baseline length, metres. */
    readonly wallLength: number;
    /** OTHER openings on the same wall (exclude the moving one). */
    readonly neighbours: readonly HostedNeighbourOpening[];
}

/**
 * One along-wall set-out dimension: a 1D gap from an EDGE of the moving opening to
 * the nearest reference on that side. Offsets are metres from the wall start along
 * the baseline; the render layer projects them onto the wall's on-screen line.
 * Shape intentionally mirrors L-29's `WallMoveDimension` (render-agnostic 1D
 * endpoints + `distanceMm` + `side`) so the same dimension renderer serves both.
 */
export interface HostedMoveDimension {
    /** Offset along the wall of the moving opening's edge (the gap's near end), metres. */
    readonly fromOffset: number;
    /** Offset along the wall of the reference (the gap's far end), metres. */
    readonly toOffset: number;
    /** Gap distance in millimetres (rounded), for the label. */
    readonly distanceMm: number;
    /**
     * Which side of the moving opening the gap sits on, along the wall:
     *   • `'start'` — toward the wall start (decreasing offset).
     *   • `'end'`   — toward the wall end (increasing offset).
     */
    readonly side: 'start' | 'end';
    /** What the far end of the gap is measured to. */
    readonly reference: 'wall-end' | 'opening';
}

export interface HostedMoveDimensionOptions {
    /** Gaps smaller than this (metres) are dropped as noise. Default 0.02 m (20 mm). */
    readonly minGapM?: number;
}

const DEFAULT_MIN_GAP_M = 0.02;

const isFiniteNum = (v: number | undefined | null): v is number =>
    typeof v === 'number' && Number.isFinite(v);

/**
 * Compute the live along-wall set-out dimension(s) for a HOSTED opening being
 * dragged along its host wall. Returns 0, 1, or 2 dimensions — the gap on the
 * `start` side and on the `end` side — each measured from the moving opening's
 * near edge to the NEAREST reference on that side:
 *   • the wall end (0 on the start side, `wallLength` on the end side), OR
 *   • the facing edge of the nearest adjacent opening on the same wall,
 * whichever is closer.
 *
 * Edge cases:
 *   • Opening hard against a wall end → that side's gap is below `minGapM` and is
 *     dropped, yielding a one-sided result.
 *   • Multiple neighbours → the nearest facing edge on each side wins.
 *   • No neighbours → reduces to the wall-start / wall-end gaps.
 *   • Neighbours that overlap the moving opening's span (degenerate / mid-move
 *     transient) are ignored — an overlap has no meaningful positive gap.
 */
export function computeHostedMoveDimensions(
    input: HostedMoveDimensionInput,
    opts: HostedMoveDimensionOptions = {},
): HostedMoveDimension[] {
    const { offset, width, wallLength, neighbours } = input;
    if (!isFiniteNum(offset) || !isFiniteNum(width) || !isFiniteNum(wallLength)) return [];
    if (wallLength <= 0) return [];

    const minGap = opts.minGapM ?? DEFAULT_MIN_GAP_M;
    const halfW = Math.max(0, width / 2);

    // The moving opening's span, clamped into the wall so a mid-drag over-run
    // (before the caller's own clamp) can't produce a negative/oversized gap.
    const leftEdge = Math.max(0, Math.min(wallLength, offset - halfW));
    const rightEdge = Math.max(0, Math.min(wallLength, offset + halfW));

    // Start side: nearest reference to the LEFT of `leftEdge`. Baseline = wall start (0);
    // upgraded to the nearest neighbour RIGHT-edge that sits at or before `leftEdge`.
    let startRef = 0;
    let startReference: 'wall-end' | 'opening' = 'wall-end';
    // End side: nearest reference to the RIGHT of `rightEdge`. Baseline = wall end;
    // upgraded to the nearest neighbour LEFT-edge that sits at or after `rightEdge`.
    let endRef = wallLength;
    let endReference: 'wall-end' | 'opening' = 'wall-end';

    for (const n of neighbours) {
        if (!isFiniteNum(n?.offset) || !isFiniteNum(n?.width)) continue;
        const nHalf = Math.max(0, n.width / 2);
        const nLeft = n.offset - nHalf;
        const nRight = n.offset + nHalf;
        // Ignore a neighbour that overlaps the moving opening's span — no clean gap.
        if (nRight > leftEdge && nLeft < rightEdge) continue;
        if (nRight <= leftEdge && nRight > startRef) {
            startRef = nRight;
            startReference = 'opening';
        }
        if (nLeft >= rightEdge && nLeft < endRef) {
            endRef = nLeft;
            endReference = 'opening';
        }
    }

    const out: HostedMoveDimension[] = [];

    const startGap = leftEdge - startRef;
    if (startGap >= minGap) {
        out.push({
            fromOffset: leftEdge,
            toOffset: startRef,
            distanceMm: Math.round(startGap * 1000),
            side: 'start',
            reference: startReference,
        });
    }

    const endGap = endRef - rightEdge;
    if (endGap >= minGap) {
        out.push({
            fromOffset: rightEdge,
            toOffset: endRef,
            distanceMm: Math.round(endGap * 1000),
            side: 'end',
            reference: endReference,
        });
    }

    return out;
}
