// §RESI-ENTRY-INTO-CORRIDOR (founder 2026-06-26: "I enter the apartment into a BEDROOM") — the
// apartment FRONT DOOR (from the public corridor) must open into the apartment's INTERNAL
// CIRCULATION (corridor / entry-hall), not a habitable room. The executor used to centre the
// front door on the corridor-facing cell edge regardless of which ROOM happened to sit behind
// that point — so it often opened into a bedroom/living.
//
// This pure helper resolves the along-edge offset that lands the door where the INTERNAL
// corridor (or hall) meets the corridor-facing cell edge: it finds the circulation room whose
// footprint touches that edge and returns the door offset centred within that room's edge-span.
// When NO circulation room reaches the edge, it returns undefined so the caller falls back to
// the centred offset (and the engine-side entry-leg / L-T routing is what makes a corridor reach
// the edge in the first place). Pure + deterministic (no THREE/DOM/RNG).

import type { Rect } from '../apartmentLayout/tgl/rectDecomposition.js';

/** The minimal room shape this resolver needs (a subset of the engine's LayoutRoom). */
export interface EntryRoomLite {
    /** Room type — 'corridor' / 'hall' are the circulation rooms the door should open into. */
    readonly type?: string;
    readonly occupancy?: string;
    /** Footprint polygon in PLAN-MM ({x,y}; plan-y = world-z). Optional (older results omit it). */
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

/** Which cell edge faces the public corridor (carries the front door). */
export type DoorEdge = 'x0' | 'x1' | 'z0' | 'z1';

const MM_TO_M = 1e-3;
/** A room touches the door edge when its polygon comes within this of the edge line (m). */
const EDGE_TOUCH_M = 0.25;
/** Circulation room types the front door may open into. */
const CIRCULATION_TYPES = new Set(['corridor', 'hall', 'entry', 'entry-hall', 'landing']);
const CIRCULATION_OCC = new Set(['corridor', 'entrance-lobby', 'hall', 'entry-hall']);

const isCirculation = (r: EntryRoomLite): boolean =>
    (r.type !== undefined && CIRCULATION_TYPES.has(r.type)) ||
    (r.occupancy !== undefined && CIRCULATION_OCC.has(r.occupancy));

/** The room polygon's extent in metres, in the cell's plan frame. */
interface RoomExtent { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }

function extentOf(poly: ReadonlyArray<{ x: number; y: number }>): RoomExtent | null {
    if (!poly || poly.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
        const x = p.x * MM_TO_M, z = p.y * MM_TO_M;   // plan-y = world-z
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return { minX, maxX, minZ, maxZ };
}

export interface EntryDoorAlignment {
    /** The along-edge offset (leading edge) for the door on the corridor-facing wall (m). */
    readonly offset: number;
    /** The circulation room the door opens into (its edge-span centre was used). */
    readonly intoCirculation: true;
}

/**
 * Resolve the front-door along-edge offset so the door opens into the apartment's INTERNAL
 * circulation where it meets the corridor-facing cell edge.
 *
 * @param rooms     the engine layout's rooms (with plan-mm polygons).
 * @param doorEdge  the corridor-facing cell edge (carries the front door).
 * @param cell      the apartment cell rect (world metres, plan frame).
 * @param doorWidth the door leaf width (m).
 * @param jambM     min solid jamb reserved at each wall end (m). Default 0.2.
 * @returns the aligned offset + flag, or `null` when no circulation room reaches the edge
 *          (caller falls back to a centred door).
 */
export function resolveEntryDoorOffset(
    rooms: ReadonlyArray<EntryRoomLite>,
    doorEdge: DoorEdge,
    cell: Rect,
    doorWidth: number,
    jambM = 0.2,
): EntryDoorAlignment | null {
    const horizontal = doorEdge === 'z0' || doorEdge === 'z1';
    // The wall runs along x (horizontal edge) or along z (vertical edge); the along-wall
    // coordinate starts at the edge's low corner. The door `offset` is measured from there.
    const wallLo = horizontal ? Math.min(cell.x0, cell.x1) : Math.min(cell.z0, cell.z1);
    const wallHi = horizontal ? Math.max(cell.x0, cell.x1) : Math.max(cell.z0, cell.z1);
    const wallLen = wallHi - wallLo;
    if (!(wallLen > 0) || !(doorWidth > 0) || doorWidth + 2 * jambM > wallLen) return null;
    const edgeCoord = doorEdge === 'z0' ? cell.z0 : doorEdge === 'z1' ? cell.z1 : doorEdge === 'x0' ? cell.x0 : cell.x1;

    // Find the circulation room whose footprint TOUCHES the door edge, with the WIDEST overlap
    // span along the wall (the corridor leg meeting the edge — the door belongs in its centre).
    let bestLo = NaN, bestHi = NaN, bestSpan = -Infinity;
    for (const r of rooms) {
        if (!isCirculation(r) || !r.polygon) continue;
        const e = extentOf(r.polygon);
        if (!e) continue;
        // Does this room reach the door edge?
        const reaches = horizontal
            ? (Math.abs(e.minZ - edgeCoord) <= EDGE_TOUCH_M || Math.abs(e.maxZ - edgeCoord) <= EDGE_TOUCH_M)
            : (Math.abs(e.minX - edgeCoord) <= EDGE_TOUCH_M || Math.abs(e.maxX - edgeCoord) <= EDGE_TOUCH_M);
        if (!reaches) continue;
        // The room's span ALONG the wall (overlap with the wall extent).
        const rLo = horizontal ? e.minX : e.minZ;
        const rHi = horizontal ? e.maxX : e.maxZ;
        const lo = Math.max(rLo, wallLo), hi = Math.min(rHi, wallHi);
        const span = hi - lo;
        if (span > bestSpan && span > 0) { bestSpan = span; bestLo = lo; bestHi = hi; }
    }
    if (!(bestSpan > 0)) return null;   // no circulation room reaches the edge → centred fallback

    // Centre the door within the circulation room's edge-span, clamped so the leaf + jambs stay
    // inside the wall ends (and inside the circulation span when it is wide enough).
    const spanCentreAlong = (bestLo + bestHi) / 2 - wallLo;   // distance from the wall's low end
    let offset = spanCentreAlong - doorWidth / 2;
    const minOff = jambM;
    const maxOff = wallLen - jambM - doorWidth;
    offset = Math.min(Math.max(minOff, offset), Math.max(minOff, maxOff));
    return { offset, intoCirculation: true };
}
