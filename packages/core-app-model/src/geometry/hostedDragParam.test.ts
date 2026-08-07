// §FEAT-PLAN-HOSTED-DRAG-HANDLES (founder, 2026-08-07) — host-parameter layer.
//
// These assert BEHAVIOUR, not pixels: that the plan-view drag affordance for a
// hosted door/window is expressed in the HOST's own parameter (offset along the
// centreline), that it respects the canonical LEFT-EDGE datum, that the occupancy
// oracle constrains it, and that it degrades correctly onto a CURVED host — the
// last of which is what makes agent-8's §FEAT-HOSTED-ON-CURVED-WALL work drop in
// without touching this feature.

import { describe, it, expect } from 'vitest';
import {
    projectCursorToHostOffset,
    resolveHostedSlide,
    computeHostedHandleLayout,
    hitTestHostedHandles,
    type HostedDragHost,
} from './hostedDragParam';

/** Straight host from (0,0) to (10,0) — 10 m along +X. */
function straightHost(openings: HostedDragHost['openings'] = []): HostedDragHost {
    return { id: 'wall-1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], openings };
}

/**
 * Curved host: same endpoints, control point pulled to +Z so the centreline bows
 * away from the chord. Arc length is therefore strictly greater than 10 m and the
 * tangent varies along it — both properties the assertions below rely on.
 */
function curvedHost(openings: HostedDragHost['openings'] = []): HostedDragHost {
    return {
        id: 'wall-curved',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
        curve: { control: { x: 5, z: 6 }, segments: 24 },
        openings,
    };
}

/** Identity-ish screen mapping: 50 px per metre, origin at (100, 100). */
const toScreen = (x: number, z: number) => ({ sx: 100 + x * 50, sy: 100 + z * 50 });

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — cursor → host parameter', () => {
    it('converts a cursor grab on the opening CENTRE into a LEFT-EDGE offset', () => {
        // Canonical datum (§OPENING-OFFSET-LEFTEDGE-UNIFY): `offset` is the LEFT
        // edge, but the cursor holds the centre — so grabbing at x=5 with a 1 m
        // opening must yield offset 4.5, not 5. The pre-fix plan controller
        // returned 5 here, which is the half-width drift the founder was fighting.
        expect(projectCursorToHostOffset(straightHost(), 5, 0, 1)).toBeCloseTo(4.5, 9);
    });

    it('projects an off-wall cursor onto the host, ignoring perpendicular distance', () => {
        // The drag has ONE degree of freedom: distance from the wall is discarded.
        expect(projectCursorToHostOffset(straightHost(), 5, 3.7, 1)).toBeCloseTo(4.5, 9);
    });

    it('measures ARC length, not chord, on a curved host', () => {
        // The curve's apex is the midpoint of the ARC, so its offset is half the
        // arc length — strictly more than half the 10 m chord. Measuring the chord
        // (the pre-fix behaviour) would report 4.5 and slide the opening off the
        // wall face.
        const apex = projectCursorToHostOffset(curvedHost(), 5, 3, 1);
        expect(apex).toBeGreaterThan(4.5);
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — the occupancy-clamped slide', () => {
    it('passes through a legal offset untouched and reports not-blocked', () => {
        const r = resolveHostedSlide(straightHost(), 3, 1, 'door-1');
        expect(r.offset).toBeCloseTo(3, 9);
        expect(r.blocked).toBe(false);
        expect(r.hostLength).toBeCloseTo(10, 9);
    });

    it('clamps a drag past the wall END to the last legal offset', () => {
        // offset + width must stay within the host: 10 − 1 = 9.
        const r = resolveHostedSlide(straightHost(), 47, 1, 'door-1');
        expect(r.offset).toBeCloseTo(9, 9);
        expect(r.blocked).toBe(true);
    });

    it('clamps a drag past the wall START to offset 0', () => {
        const r = resolveHostedSlide(straightHost(), -12, 1, 'door-1');
        expect(r.offset).toBeCloseTo(0, 9);
        expect(r.blocked).toBe(true);
    });

    it('stops FLUSH against a neighbouring opening instead of overlapping it', () => {
        // A window occupies [6, 7.2]. Dragging a 1 m door rightward from offset 2
        // toward 6.5 would overlap it; the slide must come to rest at 5.0 (right
        // edge exactly 6.0) and report blocked so the overlay turns red DURING the
        // drag rather than reverting on release.
        const host = straightHost([
            { id: 'op-win', elementId: 'window-9', offset: 6, width: 1.2 },
            { id: 'op-door', elementId: 'door-1', offset: 2, width: 1 },
        ]);
        const r = resolveHostedSlide(host, 6.5, 1, 'door-1', /* fromOffset */ 4.6);
        expect(r.blocked).toBe(true);
        expect(r.offset).toBeCloseTo(5, 9);
        expect(r.conflictIds).toContain('op-win');
        // Never returns an interval that overlaps the neighbour.
        expect(r.offset! + 1).toBeLessThanOrEqual(6 + 1e-9);
    });

    it('does NOT teleport the opening past a neighbour it is pushing against', () => {
        // Regression on the "nearest legal offset" rule: without the fromOffset
        // hint, the far gap [7.2, 10] becomes marginally nearer to a desired 6.5
        // than the near gap's 5.0, and the door jumps 2.2 m across the window
        // mid-gesture. Confined to its own gap, it holds the stop.
        const host = straightHost([
            { id: 'op-win', elementId: 'window-9', offset: 6, width: 1.2 },
        ]);
        for (const desired of [6.2, 6.5, 6.9, 7.0]) {
            const r = resolveHostedSlide(host, desired, 1, 'door-1', 4.9);
            expect(r.offset).toBeCloseTo(5, 9);
            expect(r.blocked).toBe(true);
        }
    });

    it('hands off cleanly once the requested span clears the neighbour entirely', () => {
        // Crossing needs no special case: at 7.2 the span [7.2, 8.2] no longer
        // overlaps, so canPlace accepts it outright and the door moves across.
        const host = straightHost([
            { id: 'op-win', elementId: 'window-9', offset: 6, width: 1.2 },
        ]);
        const r = resolveHostedSlide(host, 7.3, 1, 'door-1', 5);
        expect(r.blocked).toBe(false);
        expect(r.offset).toBeCloseTo(7.3, 9);
    });

    it('excludes the moving element by its ELEMENT id, not just the opening id', () => {
        // `canPlace` matches excludeId against Opening.id AND Opening.elementId.
        // The drag holds the DOOR id while the stored Opening.id is different — so
        // without elementId matching, a small nudge self-conflicts and the door
        // would refuse to move at all.
        const host = straightHost([{ id: 'op-door', elementId: 'door-1', offset: 2, width: 1 }]);
        const r = resolveHostedSlide(host, 2.1, 1, 'door-1');
        expect(r.blocked).toBe(false);
        expect(r.offset).toBeCloseTo(2.1, 9);
    });

    it('returns offset null when the opening cannot fit anywhere on the host', () => {
        const host = straightHost([{ id: 'op-a', offset: 0, width: 9.6 }]);
        const r = resolveHostedSlide(host, 5, 1, 'door-1');
        expect(r.offset).toBeNull();
        expect(r.blocked).toBe(true);
    });

    it('uses the ARC length as the host extent, so a curved host permits a larger offset', () => {
        // The curved host's arc exceeds its 10 m chord, so an offset that a chord
        // clamp would refuse is legal here.
        const straight = resolveHostedSlide(straightHost(), 20, 1, 'd');
        const curved = resolveHostedSlide(curvedHost(), 20, 1, 'd');
        expect(curved.hostLength).toBeGreaterThan(straight.hostLength);
        expect(curved.offset!).toBeGreaterThan(straight.offset!);
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — the two-arrow affordance layout', () => {
    it('places exactly two arrows, one off each edge, pointing OPPOSITE ways', () => {
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, toScreen)!;
        expect(layout.handles).toHaveLength(2);
        const [start, end] = layout.handles;
        expect(start.side).toBe('start');
        expect(end.side).toBe('end');
        // Straight host → antiparallel: dot product is −1.
        const dot = start.dirSx * end.dirSx + start.dirSy * end.dirSy;
        expect(dot).toBeCloseTo(-1, 6);
    });

    it('points the arrows ALONG the host, and brackets the opening', () => {
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, toScreen)!;
        const [start, end] = layout.handles;
        // Host runs +X → +sx. Start arrow points toward decreasing offset (−sx),
        // end arrow toward increasing (+sx).
        expect(start.dirSx).toBeCloseTo(-1, 6);
        expect(end.dirSx).toBeCloseTo(1, 6);
        // And the arrows sit OUTSIDE the opening's own screen span.
        expect(start.tipSx).toBeLessThan(layout.startSx);
        expect(end.tipSx).toBeGreaterThan(layout.endSx);
    });

    it('anchors the layout on the LEFT-EDGE datum (centre = offset + width/2)', () => {
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, toScreen)!;
        // offset 4, width 1 → edges at 4 and 5 m, centre at 4.5 m.
        expect(layout.startSx).toBeCloseTo(toScreen(4, 0).sx, 6);
        expect(layout.endSx).toBeCloseTo(toScreen(5, 0).sx, 6);
        expect(layout.centreSx).toBeCloseTo(toScreen(4.5, 0).sx, 6);
    });

    it('⭐ follows the TANGENT on a curved host — the arrows are NOT antiparallel', () => {
        // This is the assertion that guarantees the affordance survives agent-8's
        // curved hosting. On an arc the tangent genuinely differs at the opening's
        // two edges, so two arrows sampled at their OWN edges must diverge from
        // exact antiparallel. A fixed world-axis implementation would score −1
        // here and would visibly point off the wall.
        const layout = computeHostedHandleLayout(curvedHost(), 1, 2, toScreen)!;
        const [start, end] = layout.handles;
        const dot = start.dirSx * end.dirSx + start.dirSy * end.dirSy;
        expect(dot).toBeGreaterThan(-1);
        expect(dot).toBeLessThan(-0.9);   // still broadly opposed — it is one line
        // Each arrow is a unit screen vector.
        expect(Math.hypot(start.dirSx, start.dirSy)).toBeCloseTo(1, 6);
        expect(Math.hypot(end.dirSx, end.dirSy)).toBeCloseTo(1, 6);
    });

    it('respects a flipped/rotated screen mapping by MEASURING the projected tangent', () => {
        // Plan canvases may flip vertically (_sectionFlipV) or carry project north.
        // The direction must come out of worldToScreen, never from an assumed basis.
        const flipped = (x: number, z: number) => ({ sx: 100 - x * 50, sy: 100 + z * 50 });
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, flipped)!;
        const [start, end] = layout.handles;
        expect(start.dirSx).toBeCloseTo(1, 6);    // mirrored relative to the un-flipped case
        expect(end.dirSx).toBeCloseTo(-1, 6);
    });

    it('returns null for a degenerate host rather than emitting NaN arrows', () => {
        const degenerate: HostedDragHost = { baseLine: [{ x: 1, z: 1 }, { x: 1, z: 1 }] };
        expect(computeHostedHandleLayout(degenerate, 0, 1, toScreen)).toBeNull();
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — arrow hit-testing', () => {
    it('grabs an arrow anywhere along its length, not just at the tip', () => {
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, toScreen)!;
        const end = layout.handles[1];
        const midSx = (end.baseSx + end.tipSx) / 2;
        const midSy = (end.baseSy + end.tipSy) / 2;
        expect(hitTestHostedHandles(layout, midSx, midSy)?.side).toBe('end');
    });

    it('returns the nearer arrow and ignores clicks beyond the tolerance', () => {
        const layout = computeHostedHandleLayout(straightHost(), 4, 1, toScreen)!;
        expect(hitTestHostedHandles(layout, layout.handles[0].tipSx, layout.handles[0].tipSy)?.side)
            .toBe('start');
        // Far away in the perpendicular direction → no grab.
        expect(hitTestHostedHandles(layout, layout.centreSx, layout.centreSy + 400)).toBeNull();
    });

    it('is null-safe when there is no affordance to hit', () => {
        expect(hitTestHostedHandles(null, 0, 0)).toBeNull();
    });
});
