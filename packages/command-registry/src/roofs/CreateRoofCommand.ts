import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { RoofData, RoofType, RoofFootprint } from '@pryzm/geometry-roof';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface CreateRoofPayload {
    levelId: string;
    footprint: RoofFootprint;
    roofType: RoofType;
    slope?: number;
    overhang: number;
    baseOffset: number;
    thickness: number;
    fascia?: number;
    materialColor?: string;
    materialId?: string;
    /** P3.3 — When true, baseOffset is auto-computed from the tallest wall on the level. */
    autoBaseOffset?: boolean;
}

export class CreateRoofCommand implements Command {
    readonly affectedStores = ["roof", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_ROOF;
    readonly timestamp: number;
    targetIds: string[];

    private readonly roofId: string;
    private createdId?: string;

    constructor(roofId: string, private payload: CreateRoofPayload) {
        this.id = `cmd-roof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.roofId = roofId;
        this.targetIds = [roofId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const levelId = this.payload.levelId || context.projectContext.activeLevelId;
        if (!levelId) return { ok: false, reason: 'Missing levelId' };

        const level = context.bimManager.getLevelById(levelId);
        if (!level) return { ok: false, reason: `Level ${levelId} not found` };

        if (!this.payload.footprint || this.payload.footprint.polygon.length < 3) {
            return { ok: false, reason: 'footprint.polygon requires at least 3 vertices' };
        }
        if (this.payload.thickness <= 0) {
            return { ok: false, reason: 'thickness must be > 0' };
        }
        if (this.payload.overhang < 0) {
            return { ok: false, reason: 'overhang must be >= 0' };
        }
        if (this.payload.roofType !== 'flat' && this.payload.slope !== undefined && this.payload.slope <= 0) {
            return { ok: false, reason: 'slope must be > 0 for non-flat roof types' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const levelId = this.payload.levelId || context.projectContext.activeLevelId;
        const level = context.bimManager.getLevelById(levelId);
        if (!level) throw new Error(`SpatialAuthorityError: Level ${levelId} not found`);

        const now = Date.now();

        // P3.3 — Auto Base Offset: compute from tallest wall on level, fallback to payload value
        let effectiveBaseOffset = this.payload.baseOffset;
        if (this.payload.autoBaseOffset) {
            try {
                const levelWalls = context.stores.wallStore.getByLevel(levelId);
                if (levelWalls.length > 0) {
                    const maxH = Math.max(...levelWalls.map((w: any) => w.height ?? 0), 2.7);
                    effectiveBaseOffset = maxH;
                    console.log(`[CreateRoofCommand] autoBaseOffset: computed ${effectiveBaseOffset}m from ${levelWalls.length} walls`);
                }
            } catch (e) {
                console.warn('[CreateRoofCommand] autoBaseOffset: wall height lookup failed, using payload value', e);
            }
        }

        const roofData: RoofData = {
            id:        this.roofId,
            type:      'roof',
            levelId,
            parentId:  levelId,
            footprint: this.payload.footprint,
            roofType:  this.payload.roofType,
            slope:     this.payload.slope,
            overhang:  this.payload.overhang,
            baseOffset: effectiveBaseOffset,
            thickness:  this.payload.thickness,
            fascia:     this.payload.fascia,
            autoBaseOffset: this.payload.autoBaseOffset,
            materialColor: this.payload.materialColor ?? '#c8a46e',
            materialId:    this.payload.materialId,
            properties: {},
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  'system',
                version:    1,
            },
        };

        context.stores.roofStore.add(roofData);
        context.bimManager.registerElement(this.roofId, levelId);
        elementRegistry.registerSemantic(this.roofId, 'roof');

        // P3.6 — Topology Layer stub (no-op until Core team delivers TopologyGraph)
        const poly = roofData.footprint.polygon;
        const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
        context.topologyGraph?.addNode(this.roofId, 'roof', {
            footprint: roofData.footprint,
            levelId,
            bounds: {
                minX: Math.min(...xs), maxX: Math.max(...xs),
                minZ: Math.min(...zs), maxZ: Math.max(...zs),
            },
        });

        this.createdId = this.roofId;
        this.targetIds = [this.roofId];

        // Gap 7 — SemanticGraph: roof sitsOn its level.
        // Enables DependencyResolver to find all roofs on a level and
        // powers IFC IfcRelContainedInSpatialStructure for roof elements.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: this.roofId,
                targetId: levelId,
                createdBy: 'CreateRoofCommand',
                metadata: { addedBy: 'CreateRoofCommand', roofType: this.payload.roofType }
            });
        } catch (err) {
            console.warn('[CreateRoofCommand] SemanticGraph write failed (non-fatal):', err);
        }

        return {
            success: true,
            affectedElementIds: [this.roofId],
            info: [`Roof created on level ${levelId} with baseOffset ${this.payload.baseOffset}m`],
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };

        elementRegistry.unregister(this.createdId);
        context.bimManager.unregisterElement(this.createdId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreateRoofCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        context.stores.roofStore.remove(this.createdId);

        return { success: true, affectedElementIds: [this.createdId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { roofId: this.roofId, ...this.payload },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
