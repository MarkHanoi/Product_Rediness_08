/**
 * WallOccupancyStore — §OCCUPANCY Opening Placement Validator
 *
 * MODIFICATION DECLARATION
 * Layer:          Side System (Command validation utility)
 * Phase:          Phase I — Semantic Model & Core Engine
 * Files:          src/elements/walls/WallOccupancyStore.ts
 * Classification: A — New Side System (no change to existing layers)
 * Impact:         Adds overlap detection for opening placement.
 *                 CreateWallOpeningCommand.canExecute() now rejects placements
 *                 that would overlap any existing opening on the same wall.
 *                 Undo/redo, project loading, and IFC import are unaffected —
 *                 this system reads WallStore state directly and carries no
 *                 independent state of its own.
 * Risk:           LOW — purely additive.  Existing placements are unchanged.
 *                 canExecute() validation was previously always returning ok:true
 *                 (only checked wall existence); this adds a conflict check on top.
 * Rationale:      Pascal WallSpatialGrid pattern adapted to PRYZM's stateless
 *                 architecture.  See Priority 2 in master analysis doc.
 *
 * Design principle:
 *   WallOccupancyStore is a PURE-QUERY side system.  It reads wall.openings[]
 *   directly from a frozen WallData record at query time.  It carries no
 *   independent state — WallStore is the single source of truth.
 *
 *   This means:
 *     • No register() / unregister() lifecycle management
 *     • Transparent to undo/redo (wall state reverts → occupancy query reverts)
 *     • Transparent to project loading (openings already in WallData)
 *     • Zero risk of stale state accumulation
 *
 * Contract compliance:
 *   §06-8.5  — Defines this class and its query contract
 *   §03-4.8  — canExecute() must call canPlace() before adding an opening
 *   R-1      — WallStore is source of truth; this system never writes to it
 *   §2.7     — Builder is never called from here
 */

import { WallData, Opening } from './WallTypes';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CanPlaceResult {
    valid:       boolean;
    conflictIds: string[];   // Opening.id values of conflicting entries
    reason?:     string;     // Human-readable failure message (absent when valid)
}

// ─── WallOccupancyStore ───────────────────────────────────────────────────────

/**
 * Pure-query side system for opening placement validation.
 *
 * Usage:
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const result = wallOccupancyStore.canPlace(wall, offsetM, widthM);
 *   if (!result.valid) return { ok: false, reason: result.reason };
 */
export class WallOccupancyStore {

    /**
     * 1 mm tolerance so that openings that share an exact edge
     * (e.g., a door flush against a window) are NOT treated as conflicting.
     */
    private static readonly EPSILON_M = 0.001;

    /**
     * Checks whether a new opening [offsetM, offsetM + widthM] can be placed
     * on `wall` without overlapping any existing opening in wall.openings[].
     *
     * The check is purely 1-D along the wall baseline (horizontal extent).
     * Vertical stacking (different sill heights) is NOT permitted — BIM
     * semantics require each horizontal span to be exclusively owned by one
     * opening element (§06-8.5).
     *
     * @param wall        Frozen WallData — provides openings[] and baseLine
     * @param offsetM     Distance from wall start to LEFT edge of new opening (metres)
     * @param widthM      Width of the new opening (metres)
     * @param excludeId   Optional Opening.id to skip during conflict check.
     *                    Use when moving or resizing an existing opening so it
     *                    does not conflict with itself.
     *
     * @returns  { valid: true } when placement is clear.
     *           { valid: false, conflictIds, reason } when blocked.
     */
    canPlace(
        wall:       WallData,
        offsetM:    number,
        widthM:     number,
        excludeId?: string,
    ): CanPlaceResult {

        // ── Compute wall length ────────────────────────────────────────────
        const bl         = wall.baseLine;
        const _b0 = bl[0], _b1 = bl[1];
        const wallLengthM = Math.sqrt((_b1.x-_b0.x)**2 + (_b1.y-_b0.y)**2 + (_b1.z-_b0.z)**2);

        if (wallLengthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      'Wall has zero length — cannot place openings',
            };
        }

        // ── Basic bounds validation ────────────────────────────────────────
        if (widthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      `Opening width must be > 0 (got ${widthM.toFixed(3)} m)`,
            };
        }

        const eps = WallOccupancyStore.EPSILON_M;

        if (offsetM < -eps) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      `Offset ${offsetM.toFixed(3)} m is before wall start`,
            };
        }

        const newEnd = offsetM + widthM;
        if (newEnd > wallLengthM + eps) {
            return {
                valid:       false,
                conflictIds: [],
                reason: (
                    `Opening [${offsetM.toFixed(3)} m, ${newEnd.toFixed(3)} m] ` +
                    `extends beyond wall length ${wallLengthM.toFixed(3)} m`
                ),
            };
        }

        // ── Overlap detection ─────────────────────────────────────────────
        //
        // Two 1-D intervals [a, a+wa] and [b, b+wb] overlap when:
        //   a < b + wb - ε   (new opening starts before existing ends)
        //   AND
        //   a + wa > b + ε   (new opening ends after existing starts)
        //
        // The EPSILON ensures that touching edges (a+wa == b, within 1 mm) are
        // treated as NON-overlapping so adjacent windows can share a frame edge.

        const conflicts: string[] = [];
        const openings: Opening[] = wall.openings ?? [];

        for (const existing of openings) {
            if (excludeId && existing.id === excludeId) continue;

            const exStart = existing.offset;
            const exEnd   = existing.offset + existing.width;

            const overlaps = (
                offsetM < exEnd   - eps &&
                newEnd  > exStart + eps
            );

            if (overlaps) {
                conflicts.push(existing.id);
                console.log(
                    `[WallOccupancyStore] CONFLICT: new=[${offsetM.toFixed(3)},${newEnd.toFixed(3)}]m ` +
                    `vs existing ${existing.id} [${exStart.toFixed(3)},${exEnd.toFixed(3)}]m ` +
                    `on wall ${wall.id}`
                );
            }
        }

        if (conflicts.length > 0) {
            return {
                valid:       false,
                conflictIds: conflicts,
                reason:      `Opening overlaps existing opening(s): ${conflicts.join(', ')}`,
            };
        }

        console.log(
            `[WallOccupancyStore] canPlace OK: wall=${wall.id} ` +
            `offset=${offsetM.toFixed(3)}m width=${widthM.toFixed(3)}m ` +
            `wallLen=${wallLengthM.toFixed(3)}m`
        );

        return { valid: true, conflictIds: [] };
    }

    /**
     * Returns all existing openings on a wall, sorted by offset.
     * Useful for tool UI that needs to display the occupied spans.
     *
     * Read-only — does not modify WallData.
     */
    getOccupiedSpans(wall: WallData): ReadonlyArray<{
        openingId: string;
        type:      'window' | 'door';
        offsetM:   number;
        endM:      number;
    }> {
        const openings: Opening[] = wall.openings ?? [];
        return openings
            .map(o => ({
                openingId: o.id,
                type:      o.type,
                offsetM:   o.offset,
                endM:      o.offset + o.width,
            }))
            .sort((a, b) => a.offsetM - b.offsetM);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Module-level singleton — import and call directly, no constructor needed.
 *
 * @example
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const { valid, reason } = wallOccupancyStore.canPlace(wall, 1.2, 0.9);
 */
export const wallOccupancyStore = new WallOccupancyStore();
