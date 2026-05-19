import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';

export interface UpdateSlabDimensionsPayload {
    slabId: string;
    width?: number;
    depth?: number;
    thickness?: number;
    materialColor?: string;
    materialId?: string;
}

/**
 * UpdateSlabDimensionsCommand
 *
 * FIX-13 §03 CommandType Semantics (M3):
 *
 * SEMANTIC BOUNDARY: This is the CANONICAL command for mutating the physical
 * and visual properties of a slab from the property panel or tool UIs:
 *   - width, depth — plan dimensions of a rectangular parametric slab
 *   - thickness — total slab thickness (cross-section)
 *   - materialColor — hex string for the display color
 *   - materialId — reference to a material library entry
 *
 * METADATA fields (mark, phase) belong to UpdateSlabCommand.
 * SKETCH fields (sketch, polygon) belong to UpdateSlabSketchCommand /
 *   UpdateSlabPolygonCommand respectively.
 *
 * Contract compliance:
 * - W1 FIX §CommandType: Changed type from UPDATE_ELEMENT_THICKNESS (shared with
 *   UpdateSlabCommand, causing command history deserialization ambiguity) to the
 *   dedicated UPDATE_SLAB_DIMENSIONS type.
 * - W2 FIX §3.4: Replaced JSON.parse/JSON.stringify with structuredClone.
 * - W8 FIX: Removed debug console.log("SAVE PAYLOAD:") from production execute().
 */
export class UpdateSlabDimensionsCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB_DIMENSIONS;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot?: SlabData;

    constructor(private payload: UpdateSlabDimensionsPayload) {
        // DIMENSION-SYSTEM-AUDIT-2026 §B4 — replace ad-hoc Date.now()+Math.random()
        // ID with collision-resistant crypto.randomUUID() to match every other
        // command in the codebase.
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: 'Slab not found' };

        if (this.payload.thickness !== undefined && this.payload.thickness <= 0)
            return { ok: false, reason: 'Invalid thickness' };

        if (this.payload.width !== undefined && slab.width > 0 && this.payload.width <= 0)
            return { ok: false, reason: 'Invalid width' };

        if (this.payload.depth !== undefined && slab.depth > 0 && this.payload.depth <= 0)
            return { ok: false, reason: 'Invalid depth' };

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) throw new Error('Slab not found');

        // W2 FIX: Use structuredClone for snapshot integrity.
        this.prevSnapshot = structuredClone(slab) as SlabData;

        const nextState = structuredClone(slab);
        if (this.payload.width !== undefined) nextState.width = this.payload.width;
        if (this.payload.depth !== undefined) nextState.depth = this.payload.depth;
        if (this.payload.thickness !== undefined) nextState.thickness = this.payload.thickness;
        if (this.payload.materialColor !== undefined) nextState.materialColor = this.payload.materialColor;
        if (this.payload.materialId !== undefined) nextState.materialId = this.payload.materialId;

        context.stores.slabStore.update(this.payload.slabId, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Slab ${this.payload.slabId} dimensions updated`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);
        return { success: true, affectedElementIds: [this.payload.slabId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
