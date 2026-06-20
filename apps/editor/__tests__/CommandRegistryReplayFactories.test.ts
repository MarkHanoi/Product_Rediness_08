// @vitest-environment happy-dom
//
// §ELEMENT-REPLAY-AUDIT (2026-06-20) — regression guard for the replay factories.
//
// The original "sofa reverts to origin after I move it" bug was a missing
// CommandRegistry factory: on collaboration catch-up the serialized command
// reconstructed to null ("No factory") and was silently dropped, so the edit
// reverted on every remote peer / reconnect. This test asserts that every factory
// added during the semantic audit STAYS registered (hasType) and that a
// representative set reconstructs a non-null command of the right type — so a future
// refactor that drops one fails CI instead of silently regressing collab replay.
//
// happy-dom env: importing the editor CommandRegistry transitively loads
// @pryzm/core-app-model (ViewRenderCache attaches window listeners at module load).

import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/engine/CommandRegistry';
import { CommandType, type SerializedCommand } from '@pryzm/command-registry';

/** Every CommandType wired during the 2026-06-20 audit clusters. */
const AUDIT_FACTORY_TYPES: readonly CommandType[] = [
    // cluster 1 — per-element edits
    CommandType.UPDATE_ELEMENT_PARAMETER,
    CommandType.UPDATE_ELEMENT_MARK,
    CommandType.CENTER_WINDOW_IN_WALL,
    CommandType.CHANGE_STAIR_SHAPE,
    CommandType.UPDATE_STAIR_FLIGHTS,
    CommandType.DELETE_STAIR,
    // cluster 2 — curtain-grid / cascade / grid / floor / room
    CommandType.ADD_CURTAIN_GRID_LINE,
    CommandType.REMOVE_CURTAIN_GRID_LINE,
    CommandType.UPDATE_ALL_CURTAIN_WALLS,
    CommandType.CASCADE_WALL_BASELINE,
    CommandType.TOGGLE_PIN_GRID,
    CommandType.CREATE_GRID_SYSTEM,
    CommandType.UPDATE_FLOOR_LAYERS,
    CommandType.UPDATE_ROOM_BOUNDARY,
    // S4 — plumbing move
    CommandType.MOVE_PLUMBING,
];

describe('§ELEMENT-REPLAY-AUDIT — replay factories stay registered', () => {
    it('every audit CommandType has a registered factory (no "No factory" drop)', () => {
        const missing = AUDIT_FACTORY_TYPES.filter((t) => !CommandRegistry.hasType(t));
        expect(missing).toEqual([]);
    });

    // Representative round-trips: a serialized wire payload reconstructs a typed,
    // non-null command. Payloads mirror each command's serialize() output shape.
    const ROUND_TRIPS: ReadonlyArray<[CommandType, SerializedCommand['payload']]> = [
        [CommandType.MOVE_PLUMBING, { id: 'plumb-1', to: { x: 1, y: 0, z: 2 } }],
        [CommandType.CHANGE_STAIR_SHAPE, { stairId: 's1', newShape: 'L', levelHeight: 3 }],
        [CommandType.UPDATE_STAIR_FLIGHTS, { stairId: 's1', flights: [], landings: [] }],
        [CommandType.DELETE_STAIR, { stairId: 's1' }],
        [CommandType.CENTER_WINDOW_IN_WALL, { windowId: 'w1' }],
        [CommandType.UPDATE_ROOM_BOUNDARY, { roomId: 'r1', newBoundary: { polygon: [] }, newBoundingWallIds: [] }],
        [CommandType.TOGGLE_PIN_GRID, { gridId: 'g1' }],
    ];

    it.each(ROUND_TRIPS)('reconstructs %s to a non-null command of the same type', (type, payload) => {
        const serialized = { type, payload, targetIds: [], timestamp: 1, version: 1 } as SerializedCommand;
        const cmd = CommandRegistry.create(serialized);
        expect(cmd).not.toBeNull();
        expect(cmd!.type).toBe(type);
    });
});
