import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { HandrailData } from '@pryzm/core-app-model';
import { serializeHandrailSnapshot, deserializeHandrailSnapshot } from '@pryzm/core-app-model';

export interface UpdateHandrailPayload {
    id: string;
    height?: number;
    thickness?: number;
    materialColor?: string;
    baseOffset?: number;
    fillType?: string;
    railProfile?: string;
}

export class UpdateHandrailCommand implements Command {
    readonly affectedStores = ["handrail"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_HANDRAIL;
    readonly timestamp = Date.now();
    targetIds: string[];
    private prevSnapshot: string | undefined;

    constructor(private payload: UpdateHandrailPayload) {
        this.targetIds = [payload.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const handrail = ctx.stores.handrailStore.getById(this.payload.id);
        if (!handrail) return { ok: false, reason: 'Handrail not found' };

        if (this.payload.height !== undefined) {
            if (this.payload.height < 0.3 || this.payload.height > 2.5) {
                return { ok: false, reason: 'Handrail height must be between 0.3 m and 2.5 m' };
            }
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.handrailStore;
        const handrail = store.getById(this.payload.id);
        if (!handrail) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeHandrailSnapshot(handrail);

        const updates: Partial<HandrailData> = {};
        if (this.payload.height       !== undefined) updates.height       = this.payload.height;
        if (this.payload.thickness    !== undefined) updates.thickness    = this.payload.thickness;
        if (this.payload.materialColor !== undefined) updates.materialColor = this.payload.materialColor;
        if (this.payload.baseOffset   !== undefined) updates.baseOffset   = this.payload.baseOffset;
        if (this.payload.fillType     !== undefined) updates.fillType     = this.payload.fillType as any;
        if (this.payload.railProfile  !== undefined) updates.railProfile  = this.payload.railProfile as any;

        store.update(this.payload.id, updates);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        const restored = deserializeHandrailSnapshot(this.prevSnapshot);
        ctx.stores.handrailStore.restoreSnapshot(this.payload.id, restored);
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
