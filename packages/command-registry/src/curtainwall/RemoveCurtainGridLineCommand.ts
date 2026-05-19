// TODO(E.5.x): ORPHANED — RemoveCurtainGridLineHandler (plugins/curtain-wall/src/handlers/RemoveCurtainGridLine.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler. Confirm no other live callers exist then remove in Phase E.5.x cleanup.
/**
 * RemoveCurtainGridLineCommand
 *
 * Removes a U or V grid line from a curtain wall's CurtainGridSystem by grid line ID.
 *
 * ## Effect
 *
 * 1. Updates CurtainWallStore with the new gridSystem (grid line removed)
 * 2. CurtainPanelSyncHandler detects that adjacent cells merged → removes
 *    the two old panel entries and creates one new panel for the merged cell
 * 3. CurtainWallBuilder.build() re-renders geometry
 *
 * ## Undo
 *
 * Restores the full pre-mutation CurtainWallData snapshot via store.set().
 * Panel store is re-synced automatically via the CurtainPanelSyncHandler subscriber.
 *
 * ## Boundary Protection
 *
 * The command prevents removal of boundary grid lines (t≈0 and t≈1).
 *
 * ## Contract References
 *
 * §2.7  — No direct builder call in command
 * §3.5  — Store is data-only
 * §01 §2.2 — Full CurtainWallData snapshot for undo; undo uses store.set()
 *
 * ## Modifications
 *
 * §MI-01 FIX (2026-03-31): Snapshot upgraded from `CurtainGridSystem` (partial) to full
 *   `CurtainWallData`. Undo now calls `store.set()` (full replacement) instead of
 *   `store.update()` (partial merge), matching §01 §2.2 requirement for undo snapshots.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import { CurtainGridSystem, removeGridLine, migrateToGridSystem } from '@pryzm/geometry-curtain-wall';

export interface RemoveCurtainGridLinePayload {
    curtainWallId: string;
    /** The CurtainGridLine.id to remove. */
    gridLineId: string;
    /** 'u' removes from uLines; 'v' removes from vLines. */
    axis: 'u' | 'v';
}

export class RemoveCurtainGridLineCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — removing a grid line mutates the wall topology
    // AND transitively reshapes the panel set via CurtainPanelSyncHandler.
    readonly affectedStores = ["curtainWall", "curtainPanel"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.REMOVE_CURTAIN_GRID_LINE;
    readonly timestamp = Date.now();
    targetIds: string[];

    /**
     * §MI-01 FIX: Full CurtainWallData snapshot (not just CurtainGridSystem).
     * Undo restores via store.set() for complete state replacement.
     */
    private previousWallSnapshot: CurtainWallData | null = null;

    constructor(private payload: RemoveCurtainGridLinePayload) {
        this.targetIds = [payload.curtainWallId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const cw = context.stores.curtainWallStore.get(this.payload.curtainWallId);
        if (!cw) {
            return { ok: false, reason: `Curtain wall '${this.payload.curtainWallId}' not found` };
        }
        if (this.payload.axis !== 'u' && this.payload.axis !== 'v') {
            return { ok: false, reason: `axis must be 'u' or 'v'` };
        }

        // Find the grid line and ensure it's not a boundary
        const grid = cw.gridSystem;
        if (!grid) return { ok: true }; // Will be migrated in execute

        const lines = this.payload.axis === 'u' ? grid.uLines : grid.vLines;
        const line = lines.find(l => l.id === this.payload.gridLineId);
        if (!line) {
            return { ok: false, reason: `Grid line '${this.payload.gridLineId}' not found on ${this.payload.axis}-axis` };
        }
        if (line.t < 0.001 || line.t > 0.999) {
            return { ok: false, reason: 'Cannot remove a boundary grid line (t=0 or t=1)' };
        }

        // Ensure removing this line won't leave fewer than 2 lines on the axis
        if (lines.length <= 2) {
            return { ok: false, reason: `Cannot remove the last interior grid line on ${this.payload.axis}-axis` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const cw = context.stores.curtainWallStore.get(this.payload.curtainWallId);
        if (!cw) throw new Error(`Curtain wall '${this.payload.curtainWallId}' not found`);

        const [start, end] = cw.baseLine;
        // P0.3 DTO Migration: baseLine is now [Point3D, Point3D] — no .distanceTo().
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const currentGrid: CurtainGridSystem = cw.gridSystem
            ?? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);

        // §MI-01 FIX: Capture FULL CurtainWallData snapshot before mutation.
        // store.get() returns a deep clone — safe as undo snapshot.
        this.previousWallSnapshot = cw;

        const newGrid: CurtainGridSystem = {
            uLines: this.payload.axis === 'u'
                ? removeGridLine(currentGrid.uLines, this.payload.gridLineId)
                : currentGrid.uLines.map(l => ({ ...l })),
            vLines: this.payload.axis === 'v'
                ? removeGridLine(currentGrid.vLines, this.payload.gridLineId)
                : currentGrid.vLines.map(l => ({ ...l }))
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
