/**
 * perRoomBoundary — shared helper for SEMANTIC "per-room boundary element" batch
 * commands (SPEC-SEMANTIC §10: #34 floors-by-room, #28/#29 ceilings-by-room,
 * #33 screed, …).
 *
 * Each such command iterates the rooms on a level, and for every room with a
 * usable boundary polygon, creates ONE boundary element (floor / ceiling / …) via
 * a per-element `factory`. This file owns the shared iteration + sub-command
 * execution + undo bookkeeping so the element commands only express their own
 * mapping (occupancyType → system type) and payload. Rule-of-three extraction.
 *
 * Governed by C16 (level-oriented, semantic-first, batch) — the caller wraps the
 * run in `batchCoordinator.runBatch` for one coalesced undo unit (C16 §8/CA-12).
 * Coordinate note: RoomVertex / FloorVertex / CeilingVertex are ALL `{x,z}` — no
 * axis remap (C11 §11.4 SLAB-BOUNDARY-CONVENTION footgun avoided).
 */

import type { Command, CommandContext } from '../types';

/** The room shape per-room batch commands rely on (read-only view). */
export interface PerRoomCtx {
    id: string;
    name?: string;
    levelId: string;
    occupancyType?: string;
    boundary?: { polygon?: Array<{ x: number; z: number }>; height?: number };
}

export interface PerRoomBatchResult {
    createdCommands: Command[];
    affectedElementIds: string[];
}

/** Rooms on a level (`getByLevel` when available, else filtered `getAll`). */
export function roomsOnLevel(context: CommandContext, levelId: string): PerRoomCtx[] {
    const roomStore = context.stores.roomStore as unknown as {
        getByLevel?: (id: string) => PerRoomCtx[];
        getAll?: () => PerRoomCtx[];
    } | undefined;
    if (!roomStore) return [];
    if (typeof roomStore.getByLevel === 'function') return roomStore.getByLevel(levelId) ?? [];
    return (roomStore.getAll?.() ?? []).filter(r => r.levelId === levelId);
}

/** Count of rooms on a level that have a valid (≥3-vertex) boundary polygon. */
export function roomsWithBoundary(context: CommandContext, levelId: string): PerRoomCtx[] {
    return roomsOnLevel(context, levelId).filter(r => (r.boundary?.polygon?.length ?? 0) >= 3);
}

/**
 * For each room on the level with a usable boundary, build one element via
 * `factory(room)` (returns a constructed sub-command, or `null` to skip the room
 * — filter / dedup / no-mapping), execute it, and track it for undo.
 *
 * The caller is responsible for wrapping the invocation in
 * `batchCoordinator.runBatch(...)` so the N sub-commands coalesce into one drain
 * + one undo unit.
 */
export function buildPerRoomBoundaryElements(
    context: CommandContext,
    levelId: string,
    factory: (room: PerRoomCtx) => Command | null,
): PerRoomBatchResult {
    const createdCommands: Command[] = [];
    const affectedElementIds: string[] = [];
    for (const room of roomsOnLevel(context, levelId)) {
        if ((room.boundary?.polygon?.length ?? 0) < 3) continue;
        const cmd = factory(room);
        if (!cmd) continue;
        const res = cmd.execute(context);
        if (res.success && res.affectedElementIds.length) {
            createdCommands.push(cmd);
            affectedElementIds.push(...res.affectedElementIds);
        }
    }
    return { createdCommands, affectedElementIds };
}
