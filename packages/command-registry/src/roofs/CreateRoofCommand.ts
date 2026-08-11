import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { RoofData, RoofType, RoofFootprint, resolveRoofLevel } from '@pryzm/geometry-roof';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';

/**
 * §ROOF-UPPER-LEVEL — how this command turns `payload.levelId` into the level the
 * roof is STAMPED with.
 *
 *  - `'explicit'` (default): the payload names the level. Used by everything that
 *    already knows the answer — the project loader, IFC import, the AI service
 *    (which picks the highest level itself), and undo/redo replay of a command
 *    whose level was already resolved. Pre-existing behaviour, unchanged.
 *  - `'upper'`: the payload names the level the user DREW ON, and the command
 *    re-homes the roof to the level immediately above it (founder ruling
 *    2026-08-09). Used by the interactive roof tools.
 */
export type RoofLevelPolicy = 'explicit' | 'upper';

export interface CreateRoofPayload {
    /**
     * With `levelPolicy: 'explicit'` (default) — the level to stamp.
     * With `levelPolicy: 'upper'` — the level the roof was DRAWN ON; the command
     * resolves the level above it.
     */
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
    /**
     * §ROOF-UPPER-LEVEL — level-resolution policy. Defaults to `'explicit'` so
     * every existing caller (loader, IFC import, AI, replay) keeps its behaviour.
     */
    levelPolicy?: RoofLevelPolicy;
    /**
     * §PERSIST-L1 (W1-2) — the roof's ORIGINAL IFC GUID. `ifcData.guid` is the
     * IFC round-trip join key: it is what an exported IFC file, a BCF issue or a
     * Revit round-trip uses to find this roof again. It is AUTHORED — minted
     * once as a `crypto.randomUUID()` and not recomputable from `roofId` — so a
     * restore that does not carry it forward silently breaks that
     * correspondence.
     *
     * Absent (a genuinely new roof), the command mints one at construction, so
     * the value is also stable across undo+redo. Previously the guid was minted
     * inside `RoofStore.add()`, i.e. after undo had discarded the record.
     */
    ifcGuid?: string;
}

