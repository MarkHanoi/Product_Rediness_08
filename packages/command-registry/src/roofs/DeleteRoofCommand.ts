import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { RoofData } from '@pryzm/geometry-roof';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { cloneRoofData } from '@pryzm/geometry-roof';

export class DeleteRoofCommand implements Command {
    readonly affectedStores = ["roof"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_ROOF;
    readonly timestamp: number;
    targetIds: string[];

    private snapshot: RoofData | null = null;

    constructor(private roofId: string) {
        this.id = `cmd-delete-roof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [roofId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const roof = context.stores.roofStore.getById(this.roofId);
        if (!roof) return { ok: false, reason: `Roof ${this.roofId} not found` };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const roof = context.stores.roofStore.getById(this.roofId);
        if (!roof) throw new Error(`Roof ${this.roofId} not found`);

        this.snapshot = cloneRoofData(roof);

        elementRegistry.unregister(this.roofId);
        context.bimManager.unregisterElement(this.roofId);
        context.stores.roofStore.remove(this.roofId);

        // P3.6 — Topology Layer stub (no-op until Core team delivers TopologyGraph)
        context.topologyGraph?.removeNode(this.roofId);

        return { success: true, affectedElementIds: [this.roofId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };

        context.stores.roofStore.add(this.snapshot);
        context.bimManager.registerElement(this.snapshot.id, this.snapshot.levelId);
        elementRegistry.registerSemantic(this.snapshot.id, 'roof');

        return { success: true, affectedElementIds: [this.snapshot.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { roofId: this.roofId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
