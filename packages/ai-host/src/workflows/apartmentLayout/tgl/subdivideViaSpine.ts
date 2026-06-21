// §SPINE-FIRST P3 (ADR-0073 HAG, 2026-06-21) — the ADAPTER that composes P1 (deriveCorridorSpine) +
// P2 (packRoomsAlongSpine) from a BubbleGraph, producing the corridor + room rects with the
// circulation/façade invariants guaranteed. This is the spine-first replacement for the area-first
// carve family in `subdivide` — kept as a SEPARATE pure function so it can be measured against the
// §CIRCULATION-ROBUSTNESS-SWEEP and flag-wired without touching the legacy path (zero regression).
//
// PURE + deterministic. Metres, world XZ. P3 core = straight spine on the shell bbox (the double-
// loaded case); skewed-residual clipping + L/T legs land in a later slice.

import { deriveCorridorSpine } from './deriveCorridorSpine.js';
import { packRoomsAlongSpine, type SpineRoom, type SpinePackResult } from './packRoomsAlongSpine.js';
import { roomRule } from '../rules/programRules.js';
import type { BubbleGraph } from './bubbleGraph.js';
import type { Pt, Rect } from './rectDecomposition.js';

const bboxOf = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
};

export interface SubdivideViaSpineOptions {
    /** Stair keep-out rect (a leg is derived to reach it). */
    readonly stairKeepOut?: Rect;
    /** Corridor width (m). Default 1.2. */
    readonly corridorWidthM?: number;
}

/**
 * Spine-first subdivision from a bubble graph. Returns the corridor + per-room rects (keyed by the
 * graph room ids), with every room on the corridor and every window-room on the façade BY
 * CONSTRUCTION. Returns null when there is no corridor/room to pack or the shell is degenerate
 * (caller falls back to the legacy carve).
 */
export function subdivideViaSpine(
    shellPolygon: readonly Pt[],
    graph: BubbleGraph,
    opts: SubdivideViaSpineOptions = {},
): SpinePackResult | null {
    const corridorId = graph.corridorId;
    const spineRooms: SpineRoom[] = graph.rooms
        .filter(r => r.id !== corridorId)
        .map(r => ({
            id: r.id,
            targetAreaM2: r.targetAreaM2,
            needsWindow: r.needsWindow,
            minShortSideM: roomRule(r.type).minShortSideM,
        }));
    if (spineRooms.length === 0) return null;

    const spine = deriveCorridorSpine(shellPolygon, {
        stairKeepOut: opts.stairKeepOut,
        widthM: opts.corridorWidthM ?? 1.2,
    });
    if (!spine) return null;

    return packRoomsAlongSpine(bboxOf(shellPolygon), spine, spineRooms);
}
