// TODO(E.5.x): ORPHANED — AddCurtainGridLineHandler (plugins/curtain-wall/src/handlers/AddCurtainGridLine.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler. Confirm no other live callers exist then remove in Phase E.5.x cleanup.
/**
 * AddCurtainGridLineCommand
 *
 * Inserts a new U or V grid line into a curtain wall's CurtainGridSystem.
 *
 * ## Effect
 *
 * 1. Updates CurtainWallStore with the new gridSystem
 * 2. StoreEventBus emits 'update' → CurtainPanelSyncHandler detects new cells // TODO(TASK-08)
 *    and creates corresponding panel entries
 * 3. StoreEventBus emits 'update' → CurtainWallBuilder.build() re-renders geometry // TODO(TASK-08)
 *
 * ## Undo
 *
 * Restores the full pre-mutation CurtainWallData snapshot via store.set().
 * CurtainPanelSyncHandler then removes the panels from the split cell.
 *
 * ## Contract References
 *
 * §2.7  — No direct builder call in command
 * §3.5  — Store is data-only; builder rebuilds via subscriber in main.ts
 * §01 §2.2 — Full CurtainWallData snapshot captured before mutation; undo uses store.set()
 * §6.1  — §MI-05 FIX: Grid line ID pre-generated in constructor — stable across redo cycles
 *
 * ## Modifications
 *
 * §MI-01 FIX (2026-03-31): Snapshot upgraded from `CurtainGridSystem` (partial) to full
 *   `CurtainWallData`. Undo now calls `store.set()` (full replacement) instead of
 *   `store.update()` (partial merge), matching §01 §2.2 requirement for undo snapshots.
 *
 * §MI-05 FIX (2026-03-31): `this.newLineId` is pre-generated in the constructor
 *   and passed to `insertGridLine()` in `execute()`. On redo, execute() is called
 *   again with the same ID — making the grid line ID stable across the entire
 *   undo/redo history. This prevents dangling references in RemoveCurtainGridLineCommand
 *   history entries that target the line by its ID.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import { CurtainGridSystem, insertGridLine, migrateToGridSystem } from '@pryzm/geometry-curtain-wall';

export interface AddCurtainGridLinePayload {
    curtainWallId: string;
    /** 'u' inserts along the length axis; 'v' inserts along the height axis. */
    axis: 'u' | 'v';
    /** Normalized position on the axis (0..1). */
    t: number;
}

export class AddCurtainGridLineCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — adding a grid line mutates the wall topology
    // AND transitively reshapes the panel set via CurtainPanelSyncHandler. Both
    // stores must be declared so command-replay tooling and undo coalescing see
    // the full mutation set.
    readonly affectedStores = ["curtainWall", "curtainPanel"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.ADD_CURTAIN_GRID_LINE;
    readonly timestamp = Date.now();
    targetIds: string[];

    /**
     * §MI-05 FIX: New grid line ID pre-generated in constructor — never inside execute().
     * This ensures the ID is identical whether execute() runs as the first call or as a
     * redo call, so any subsequent RemoveCurtainGridLineCommand targeting this line by ID
     * remains valid across the full undo/redo history.
     */
    private readonly newLineId: string = crypto.randomUUID();

    /**
     * §MI-01 FIX: Full CurtainWallData snapshot (not just CurtainGridSystem).
     * Undo restores via store.set() for complete state replacement.
     */
    private previousWallSnapshot: CurtainWallData | null = null;

    constructor(private payload: AddCurtainGridLinePayload) {
        this.targetIds = [payload.curtainWallId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const cw = context.stores.curtainWallStore.get(this.payload.curtainWallId);
        if (!cw) {
            return { ok: false, reason: `Curtain wall '${this.payload.curtainWallId}' not found` };
        }
        if (this.payload.t < 0 || this.payload.t > 1) {
            return { ok: false, reason: `t=${this.payload.t} is out of range [0, 1]` };
        }
        if (this.payload.t <= 0.001 || this.payload.t >= 0.999) {
            return { ok: false, reason: 'Cannot insert a grid line at the boundary (t=0 or t=1)' };
        }
        if (this.payload.axis !== 'u' && this.payload.axis !== 'v') {
            return { ok: false, reason: `axis must be 'u' or 'v', got '${this.payload.axis}'` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const cw = context.stores.curtainWallStore.get(this.payload.curtainWallId);
        if (!cw) throw new Error(`Curtain wall '${this.payload.curtainWallId}' not found`);

        const [start, end] = cw.baseLine;
        // P0.3 DTO Migration: baseLine is now [Point3D, Point3D] — compute length without THREE.
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Resolve current gridSystem (or migrate from scalar spacing)
        const currentGrid: CurtainGridSystem = cw.gridSystem
            ?? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);

        // §MI-01 FIX: Capture FULL CurtainWallData snapshot before mutation.
        // store.get() returns a deep clone — safe as undo snapshot.
        this.previousWallSnapshot = cw;

        // §MI-05 FIX: Pass pre-generated ID so the line gets the same ID on every redo.
        const newGrid: CurtainGridSystem = {
            uLines: this.payload.axis === 'u'
                ? insertGridLine(currentGrid.uLines, this.payload.t, 0.001, this.newLineId)
                : currentGrid.uLines.map(l => ({ id: l.id, t: l.t })),
            vLines: this.payload.axis === 'v'
                ? insertGridLine(currentGrid.vLines, this.payload.t, 0.001, this.newLineId)
                : currentGrid.vLines.map(l => ({ id: l.id, t: l.t }))
        };

        context.stores.curtainWallStore.update(this.payload.curtainWallId, { gridSystem: newGrid });

        return { success: true, affectedElementIds: [this.payload.curtainWallId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.previousWallSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo' };
        }
        // §MI-01 FIX: Full state replacement via store.set() — not partial update.
        // This is the correct undo path per §01 §2.2.
        context.stores.curtainWallStore.set(
            this.payload.curtainWallId,
            this.previousWallSnapshot
        );
        return { success: true, affectedElementIds: [this.payload.curtainWallId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.payload as any
        };
    }
}
