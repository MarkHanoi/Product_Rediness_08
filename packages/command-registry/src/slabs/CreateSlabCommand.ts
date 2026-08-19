import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { stableCreatedId } from '../StableCreatedId';
import type { SlabData } from '@pryzm/geometry-slab';
import type { SlabSketch } from '@pryzm/geometry-slab';
import type { SlabLayer } from '@pryzm/geometry-slab';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
// §FIX-STAIR-SLAB-OPENING-SYMMETRY — the stair-void invariant has ONE owner; this
// command is its slab-side caller (see StairSlabOpeningReconciler for the rule).
import {
    reconcileStairOpeningsForSlab,
    removeStairOpenings,
    type StairOpeningCarve,
} from '../stair/StairSlabOpeningReconciler';

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
    /**
     * ⭐ C100 §2.1 / ARM E — the slab's MATERIAL, and why it is on the payload.
     *
     * `serializeSlab()` has always written `materialId` AND `materialColor`. This
     * payload listed NEITHER, and `execute()` hard-coded `materialColor: "#808080"`.
     * So a slab's material was present in the saved file and ABSENT from the reloaded
     * slab — every reopened project silently repainted its slabs mid-grey.
     *
     * ⭐ That is the worst shape a persistence defect takes, because the evidence a
     * reviewer reaches for — open the JSON, find the id — says it worked.
     * §COMMITTED-IS-NOT-REACHABLE: the user's evidence is the reload, never the file.
     * C100 §9.7 found it on ARM E's FIRST run, having stood as declared-but-unmeasured
     * debt ("it does not check ProjectLoader's read side") until someone built the arm.
     *
     * Both are OPTIONAL, so every existing caller — the slab tool, the batch
     * generators, the apartment engine — is unchanged and still lands on the same
     * grey default. Only a caller that HAS a material now keeps it.
     */
    materialId?: string;
    materialColor?: string;
    /**
     * ⭐ L-1178 / C92 §10 — the slab's ASSEMBLY and its VERTICAL POSITION, and why
     * these four are here.
     *
     * `serializeSlab()` writes `baseOffset`, `layers`, `systemTypeId` and
     * `properties` (`ProjectSerializer.ts:646-653`). This payload listed NONE of
     * them and `execute()` hard-coded `properties: { mark }`, so `ProjectLoader` —
     * the ONLY slab restore path — could not carry them even though it held them.
     * The C100/ARM E material fix (L-1127) named these four as "measured while
     * fixing this, NOT fixed here" and left them to the slab lane. This is that.
     *
     * ⭐ `baseOffset` IS THE FOUNDER'S OWN FIELD. C92 §10: the slab datum is the TOP
     * face and `baseOffset` raises it above the level elevation, so a dropped
     * `baseOffset` silently defaults to 0 and THE SLAB IS AT A DIFFERENT HEIGHT ON
     * RELOAD. That is the same sentence the founder used for L-1177 — "the slab is
     * displaced" — arriving by a completely different route. One is a live-edit
     * defect, this one is a persistence defect; they are independent and both real.
     *
     * `layers` is the reason a slab has its thickness build-up at all (C92 §5 row
     * 14 records it as UNREACHABLE FROM THE BUS), and `systemTypeId` is the TYPE
     * IDENTITY beside it — dropping the id while keeping the layer snapshot leaves
     * an assembly nothing can rename or re-schedule, the same loss C100 §2.1 names
     * for materials.
     *
     * All four are OPTIONAL, so every existing caller is unchanged.
     */
    baseOffset?: number;
    layers?: SlabLayer[];
    systemTypeId?: string | null;
    properties?: Record<string, unknown>;
}

