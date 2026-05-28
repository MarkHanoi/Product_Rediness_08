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
import { roomRule } from '../rules/programRules.js';

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

/** §HARD-MIN-SIDE-PER-ROOM (2026-05-28, updated): no D-TGL room may be created
 *  with a SHORT-SIDE smaller than its own architectural minimum
 *  (`minShortSideM` in programRules.ts — e.g. kitchen-galley 1.8 m, corridor
 *  1.0 m, bedroom 2.6 m). The previous uniform 2 m floor was too aggressive
 *  for narrow service rooms — it dropped the kitchen entirely when the
 *  squarified rect came in just under 2 m, and made a real-corridor strip
 *  (1.0–1.4 m × longer) impossible. Rooms below their own floor are dropped
 *  (their bubble-graph node remains but has no rect — downstream walls/doors
 *  skip cleanly via `sharedWallByPair.get(...)` returning undefined). */

const ABSOLUTE_MIN_SHORT_SIDE_M = 0.9;  // sanity floor: a room narrower than this is unusable.

function shortSideM(r: Rect): number {
    return Math.min(r.x1 - r.x0, r.z1 - r.z0);
}

/** squarify a room set into one rect → footprints (rounded). Iteratively
 *  drops the LOWEST-PRIORITY room (the LAST entry, since `allocationOrder`
 *  has public-first / private-last) until every placement clears its
 *  per-type minShortSideM (or the absolute floor). Empty `rooms[]` → []. */
function placeInRect(rect: Rect, rooms: readonly ProgramRoom[]): RoomPlacement[] {
    let pool = [...rooms];
    while (pool.length > 0) {
        const items = pool.map(r => ({ id: r.id, area: Math.max(EPS, r.targetAreaM2) }));
        const placements = squarify(rect, items)
            .map(p => ({ roomId: p.id, rect: roundRect(p.rect) }));
        const placementById = new Map(placements.map(p => [p.roomId, p]));
        const tooNarrowRoom = pool.find(r => {
            const p = placementById.get(r.id);
            if (!p) return false;
            const floor = Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(r.type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
            return shortSideM(p.rect) < floor - EPS;
        });
        if (!tooNarrowRoom) return placements;
        // Drop the last room (lowest priority in allocation order) and retry.
        const dropped = pool[pool.length - 1]!;
        const placement = placementById.get(tooNarrowRoom.id)!;
        const floor = Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(tooNarrowRoom.type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
        console.warn(
            `[D-TGL subdivide] §HARD-MIN-SIDE-PER-ROOM: room "${tooNarrowRoom.id}" (${tooNarrowRoom.type}) ` +
            `would produce short side ${shortSideM(placement.rect).toFixed(2)} m ` +
            `< ${floor.toFixed(2)} m per-type floor — dropping "${dropped.id}" (${dropped.type}) and re-squarifying.`,
        );
        pool = pool.slice(0, -1);
    }
    return [];
}

/**
 * Reorder rooms for rect allocation so the **two largest rooms** (Living + Master)
 * land at the front and get the best aspect from squarify, then other public rooms
 * before the private ones. Without hoisting Master the squarifier leaves it a thin
 * leftover strip when there are many small rooms — the user's "Master Bedroom is a
 * corridor-shape strip" defect. Within each privacy class the input order is
 * preserved (stable), so the P8 enumerate `rev` strategy still produces secondary
 * variety. Privacy is read from the rules database (SPEC-ARCHITECTURAL-PROGRAM-RULES).
 */
function allocationOrder(rooms: readonly ProgramRoom[]): ProgramRoom[] {
    const living = rooms.find(r => r.type === 'living');
    const master = rooms.find(r => r.type === 'master');
    const hoisted = [living, master].filter((r): r is ProgramRoom => r !== undefined);
    const hoistedSet = new Set(hoisted);
    const rest = rooms.filter(r => !hoistedSet.has(r));
    const rank = (r: ProgramRoom): number => {
        const p = roomRule(r.type).privacy;
        return p === 'public' ? 0 : p === 'circulation' ? 1 : p === 'private' ? 2 : 3;
    };
    // Stable sort by privacy rank.
    const tagged = rest.map((r, i) => ({ r, i }));
    tagged.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i);
    const sorted = tagged.map(t => t.r);
    return [...hoisted, ...sorted];
}

/**
 * Subdivide the shell `rects` among the program rooms. Returns exactly one
 * footprint per room; footprints lie inside the shell rects, do not overlap, and
 * together tile the shell. Degenerate input (no rects / no rooms) → [].
 */
export function subdivide(rects: readonly Rect[], graph: BubbleGraph): RoomPlacement[] {
    const rooms = allocationOrder(graph.rooms);
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
