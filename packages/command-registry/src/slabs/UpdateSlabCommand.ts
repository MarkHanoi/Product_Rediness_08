import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';

export interface UpdateSlabPayload {
    id: string;
    width?: number;
    depth?: number;
    thickness?: number;
    materialColor?: string;
    materialId?: string;
    mark?: string;
    phase?: string;
}

/**
 * UpdateSlabCommand
 *
 * FIX-13 §03 CommandType Semantics (M3):
 *
 * SEMANTIC BOUNDARY: This command is intended for METADATA and IDENTITY fields:
 *   - mark (properties.mark) — user-visible label, e.g. "SB001"
 *   - phase — construction phase assignment
 *
 * DIMENSIONAL / PHYSICAL fields (width, depth, thickness, materialColor,
 * materialId) overlap with UpdateSlabDimensionsCommand. This duplication (M3)
 * exists for historical reasons. Going forward:
 *   - Use UpdateSlabDimensionsCommand for width/depth/thickness/materialColor/
 *     materialId changes originating from the property panel or tools.
 *   - Reserve UpdateSlabCommand for mark/phase and metadata-only changes.
 *
 * The dimensional payload fields are kept for backward compatibility but
 * log a deprecation warning in development so callers can migrate.
 *
 * Contract compliance:
 * - W1 FIX §CommandType: Changed type from UPDATE_ELEMENT_THICKNESS (which was shared
 *   with UpdateSlabDimensionsCommand, creating deserialization ambiguity) to the
 *   dedicated UPDATE_SLAB type.
 * - W2 FIX §3.4: Replaced JSON.parse/JSON.stringify with structuredClone for snapshot
 *   integrity. structuredClone handles nested objects correctly and does not lose
 *   plain-object fields.
 */
export class UpdateSlabCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot?: any;

    constructor(private payload: UpdateSlabPayload) {
        this.id = `cmd-update-slab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.id);
        if (!slab) return { ok: false, reason: 'Slab not found' };
        if (this.payload.thickness !== undefined && this.payload.thickness <= 0)
            return { ok: false, reason: 'Invalid thickness' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.id);
        if (!slab) throw new Error('Slab not found');

        // FIX-13 M3: Deprecation warning for dimensional fields used via UpdateSlabCommand.
        // These fields belong to UpdateSlabDimensionsCommand per the semantic boundary above.
        // W4 §SLAB-SYSTEM-AUDIT-2026: Promote from console.warn to a thrown Error so
        // callers that reach the wrong command are blocked immediately rather than silently
        // succeeding. UpdateSlabDimensionsCommand is the correct command for these fields.
        if (
            this.payload.width !== undefined ||
            this.payload.depth !== undefined ||
            this.payload.thickness !== undefined ||
            this.payload.materialColor !== undefined ||
            this.payload.materialId !== undefined
        ) {
            throw new Error(
                '[UpdateSlabCommand] W4 §SLAB-SYSTEM-AUDIT-2026: ' +
                'width/depth/thickness/materialColor/materialId MUST be mutated via ' +
                'UpdateSlabDimensionsCommand, not UpdateSlabCommand. ' +
                'UpdateSlabCommand is reserved for metadata-only fields (mark, phase). ' +
                'Update the caller to use the correct command.'
            );
        }

        // W2 FIX: Use structuredClone instead of JSON.parse/stringify.
        this.prevSnapshot = structuredClone(slab);

        // Build a complete nextState by cloning current state then applying changes.
        // This ensures update() receives a full object, not a partial patch.
        const nextState = structuredClone(slab);
        if (this.payload.width !== undefined) nextState.width = this.payload.width;
        if (this.payload.depth !== undefined) nextState.depth = this.payload.depth;
        if (this.payload.thickness !== undefined) nextState.thickness = this.payload.thickness;
        if (this.payload.materialColor !== undefined) {
            nextState.materialColor = this.payload.materialColor;
        } else if (slab.materialColor) {
            nextState.materialColor = slab.materialColor;
        }
        if (this.payload.materialId !== undefined) nextState.materialId = this.payload.materialId;
        if (this.payload.mark !== undefined) {
            if (!nextState.properties) nextState.properties = {};
            nextState.properties.mark = this.payload.mark;
        }
        if (this.payload.phase !== undefined) nextState.phase = this.payload.phase;

        context.stores.slabStore.update(this.payload.id, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.id],
            info: [`Slab ${this.payload.id} updated`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        // Restore full snapshot — prevSnapshot is a complete SlabData clone.
        context.stores.slabStore.update(this.payload.id, this.prevSnapshot);
        return { success: true, affectedElementIds: [this.payload.id] };
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