export class CreateRoofCommand implements Command {
    readonly affectedStores = ["roof", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_ROOF;
    readonly timestamp: number;
    targetIds: string[];

    private readonly roofId: string;
    private createdId?: string;

    // §ROOF-UPPER-LEVEL — the level policy is applied EXACTLY ONCE, on the first
    // execute, and the outcome is frozen here. C16 (working inverse): redo after
    // undo, and any later serialize/replay, must reproduce the SAME level and the
    // SAME baseOffset — re-running the resolver would silently re-home the roof
    // again if the level set had changed in between.
    private resolvedLevelId?: string;
    private resolvedBaseOffset?: number;

    /** §PERSIST-L1 (W1-2) — stable IFC GUID; see `CreateRoofPayload.ifcGuid`. */
    private readonly _ifcGuid: string;

    constructor(roofId: string, private payload: CreateRoofPayload) {
        this.id = `cmd-roof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.roofId = roofId;
        this.targetIds = [roofId];
        // §PERSIST-L1 (W1-2) — adopt the supplied GUID, mint only in its absence,
        // and echo it back onto `payload` so `serialize()` (which spreads it)
        // forwards the SAME guid to every collaboration peer and to replay.
        this._ifcGuid = payload.ifcGuid ?? crypto.randomUUID();
        this.payload = { ...payload, ifcGuid: this._ifcGuid };
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
        // The level the roof was drawn on. Under `levelPolicy: 'upper'` this is the
        // ORIGIN, not the answer — the walls it is being capped by live here.
        const originLevelId = this.payload.levelId || context.projectContext.activeLevelId;
        const originLevel = context.bimManager.getLevelById(originLevelId);
        if (!originLevel) throw new Error(`SpatialAuthorityError: Level ${originLevelId} not found`);

        const now = Date.now();

        // P3.3 — Auto Base Offset: compute from tallest wall on level, fallback to payload value.
        // ⚠ Queried against the ORIGIN level: the walls the roof sits on are the ones
        // of the storey below, not of the level the roof will end up owned by.
        let effectiveBaseOffset = this.payload.baseOffset;
        if (this.payload.autoBaseOffset) {
            try {
                const levelWalls = context.stores.wallStore.getByLevel(originLevelId);
                if (levelWalls.length > 0) {
                    const maxH = Math.max(...levelWalls.map((w: any) => w.height ?? 0), 2.7);
                    effectiveBaseOffset = maxH;
                    console.log(`[CreateRoofCommand] autoBaseOffset: computed ${effectiveBaseOffset}m from ${levelWalls.length} walls`);
                }
            } catch (e) {
                console.warn('[CreateRoofCommand] autoBaseOffset: wall height lookup failed, using payload value', e);
            }
        }

        // ── §ROOF-UPPER-LEVEL — resolve which level OWNS this roof ────────────
        //
        // Founder ruling 2026-08-09: a roof belongs to the level immediately ABOVE
        // the one it was created on. The roof does NOT move: world-Y is
        // `level.elevation + baseOffset` (RoofFragmentBuilder), so re-homing one
        // level up is compensated by subtracting the elevation gap from baseOffset.
        // Ownership changes; geometry stays exactly where it was drawn.
        let levelId = originLevelId;
        const policyNotes: string[] = [];
        if (this.resolvedLevelId !== undefined) {
            // Redo / replay — reuse the frozen outcome (C16 working inverse).
            levelId = this.resolvedLevelId;
            effectiveBaseOffset = this.resolvedBaseOffset ?? effectiveBaseOffset;
        } else if (this.payload.levelPolicy === 'upper') {
            const levels = context.bimManager.getLevels();
            const resolution = resolveRoofLevel(originLevelId, levels);
            levelId = resolution.levelId;
            effectiveBaseOffset -= resolution.elevationDelta;
            if (resolution.reHomed) {
                policyNotes.push(
                    `Roof assigned to the level above ${originLevelId} → ${levelId} ` +
                    `(§ROOF-UPPER-LEVEL; baseOffset compensated by ${resolution.elevationDelta}m).`,
                );
            } else {
                // The topmost level (this includes the single-level project): there
                // is no level above. The roof is kept on the level it was drawn on
                // rather than inventing a level the user never asked for, or
                // refusing and losing their work. Said out loud, never silent.
                policyNotes.push(
                    `Roof kept on ${originLevelId}: no level above it (${resolution.reason}). ` +
                    `Add a level above and re-assign the roof if it should belong there.`,
                );
                console.warn(`[CreateRoofCommand] §ROOF-UPPER-LEVEL: ${policyNotes[0]}`);
            }
            this.resolvedLevelId = levelId;
            this.resolvedBaseOffset = effectiveBaseOffset;
        }

        if (!context.bimManager.getLevelById(levelId)) {
            throw new Error(`SpatialAuthorityError: Level ${levelId} not found`);
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
            // §PERSIST-L1 (W1-2) — stamp the GUID resolved at construction time so a
            // restored roof keeps the guid it was saved with, and redo re-stamps the
            // same one. The `RoofStore.add()` fallback now only fires for legacy /
            // AI-bypass roofs that arrive without an ifcData block.
            ifcData: {
                guid:     this._ifcGuid,
                ifcClass: 'IfcRoof',
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
            info: [
                `Roof created on level ${levelId} with baseOffset ${effectiveBaseOffset}m`,
                ...policyNotes,
            ],
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
        // §ROOF-UPPER-LEVEL — serialise the RESOLVED outcome, never the policy.
        // A persisted or replayed roof already knows which level it belongs to;
        // re-running the resolver on load would walk the roof up one level on
        // every round-trip.
        return {
            type:      this.type,
            payload:   {
                roofId: this.roofId,
                ...this.payload,
                levelId:    this.resolvedLevelId ?? this.payload.levelId,
                baseOffset: this.resolvedBaseOffset ?? this.payload.baseOffset,
                levelPolicy: 'explicit' as RoofLevelPolicy,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
