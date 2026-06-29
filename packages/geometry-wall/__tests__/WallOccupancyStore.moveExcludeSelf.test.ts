/**
 * §MOVE-EXCLUDE-SELF (2026-06-29) — WallOccupancyStore self-exclusion on MOVE.
 *
 * Regression for the founder live-test defect: nudging a HOSTED door/window a
 * SMALL amount did NOT update the opening (a LARGE move worked). Console showed:
 *
 *   [CommandManager] EXECUTE: MOVE_DOOR
 *   [WallOccupancyStore] CONFLICT: new=[3.604,4.604]m vs existing 1e25a6b9-…
 *       [3.107,4.107]m on wall wall_…   → move REJECTED
 *
 * Root cause: the MOVE command calls canPlace(wall, newOffset, width, doorId)
 * passing the HOSTED ELEMENT id as excludeId, but each Opening carries its OWN
 * id (Opening.id) that is DISTINCT from the door/window element id; the link is
 * Opening.elementId === doorId. The exclusion loop only matched Opening.id, so
 * the moving element's own pre-move slot was NOT skipped. A small move whose new
 * range overlaps that old slot was flagged as a self-conflict and aborted; a
 * large move landed clear of the old slot so it slipped through.
 *
 * Fix: canPlace excludes an opening whose Opening.id OR Opening.elementId equals
 * excludeId. These tests prove:
 *   (a) a small in-place nudge overlapping the element's OWN old slot → valid;
 *   (b) a move overlapping a DIFFERENT opening is still correctly rejected.
 */

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore } from '../src/WallOccupancyStore';
import type { WallData, Opening } from '../src/WallTypes';

const DOOR_ELEMENT_ID = 'b03fc7e2-door-element';
const DOOR_OPENING_ID = '1e25a6b9-opening'; // intentionally distinct from element id
const OTHER_OPENING_ID = 'cafef00d-opening';
const OTHER_ELEMENT_ID = 'cafef00d-element';

/** Minimal WallData fixture — canPlace only reads { id, baseLine, openings }. */
function makeWall(openings: Opening[]): WallData {
    const wall = {
        id: 'wall_TEST',
        baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 8, y: 0, z: 0 }, // 8 m planar length
        ],
        openings,
    };
    return wall as unknown as WallData;
}

/** The door's own opening: pre-move slot [3.107, 4.107] (width 1.0). */
function doorOpening(offset = 3.107): Opening {
    return {
        id: DOOR_OPENING_ID,
        type: 'door',
        offset,
        width: 1.0,
        height: 2.1,
        sillHeight: 0,
        elementId: DOOR_ELEMENT_ID,
    };
}

describe('WallOccupancyStore — §MOVE-EXCLUDE-SELF', () => {
    const store = new WallOccupancyStore();

    it('small in-place nudge whose new range overlaps the element OWN old slot → valid', () => {
        // Door currently occupies [3.107, 4.107]; nudge a few cm to [3.604, 4.604]
        // which OVERLAPS the old slot. Caller passes the ELEMENT id as excludeId.
        const wall = makeWall([doorOpening(3.107)]);
        const result = store.canPlace(wall, 3.604, 1.0, DOOR_ELEMENT_ID);
        expect(result.valid).toBe(true);
        expect(result.conflictIds).toHaveLength(0);
    });

    it('excludeId also matches Opening.id directly (callers may pass either)', () => {
        const wall = makeWall([doorOpening(3.107)]);
        const result = store.canPlace(wall, 3.604, 1.0, DOOR_OPENING_ID);
        expect(result.valid).toBe(true);
    });

    it('move overlapping a DIFFERENT opening is still rejected', () => {
        const other: Opening = {
            id: OTHER_OPENING_ID,
            type: 'window',
            offset: 5.0,
            width: 1.0, // occupies [5.0, 6.0]
            height: 1.2,
            sillHeight: 0.9,
            elementId: OTHER_ELEMENT_ID,
        };
        const wall = makeWall([doorOpening(3.107), other]);
        // Move the door to [5.2, 6.2] — overlaps the OTHER window. Even though we
        // exclude the door's own slot, this must still conflict with the window.
        const result = store.canPlace(wall, 5.2, 1.0, DOOR_ELEMENT_ID);
        expect(result.valid).toBe(false);
        expect(result.conflictIds).toContain(OTHER_OPENING_ID);
    });

    it('without excludeId, the old self-slot still conflicts (control)', () => {
        const wall = makeWall([doorOpening(3.107)]);
        const result = store.canPlace(wall, 3.604, 1.0);
        expect(result.valid).toBe(false);
        expect(result.conflictIds).toContain(DOOR_OPENING_ID);
    });
});
