// TGL P3b — subdivision: rooms → footprints.
//
// Packs the bubble-graph rooms into the shell's decomposition rects (P1) and
// squarifies (P3a) each rect's share, so every room gets exactly one axis-aligned
// footprint that lies inside the real shell — never a thin full-depth strip and
// never floating through an L-shape notch.
//
// Allocation is deterministic and public-first: rects are taken largest-first and
// rooms are streamed in bubble-graph order (hall/living/kitchen → corridor →
// private), so public space lands in the biggest rect near the entrance and the
// private zone flows into the smaller rects. squarify scales each rect's room set
// to fill that rect EXACTLY, so the footprints tile the shell (total area ≈ shell
// area) with no gaps or overlaps. Pure: imports only sibling TGL types.
//
// Coordinates: metres, plan frame { x, z }. Rounded to 1e-6 at the boundary (§6).

import type { BubbleGraph, ProgramRoom } from './bubbleGraph.js';
import { rectArea, type Rect } from './rectDecomposition.js';
import { squarify } from './squarify.js';

/** A room's realised footprint inside the shell. */
export interface RoomPlacement {
    readonly roomId: string;
    readonly rect: Rect;
}

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const roundRect = (r: Rect): Rect => ({ x0: round6(r.x0), z0: round6(r.z0), x1: round6(r.x1), z1: round6(r.z1) });

/** Largest-first, with a stable tie-break by position (no Map/Set order — §6). */
function byAreaDesc(a: Rect, b: Rect): number {
    return rectArea(b) - rectArea(a) || a.x0 - b.x0 || a.z0 - b.z0;
}

/** squarify a room set into one rect → footprints (rounded). */
function placeInRect(rect: Rect, rooms: readonly ProgramRoom[]): RoomPlacement[] {
    const items = rooms.map(r => ({ id: r.id, area: Math.max(EPS, r.targetAreaM2) }));
    return squarify(rect, items).map(p => ({ roomId: p.id, rect: roundRect(p.rect) }));
}

/**
 * Subdivide the shell `rects` among the program rooms. Returns exactly one
 * footprint per room; footprints lie inside the shell rects, do not overlap, and
 * together tile the shell. Degenerate input (no rects / no rooms) → [].
 */
export function subdivide(rects: readonly Rect[], graph: BubbleGraph): RoomPlacement[] {
    const rooms = graph.rooms;
    const valid = rects.filter(r => rectArea(r) > EPS).sort(byAreaDesc);
    if (valid.length === 0 || rooms.length === 0) return [];

    // Common case — a rectangular (single-rect) shell: one squarified treemap.
    // Degenerate case — more rects than rooms: pack everything into the largest
    // rect (can't fill N rects with <N one-footprint rooms without splitting a
    // room). Real programs always have rooms ≥ rects, so this is a safety net.
    if (valid.length === 1 || rooms.length < valid.length) {
        return placeInRect(valid[0]!, rooms);
    }

    // Multi-rect shell (L / T / U): allocate rooms to rects ∝ area, public-first,
    // reserving ≥1 room for every later rect so each rect is actually filled.
    const shellArea = valid.reduce((s, r) => s + rectArea(r), 0);
    const out: RoomPlacement[] = [];
    let cursor = 0;
    for (let k = 0; k < valid.length; k++) {
        const rect = valid[k]!;
        const roomsLeft = rooms.length - cursor;
        const laterRects = valid.length - k - 1;
        let take: number;
        if (k === valid.length - 1) {
            take = roomsLeft;                                   // last rect absorbs the rest
        } else {
            const ideal = Math.round((rooms.length * rectArea(rect)) / shellArea);
            const maxForThis = roomsLeft - laterRects;          // keep ≥1 for each later rect
            take = Math.max(1, Math.min(Math.max(1, ideal), maxForThis));
        }
        out.push(...placeInRect(rect, rooms.slice(cursor, cursor + take)));
        cursor += take;
    }
    return out;
}
