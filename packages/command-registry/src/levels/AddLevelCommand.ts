import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

export interface AddLevelPayload {
    levelId: string;
    elevation: number;
    name: string;
    height: number;
}

export class AddLevelCommand implements Command {
    readonly affectedStores = ["level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];
    private payload: AddLevelPayload;

    constructor(payload: AddLevelPayload) {
        this.id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.levelId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { wallStore } = context.stores;
        const levels = wallStore.getLevels();
        
        if (levels.some(l => l.id === this.payload.levelId)) {
            return { ok: false, reason: `Level ID "${this.payload.levelId}" already exists.` };
        }

        if (isNaN(this.payload.elevation)) {
            return { ok: false, reason: "Elevation must be a valid number." };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { wallStore, slabStore, columnStore } = context.stores;
        const { bimManager, projectContext } = context;
        
        const newLevel = {
            id: this.payload.levelId,
            name: this.payload.name,
            elevation: this.payload.elevation,
            height: this.payload.height,
            childrenIds: [] as string[]
        };

        bimManager.addLevel(newLevel);

        // §WALL-AUDIT-2026-M3: WallStore.addLevel() was a deprecated wrapper and
        // has been removed — BimManager is the authoritative owner of levels.
        // Keep the guarded calls on the other stores for backward-compat until
        // their own deprecation cycles complete.
        if (wallStore && (wallStore as any).addLevel) (wallStore as any).addLevel(newLevel);
        if (slabStore && (slabStore as any).addLevel) (slabStore as any).addLevel(newLevel);
        if (columnStore && (columnStore as any).addLevel) (columnStore as any).addLevel(newLevel);
        
        projectContext.activeLevelId = newLevel.id;

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-added', { id: newLevel.id, elevation: newLevel.elevation });
        _bus.emit('ai-model-update', { model: '' });

        return {
            success: true,
            affectedElementIds: [newLevel.id],
            info: [`Level "${newLevel.name}" added at ${newLevel.elevation}m`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const { wallStore } = context.stores;
        const { bimManager } = context;
        
        bimManager.removeLevel(this.payload.levelId);
        wallStore.removeLevel(this.payload.levelId);
        
        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-removed', { id: this.payload.levelId });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${this.payload.name}" removal undone`]
        };
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
