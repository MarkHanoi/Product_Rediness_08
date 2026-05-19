import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { createIfcMetadata } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';

export class CreateHandrailCommand implements Command {
    readonly affectedStores = ["handrail", "level"] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_HANDRAIL;
    timestamp = Date.now();
    targetIds: string[] = [];
    private createdId?: string;

    constructor(
        private data: {
            id: string,
            start: { x: number, z: number },
            end: { x: number, z: number },
            height: number,
            thickness: number,
            levelId?: string,
            baseOffset?: number,
            fillType?: string,
            railProfile?: string,
            railDiameter?: number,
            postSpacing?: number,
            materialColor?: string,
        }
    ) {}

    canExecute(ctx: CommandContext): CommandValidationResult {
        const levelId = this.data.levelId || ctx.projectContext.activeLevelId;
        if (!levelId) return { ok: false, reason: 'Missing levelId' };
        if (!ctx.bimManager.getLevelById(levelId)) return { ok: false, reason: 'Level not found' };

        const dx = this.data.end.x - this.data.start.x;
        const dz = this.data.end.z - this.data.start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.1) return { ok: false, reason: 'Handrail must be at least 0.1 m long' };

        if (this.data.height < 0.3 || this.data.height > 2.5) {
            return { ok: false, reason: 'Handrail height must be between 0.3 m and 2.5 m' };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const id = this.data.id;
        const levelId = this.data.levelId || ctx.projectContext.activeLevelId;

        const level = ctx.bimManager.getLevelById(levelId);
        if (!level) return { success: false, affectedElementIds: [], info: ['Level not found'] };

        const baseOffset = this.data.baseOffset !== undefined ? this.data.baseOffset : 0;
        const fillType = (this.data.fillType as any) ?? 'baluster';

        const ifcPredefined = fillType === 'glass' || fillType === 'panel' ? 'GUARDRAIL' : 'HANDRAIL';

        const handrail = {
            id,
            type: 'handrail' as const,
            baseLine: [
                { x: this.data.start.x, y: 0, z: this.data.start.z },
                { x: this.data.end.x,   y: 0, z: this.data.end.z   }
            ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
            height:        this.data.height,
            thickness:     this.data.thickness,
            levelId,
            baseOffset,
            fillType,
            railProfile:   this.data.railProfile   as any,
            railDiameter:  this.data.railDiameter,
            postSpacing:   this.data.postSpacing,
            materialColor: this.data.materialColor,
            properties: {},
            ifcData: createIfcMetadata('handrail', ifcPredefined)
        };

        ctx.stores.handrailStore.add(handrail);
        ctx.bimManager.registerElement(id, levelId);

        // Gap 7 — SemanticGraph: handrail sitsOn its level.
        // Enables DependencyResolver to find all handrails on a level and
        // powers IFC IfcRelContainedInSpatialStructure for handrail elements.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: id,
                targetId: levelId,
                createdBy: 'CreateHandrailCommand',
                metadata: { addedBy: 'CreateHandrailCommand', fillType: handrail.fillType }
            });
        } catch (err) {
            console.warn('[CreateHandrailCommand] SemanticGraph write failed (non-fatal):', err);
        }

        this.createdId = id;
        this.targetIds = [id];
        return { success: true, affectedElementIds: [id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };
        ctx.bimManager.unregisterElement(this.createdId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreateHandrailCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        ctx.stores.handrailStore.remove(this.createdId);
        return { success: true, affectedElementIds: [this.createdId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, version: 1, payload: this.data };
    }
}
