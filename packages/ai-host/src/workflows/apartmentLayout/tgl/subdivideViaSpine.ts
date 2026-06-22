// §SPINE-FIRST P3 (ADR-0073 HAG, 2026-06-21) — the ADAPTER that composes P1 (deriveCorridorSpine) +
// P2 (packRoomsAlongSpine) from a BubbleGraph, producing the corridor + room rects with the
// circulation/façade invariants guaranteed. This is the spine-first replacement for the area-first
// carve family in `subdivide` — kept as a SEPARATE pure function so it can be measured against the
// §CIRCULATION-ROBUSTNESS-SWEEP and flag-wired without touching the legacy path (zero regression).
//
// PURE + deterministic. Metres, world XZ. P3 core = straight spine on the shell bbox (the double-
// loaded case); skewed-residual clipping + L/T legs land in a later slice.

import { deriveCorridorSpine } from './deriveCorridorSpine.js';
import { packRoomsAlongSpine, packRoomsAlongSpineTree, type SpineRoom, type SpinePackResult } from './packRoomsAlongSpine.js';
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
    /** §18 slice 4 — use the multi-leg, polygon-native tree pack (`packRoomsAlongSpineTree`) instead of
     *  the straight-run pack: rooms comb off ALL spine segments (run + legs), cells clip to the REAL
     *  shell (so sheared GIS quads are fine), and on a MIXED floor PUBLIC/PRIVATE zone to opposite sides
     *  of the run. Default false ⇒ the proven straight-run pack (byte-identical). */
    readonly spineTree?: boolean;
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
    const nonCorridor = graph.rooms.filter(r => r.id !== corridorId);
    const toSpineRoom = (r: typeof nonCorridor[number]): SpineRoom => ({
        id: r.id,
        targetAreaM2: r.targetAreaM2,
        needsWindow: r.needsWindow,
        minShortSideM: roomRule(r.type).minShortSideM,
    });
    const spineRooms: SpineRoom[] = nonCorridor.map(toSpineRoom);
    if (spineRooms.length === 0) return null;

    const spine = deriveCorridorSpine(shellPolygon, {
        ...(opts.stairKeepOut ? { stairKeepOut: opts.stairKeepOut } : {}),
        widthM: opts.corridorWidthM ?? 1.2,
    });
    if (!spine) return null;

    // §18 slice 4 — the multi-leg, polygon-native tree pack: rooms comb off ALL spine segments, cells
    // clip to the REAL shell, and PUBLIC (+ hall/circulation) zone to one side of the run, PRIVATE to
    // the other (the corridor between social + sleeping). An all-private (upper) floor has no public
    // rooms ⇒ cohorts undefined ⇒ area-balanced both sides.
    if (opts.spineTree) {
        const publicSide = nonCorridor.filter(r => roomRule(r.type).privacy !== 'private');
        const privateSide = nonCorridor.filter(r => roomRule(r.type).privacy === 'private');
        const cohorts: readonly [readonly SpineRoom[], readonly SpineRoom[]] | undefined =
            publicSide.length > 0 && privateSide.length > 0
                ? [publicSide.map(toSpineRoom), privateSide.map(toSpineRoom)]
                : undefined;
        return packRoomsAlongSpineTree(bboxOf(shellPolygon), spine, spineRooms, {
            shellPolygon,
            ...(opts.stairKeepOut ? { keepOut: opts.stairKeepOut } : {}),
            ...(cohorts ? { cohorts } : {}),
        });
    }

    return packRoomsAlongSpine(bboxOf(shellPolygon), spine, spineRooms);
}
