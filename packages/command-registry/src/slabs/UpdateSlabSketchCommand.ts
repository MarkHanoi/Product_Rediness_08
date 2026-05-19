import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabSketch } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';

export interface UpdateSlabSketchPayload {
    slabId: string;
    sketch: SlabSketch;
}

/**
 * UpdateSlabSketchCommand
 *
 * Replaces the parametric sketch on an existing slab. Supports full undo/redo
 * by capturing the prior sketch state (or undefined for slabs that had no sketch).
 *
 * Contract compliance:
 * - §01 §2.2 Command-First: Only this command mutates a slab's sketch field.
 * - §01 §2.3 Undo/Redo: Prior sketch captured in execute(), restored in undo().
 * - §02 Projection-Only: Builder reacts to store event fired by slabStore.update().
 * - §03 §3.2: SlabDependencyTracker listens to 'bim-slab-updated' and re-registers
 *   HostReferenceEdge dependencies automatically after this command executes.
 */
export class UpdateSlabSketchCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB_SKETCH;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot?: SlabData;

    constructor(private payload: UpdateSlabSketchPayload) {
        this.id = `cmd-update-slab-sketch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: `Slab "${this.payload.slabId}" not found.` };

        const { outerLoop } = this.payload.sketch;
        if (!outerLoop || !Array.isArray(outerLoop.edges) || outerLoop.edges.length < 3) {
            return { ok: false, reason: 'Sketch outer loop must have at least 3 edges.' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) return { success: false, affectedElementIds: [], error: `Slab "${this.payload.slabId}" not found.` };

        this.prevSnapshot = structuredClone(slab) as SlabData;

        const nextState = structuredClone(slab) as SlabData;
        nextState.sketch = structuredClone(this.payload.sketch);

        context.stores.slabStore.update(this.payload.slabId, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Sketch updated on slab ${this.payload.slabId}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Sketch restored on slab ${this.payload.slabId}`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: structuredClone(this.payload) as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }

    static deserialize(data: SerializedCommand): UpdateSlabSketchCommand {
        return new UpdateSlabSketchCommand(data.payload as UpdateSlabSketchPayload);
    }
}
