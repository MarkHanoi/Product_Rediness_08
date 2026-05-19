import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';
import { SlabSketch } from '@pryzm/geometry-slab';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface CreateSlabPayload {
    id?: string;
    /**
     * §2.6 IFC GUID STABILITY: Pre-generate this in the calling tool alongside `id`.
     * If present, `execute()` uses this value — IFC GUID is then stable across
     * all execute/undo/redo cycles. If absent (legacy callers), execute() falls
     * back to `id`, logging a warning.
     */
    ifcGuid?: string;
    width: number;
    depth: number;
    thickness: number;
    position: { x: number, y: number, z: number };
    levelId: string;
    polygon?: { x: number, y: number }[];
    holes?: { x: number, y: number }[][];
    /**
     * Optional parametric sketch. When present, the builder resolves edge
     * references at projection time, enabling Revit-style host-boundary association.
     */
    sketch?: SlabSketch;
}

export class CreateSlabCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_SLAB;
    readonly timestamp: number;
    targetIds: string[];
    private createdId?: string;
    // M5 §SLAB-SYSTEM-AUDIT-2026: Stable mark generated on first execute() and
    // reused on every subsequent redo so the mark does not change across cycles.
    private _stableMark?: string;

    constructor(private payload: CreateSlabPayload) {
        this.id = `cmd-slab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = payload.id ? [payload.id] : [];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const levelId = this.payload.levelId || _context.projectContext.activeLevelId;
        if (!levelId) return { ok: false, reason: "Missing levelId" };
        if (!this.payload.polygon && !this.payload.sketch && (this.payload.width <= 0 || this.payload.depth <= 0)) {
            return { ok: false, reason: "Invalid dimensions" };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §01 §2.6: ID must be stable across execute/undo/redo.
        // The tool or batch command MUST inject a pre-generated id in the payload.
        // The fallback crypto.randomUUID() is retained only as a last resort guard and
        // will log a warning so the violation is visible in development.
        if (!this.payload.id) {
            console.warn(
                '[CreateSlabCommand] §01 §2.6: No id injected in payload. ' +
                'A new UUID is being generated inside execute() which breaks redo symmetry. ' +
                'Always pass id: crypto.randomUUID() from the calling tool or batch command.'
            );
        }
        const slabId = this.payload.id || crypto.randomUUID();

        const targetLevelId = this.payload.levelId || context.projectContext.activeLevelId;
        if (!targetLevelId) {
            throw new Error("SpatialAuthorityError: Missing levelId");
        }

        const level = context.bimManager.getLevelById(targetLevelId);
        if (!level) {
            throw new Error(`SpatialAuthorityError: Level ${targetLevelId} not found`);
        }

        // §01 §2.1 — Spatial registration belongs to the command layer.
        context.bimManager.registerElement(slabId, targetLevelId);

        // §02 §2.3 — Register in ElementRegistry (semantic layer).
        // Guard against duplicate registration on redo.
        try {
            elementRegistry.registerSemantic(slabId, 'slab');
        } catch {
            // Already registered (e.g. redo path) — safe to ignore.
        }

        // §01 §2.6 FIX (C2): IFC GUID must be stable across execute/undo/redo.
        // Use the pre-generated `ifcGuid` from the payload (set by the tool or batch
        // command before constructing this command). Fall back to `slabId` only if
        // `ifcGuid` was not injected — this is for legacy callers; log a warning so
        // the gap is visible. DO NOT call crypto.randomUUID() here.
        if (!this.payload.ifcGuid) {
            console.warn(
                '[CreateSlabCommand] §2.6 C2: ifcGuid not injected in payload. ' +
                'IFC GUID will use slabId as fallback — stable on redo, but not a true IFC GUID. ' +
                'Always pass ifcGuid: crypto.randomUUID() from the calling tool or batch command.'
            );
        }
        // §02 §1.2 FIX: Store position.y = 0. The builder resolves the authoritative
        // world Y at projection time by querying BimManager.getLevelById(levelId).elevation.
        // M5 §SLAB-SYSTEM-AUDIT-2026: Pre-generate properties.mark before calling
        // slabStore.add() so the mark is stable across undo/redo cycles.
        // SlabStore.add() skips mark generation when properties.mark is already set,
        // so the store-side fallback never fires for commands created this way.
        if (!this._stableMark) {
            const existingCount = context.stores.slabStore.getAll().length;
            this._stableMark = `SB${(existingCount + 1).toString().padStart(3, '0')}`;
        }

        const slabData: SlabData = {
            id: slabId,
            type: 'slab',
            width: this.payload.width,
            depth: this.payload.depth,
            thickness: this.payload.thickness,
            materialColor: "#808080",
            position: { x: this.payload.position.x, y: 0, z: this.payload.position.z },
            levelId: targetLevelId,
            parentId: targetLevelId,
            properties: { mark: this._stableMark },
            ifcData: {
                guid: this.payload.ifcGuid ?? slabId,
                ifcClass: 'IfcSlab'
            },
            polygon: this.payload.polygon ? this.payload.polygon.map(p => ({ x: p.x, y: p.y })) : undefined,
            holes: this.payload.holes ? this.payload.holes.map(h => h.map(p => ({ x: p.x, y: p.y }))) : undefined,
            sketch: this.payload.sketch ? structuredClone(this.payload.sketch) : undefined
        };

        context.stores.slabStore.add(slabData);

        // Gap 7 — SemanticGraph: slab sitsOn its level.
        // Enables DependencyResolver to find all slabs on a level without a full store scan
        // and powers IFC IfcRelContainedInSpatialStructure export.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: slabId,
                targetId: targetLevelId,
                createdBy: 'CreateSlabCommand',
                metadata: { addedBy: 'CreateSlabCommand' }
            });
        } catch (err) {
            console.warn('[CreateSlabCommand] SemanticGraph write failed (non-fatal):', err);
        }

        this.createdId = slabId;
        this.targetIds = [slabId];

        return {
            success: true,
            affectedElementIds: [slabId],
            info: [`Slab created on level ${targetLevelId}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };

        // §01 §2.1 — Undo removes from both spatial authority and semantic registry.
        context.bimManager.unregisterElement(this.createdId);
        elementRegistry.unregister(this.createdId);

        context.stores.slabStore.remove(this.createdId);

        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreateSlabCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }

        return {
            success: true,
            affectedElementIds: [this.createdId]
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
