import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';

export interface DegradeSlabSketchPayload {
    slabId: string;
    degradedSlab: SlabData;
    removedWallId: string;
}

/**
 * DegradeSlabSketchCommand
 *
 * FIX-7 (W1 §01 §2.1 Command-First / §01 §2.3 Undo-Redo):
 *
 * When a wall is removed, any slab whose parametric sketch contains a
 * HostReferenceEdge pointing at that wall must have that edge degraded
 * to a FreeLineEdge (using the last known fallback geometry).
 *
 * Previously, SlabDependencyTracker.onWallRemoved() called
 * slabStore.update() directly, making sketch degradation non-undoable.
 *
 * This command makes the degradation a first-class, undoable operation:
 *
 *   execute() — captures the pre-degradation SlabData snapshot, then
 *               writes the caller-computed degraded slab to the store.
 *
 *   undo()    — restores the pre-degradation snapshot (including all
 *               HostReferenceEdges) so Ctrl+Z on the wall deletion also
 *               restores the slab's wall-reference sketch edges.
 *
 *   redo()    — re-applies the degraded slab state.
 *
 * The degraded slab is computed by SlabDependencyTracker before the
 * command is constructed, keeping WallFaceResolver logic in the tracker
 * and keeping this command focused on transactional store mutation.
 *
 * Contract compliance:
 * - §01 §2.1 Command-First: store mutation only via command execute/undo
 * - §01 §2.3 Undo/Redo: full snapshot capture in execute()
 * - §02 Projection-Only: store update fires 'bim-slab-updated' which
 *   triggers SlabFragmentBuilder rebuild automatically
 * - §03 §3.2: SlabDependencyTracker re-registers HostReferenceEdge
 *   dependencies on 'bim-slab-updated' after undo restores the sketch
 */
export class DegradeSlabSketchCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.DEGRADE_SLAB_SKETCH;
    readonly timestamp: number;
    targetIds: string[];

    private prevSnapshot?: SlabData;

    constructor(private payload: DegradeSlabSketchPayload) {
        this.id = `cmd-degrade-slab-sketch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) {
            return { ok: false, reason: `Slab "${this.payload.slabId}" not found — cannot degrade sketch.` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const current = context.stores.slabStore.getById(this.payload.slabId);
        if (!current) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Slab "${this.payload.slabId}" not found — cannot degrade sketch.`
            };
        }

        this.prevSnapshot = structuredClone(current) as SlabData;

        context.stores.slabStore.update(this.payload.slabId, structuredClone(this.payload.degradedSlab) as SlabData);

        console.log(
            `[DegradeSlabSketchCommand] Degraded sketch on slab "${this.payload.slabId}" ` +
            `(wall "${this.payload.removedWallId}" removed). HostReferenceEdges → FreeLineEdges.`
        );

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [
                `Slab "${this.payload.slabId}" sketch degraded: ` +
                `HostReferenceEdge for wall "${this.payload.removedWallId}" → FreeLineEdge.`
            ]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'No pre-degradation snapshot captured — cannot undo sketch degradation.'
            };
        }

        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);

        console.log(
            `[DegradeSlabSketchCommand] UNDO: Restored sketch on slab "${this.payload.slabId}" ` +
            `(HostReferenceEdges for wall "${this.payload.removedWallId}" restored).`
        );

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Sketch restored on slab "${this.payload.slabId}" (undo).`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                slabId: this.payload.slabId,
                removedWallId: this.payload.removedWallId,
                degradedSlab: structuredClone(this.payload.degradedSlab),
            } as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }

    static deserialize(data: SerializedCommand): DegradeSlabSketchCommand {
        return new DegradeSlabSketchCommand(data.payload as DegradeSlabSketchPayload);
    }
}
