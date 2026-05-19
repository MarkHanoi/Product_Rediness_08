// TODO(E.5.x): ORPHANED — UpdateRoofHandler (plugins/roof/src/handlers/UpdateRoof.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler. Confirm no other live callers exist then remove in Phase E.5.x cleanup.
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { RoofData } from '@pryzm/geometry-roof';
import { cloneRoofData } from '@pryzm/geometry-roof';

export class UpdateRoofCommand implements Command {
    readonly affectedStores = ["roof"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_ROOF;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot: RoofData | null = null;

    constructor(
        private roofId: string,
        private updates: Partial<Omit<RoofData, 'id' | 'type' | 'levelId' | 'metadata'>>
    ) {
        this.id = `cmd-update-roof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [roofId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const roof = context.stores.roofStore.getById(this.roofId);
        if (!roof) return { ok: false, reason: 'Roof not found' };

        if ((this.updates as any).levelId) {
            return { ok: false, reason: 'levelId is immutable after creation' };
        }
        if (this.updates.footprint && this.updates.footprint.polygon.length < 3) {
            return { ok: false, reason: 'footprint.polygon requires at least 3 vertices' };
        }
        if (this.updates.thickness !== undefined && this.updates.thickness <= 0) {
            return { ok: false, reason: 'thickness must be > 0' };
        }
        if (this.updates.slope !== undefined && this.updates.slope <= 0) {
            return { ok: false, reason: 'slope must be > 0' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.roofStore;
        const current = store.getById(this.roofId);
        if (!current) throw new Error('Roof not found');

        this.prevSnapshot = cloneRoofData(current);

        store.update(this.roofId, this.updates);

        return { success: true, affectedElementIds: [this.roofId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        context.stores.roofStore.restoreSnapshot(this.prevSnapshot);
        return { success: true, affectedElementIds: [this.roofId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { roofId: this.roofId, updates: this.updates },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
