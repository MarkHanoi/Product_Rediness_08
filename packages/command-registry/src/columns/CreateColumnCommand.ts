/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             §COLUMN-AUDIT-2026 §M1 + §M3 — Determinism Hardening
 * Files Modified:    CreateColumnCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     No — same observable column on first execute.
 *   Constraint Impact:   No
 *   Store Registry Impact: No
 *   Undo/Redo Impact:    Yes — properties.mark and ifcData.guid are now
 *                              stable across redo() AND across collaboration
 *                              wire serialisation (constructor pre-generates
 *                              both, both included in serialize().payload).
 *
 * Risk Level:   Low
 * Rationale:
 *   §M1 — properties.mark used to be regenerated inside execute() via
 *         generateMark(). On redo (which defaults to re-running execute) the
 *         mark would re-increment if other columns had been added/removed in
 *         between. Now generated once in the constructor and cached on
 *         this._cachedMark.
 *
 *   §M3 — ifcData.guid used to be generated inside execute() via
 *         crypto.randomUUID(). On redo or on collaborator deserialisation it
 *         would diverge from the original. Now generated once in the
 *         constructor and INCLUDED in serialize().payload so collaborators
 *         create the column with the same GUID.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { ColumnData } from '@pryzm/geometry-column';
import { resolveSlabBaseOffsetForPoint } from '@pryzm/geometry-column';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { generateMark } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface CreateColumnPayload {
    id?: string;
    position: { x: number; y: number; z: number };
    height: number;
    rotation: number;
    profile: 'rectangular' | 'circular' | 'UC' | 'UB';
    width: number;
    depth: number;
    baseOffset: number;
    levelId: string;
    materialId?: string;
    materialColor?: string;
    steelProfileName?: string;
    /**
     * §M3 (audit fix): IFC GUID is generated in the command constructor and
     * carried on the payload so collaborators reconstruct the column with the
     * same GUID. Optional on the wire to allow legacy callers to omit it; the
     * constructor will then mint a fresh one.
     */
    ifcGuid?: string;
    /**
     * §M1 (audit fix): properties.mark is no longer recomputed inside
     * execute(). Callers may pre-supply a mark; otherwise the command will
     * compute one once at execute()-time and cache it for redo / serialise.
     * This field is populated on the wire by serialize() so collaborators
     * see the same human-readable mark.
     */
    mark?: string;
}

export class CreateColumnCommand implements Command {
    readonly affectedStores = ["column", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_COLUMN;
    readonly timestamp: number;
    readonly targetIds: string[];

    private createdId?: string;
    private _cachedGuid: string;
    private _cachedMark?: string;

    constructor(private payload: CreateColumnPayload) {
        // §M3: pre-generate (or accept caller-provided) ifcData.guid.
        this._cachedGuid = payload.ifcGuid ?? crypto.randomUUID();
        // §M1: a caller-provided mark wins; otherwise it is computed once on
        //      first execute() and cached for redo / serialise.
        this._cachedMark = payload.mark;

        this.payload = {
            ...payload,
            id: payload.id ?? crypto.randomUUID(),
            ifcGuid: this._cachedGuid,
        };
        this.id = `cmd-column-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [this.payload.id!];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) return { ok: false, reason: 'Missing levelId' };
        const level = ctx.bimManager.getLevelById(this.payload.levelId);
        if (!level) return { ok: false, reason: `Level not found: ${this.payload.levelId}` };
        if (this.payload.height <= 0) return { ok: false, reason: 'Height must be positive' };
        if (this.payload.width <= 0) return { ok: false, reason: 'Width must be positive' };
        if (this.payload.depth <= 0) return { ok: false, reason: 'Depth must be positive' };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const id = this.payload.id!;
        const level = ctx.bimManager.getLevelById(this.payload.levelId);
        if (!level) return { success: false, affectedElementIds: [] };

        // §M1: mark is generated lazily on first execute() then cached so
        //      subsequent redo() invocations reuse the same value.
        if (!this._cachedMark) {
            this._cachedMark = generateMark('column', this.payload.levelId, {
                getLevels: () => ctx.bimManager.getLevels(),
                countElementsOnLevel: (_type, lvlId) =>
                    ctx.stores.columnStore.getAll().filter((c) => c.levelId === lvlId).length,
            });
        }
        const mark = this._cachedMark;

        // §SLAB-BASE (Contract 02 §2.5 / Column Contract §03):
        //   worldY = level.elevation + slabBaseOffset + (column.baseOffset ?? 0)
        // The slab probe runs against the column's world (x, z) on this level.
        // When no slab covers the column, slabOff is 0 and behaviour is identical
        // to the legacy "sit on level datum" formula. When a slab IS present,
        // the column base sits flush on the slab top face — matching Walls,
        // and matching the user's mental model of "place on the visible floor".
        const slabStore = (ctx.stores as any).slabStore;
        const slabOff = slabStore
            ? resolveSlabBaseOffsetForPoint(
                this.payload.levelId,
                this.payload.position.x,
                this.payload.position.z,
                slabStore,
            )
            : 0;
        const elevation = (level as any).elevation ?? 0;

        const column: ColumnData = {
            id,
            type: 'column',
            // Point3D DTO — builder reconstructs THREE.Vector3 at render time.
            // Y is the FLOOR-FACE elevation (level datum + slab top face). The
            // builder adds column.baseOffset on top to produce the final root.y.
            position: {
                x: this.payload.position.x,
                y: elevation + slabOff,
                z: this.payload.position.z
            },
            height: this.payload.height,
            rotation: this.payload.rotation,
            profile: this.payload.profile,
            width: this.payload.width,
            depth: this.payload.depth,
            baseOffset: this.payload.baseOffset,
            levelId: this.payload.levelId,
            parentId: this.payload.levelId,
            materialId: this.payload.materialId,
            materialColor: this.payload.materialColor,
            steelProfileName: this.payload.steelProfileName,
            properties: { mark },
            // §M3: GUID was generated once in the constructor and carried on
            //      the payload — same value on redo + on collaborator side.
            ifcData: {
                guid: this._cachedGuid,
                ifcClass: 'IfcColumn',
            },
        };

        ctx.stores.columnStore.add(column);
        ctx.bimManager.registerElement(id, this.payload.levelId);
        elementRegistry.registerSemantic(id, 'column');
        this.createdId = id;

        // Gap 7 — SemanticGraph: column sitsOn its level.
        // The sitsOn relationship enables DependencyResolver to find all structural
        // elements on a level without a full store scan, and powers IFC IfcRelContainedInSpatialStructure.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: id,
                targetId: this.payload.levelId,
                createdBy: 'CreateColumnCommand',
                metadata: { addedBy: 'CreateColumnCommand' }
            });
        } catch (err) {
            console.warn('[CreateColumnCommand] SemanticGraph write failed (non-fatal):', err);
        }

        console.log(`[CreateColumnCommand] Created column ${id} (mark=${mark}, guid=${this._cachedGuid})`);
        return { success: true, affectedElementIds: [id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };
        ctx.stores.columnStore.remove(this.createdId);
        try {
            ctx.bimManager.unregisterElement(this.createdId);
        } catch {
            /* may already be missing */
        }
        elementRegistry.unregister(this.createdId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreateColumnCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        return { success: true, affectedElementIds: [this.createdId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            // §M3 / §M1: ifcGuid AND mark are part of the wire payload so
            // collaborators construct the same column.
            payload: {
                ...this.payload,
                ifcGuid: this._cachedGuid,
                mark: this._cachedMark,
            } as Record<string, unknown>,
            version: 1
        };
    }
}