export class CreateSlabCommand implements Command {
    // §FIX-STAIR-SLAB-OPENING-SYMMETRY — creating a slab over an existing stair
    // now also writes an `opening`, so the scope must say so (C16: a command
    // declares every store it mutates). `CreateStairCommand` already declares the
    // mirror scope `[stair, opening, slab]`.
    readonly affectedStores = ["slab", "level", "opening"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_SLAB;
    readonly timestamp: number;
    targetIds: string[];
    private createdId?: string;
    // M5 §SLAB-SYSTEM-AUDIT-2026: Stable mark generated on first execute() and
    // reused on every subsequent redo so the mark does not change across cycles.
    private _stableMark?: string;
    /**
     * §FIX-STAIR-SLAB-OPENING-SYMMETRY — auto-openings this slab carved for stairs
     * that already existed beneath it, retained so `undo()` removes them with the
     * slab (P6: the opening is undoable as part of the command that produced it).
     */
    private _stairCarves: StairOpeningCarve[] = [];

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
        // §STABLE-CREATED-ID (C03 §2.6) — the last-resort fallback below is now
        // memoised per command instance, so even when a tool forgets to inject an id
        // (the warning above) undo -> redo still round-trips the SAME slab id
        // instead of minting a fresh one on every redo.
        const slabId = stableCreatedId(this, 'slab', this.payload.id);

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
            // ⭐ C100 §2.1 — the persisted material wins; the grey stays as the
            // default for a slab that never named one. Per §2.1 `materialId` is the
            // IDENTITY and the colour beside it is a CACHE, so both are carried:
            // dropping the id would leave a hex nothing can rename, re-schedule or
            // export (C25/C28), which is the loss §2.1's MUST NOT names.
            materialId: this.payload.materialId,
            materialColor: this.payload.materialColor ?? "#808080",
            position: { x: this.payload.position.x, y: 0, z: this.payload.position.z },
            levelId: targetLevelId,
            parentId: targetLevelId,
            // ⭐ L-1178 — the persisted ASSEMBLY and VERTICAL POSITION survive the
            // reload. `baseOffset` is C92 §10's datum offset (the founder's "bottom
            // offset"); dropping it silently defaulted the slab to 0 and moved it.
            baseOffset: this.payload.baseOffset,
            layers: this.payload.layers ? this.payload.layers.map(l => ({ ...l })) : undefined,
            systemTypeId: this.payload.systemTypeId,
            // The persisted `properties` are carried, and the MARK inside them wins
            // over a freshly minted one: a reloaded slab must keep the mark it was
            // saved with, or every reopen renumbers the schedule. `_stableMark` stays
            // the fallback for a slab that never had one (and SlabStore.add() skips
            // its own mark generation when `properties.mark` is already set).
            properties: {
                ...(this.payload.properties ?? {}),
                mark: (this.payload.properties?.['mark'] as string | undefined) ?? this._stableMark,
            },
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

        // ── §FIX-STAIR-SLAB-OPENING-SYMMETRY ─────────────────────────────────
        // The stair-void invariant is symmetric in time: a stair authored BEFORE
        // its slab must get its void the moment the slab appears. Previously only
        // the slab-first direction was implemented (inside CreateStairCommand),
        // so the founder's `CREATE_SLABS_ON_ALL_FLOORS` laid two slabs over levels
        // that already hosted stairs and carved nothing.
        //
        // Cost is O(stairs on this level) and ends in ONE slabStore.triggerRebuild
        // for the whole set, so this stays a single SlabFragmentBuilder pass inside
        // the BatchCoordinator window the caller already opened — never one rebuild
        // per hole.
        try {
            this._stairCarves = reconcileStairOpeningsForSlab(context, slabId, targetLevelId);
        } catch (err) {
            // Non-fatal: a slab must still be created if the reconcile fails.
            console.warn('[CreateSlabCommand] stair-opening reconcile failed (non-fatal):', err);
            this._stairCarves = [];
        }

        return {
            success: true,
            affectedElementIds: [slabId, ...this._stairCarves.map(c => c.openingId)],
            info: [
                `Slab created on level ${targetLevelId}`,
                ...(this._stairCarves.length > 0
                    ? [`Carved ${this._stairCarves.length} stair opening(s)`]
                    : []),
            ]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };

        // §01 §2.1 — Undo removes from both spatial authority and semantic registry.
        // §FIX-STAIR-SLAB-OPENING-SYMMETRY — drop the auto-openings this slab
        // carved BEFORE the slab itself, so no opening is ever left hosted on a
        // slab that no longer exists.
        removeStairOpenings(context, this._stairCarves);
        this._stairCarves = [];

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
