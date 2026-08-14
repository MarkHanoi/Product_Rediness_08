import type { Patch } from 'immer';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { producePatchedSlice, applyPatchesToSlice } from '../PatchSnapshot';
import type { FloorData, FloorSketch, FloorSketchEdge, FloorVertex } from '@pryzm/core-app-model';

/**
 * Deep copy returning PLAIN, UNFROZEN objects — the defensive copy this command
 * needs at both handoffs to the store.
 *
 * Why not `structuredClone`: `check-structuredclone-new-commands` (G-NEW-05)
 * prohibits it here; undo capture moved to Immer `produceWithPatches`.
 *
 * Why not just hand the Immer result to the store: Immer AUTO-FREEZES what it
 * produces (nothing in this repo calls `setAutoFreeze(false)`), and both finish
 * stores WRITE THROUGH the object they are given — `FloorStore.update` does
 * `delete (updates as any).levelId`, `CeilingStore.update` additionally does
 * `delete (updates as any).holeElements` and
 * `clone.boundary.polygon = ensureCCW(clone.boundary.polygon)` after
 * `Object.assign`. On a frozen input those are TypeErrors in strict mode, i.e. a
 * broken undo on a live, founder-visible path. Every value that leaves this
 * command for the store therefore passes through here first.
 *
 * Own enumerable string keys only, explicit `undefined` preserved — the same
 * surface `structuredClone` gave for this payload, which is plain JSON data by
 * construction (it round-trips through `SerializedCommand`).
 */
function deepCopy<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => deepCopy(v)) as unknown as T;
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as object)) {
            out[key] = deepCopy((value as Record<string, unknown>)[key]);
        }
        return out as unknown as T;
    }
    return value;
}

/**
 * UpdateFloorBoundaryCommand — §FINISH-FOLLOWS-WALL (GR-12 · C79 §4/§5 · C72 §0.3)
 *
 * The floor-finish half of the write path that makes a moved wall re-project a
 * hosted finish THE SAME WAY it re-projects a slab (§FIX-SLAB-TRACKER-EVENT-SHAPE,
 * commit 798f2cfd). The slab's ledger row was explicit about the missing piece:
 * *"the write-back must go through a command (P6), not a store write from inside
 * the tracker"* (move-propagation.json, slab A2). This command is that write-back
 * for floors. The GEOMETRY is computed upstream by
 * `@pryzm/finish-host-tracker` (`reprojectFinishBoundary` + `FinishSegmentAdapter`)
 * — this command stays focused on transactional store mutation, exactly as
 * `DegradeSlabSketchCommand` keeps `WallFaceResolver` logic in the tracker.
 *
 * TWO MODES, one enum member, and why that is deliberate:
 *
 *   'reproject' — a bounding wall MOVED and the boundary was re-derived from the
 *       sketch's host references (C79 §5.1). `nonUndoable: true`: the re-projection
 *       is DERIVED state maintenance, not a user gesture. Undoing the WALL move
 *       fires the wall store's 'update' again and the tracker re-projects back —
 *       pushing this onto the undo stack would break one-gesture-one-undo and
 *       leave the user undoing N ghost entries per wall drag. (Command.nonUndoable
 *       exists for exactly this: "automatic background operations that are
 *       side-effects of user actions", ../types.ts.)
 *
 *   'degrade' — a bounding wall was REMOVED and the host references pointing at it
 *       collapse to freeLine edges at their last known geometry. C79 §4.2 REQUIRES
 *       this to be undoable ("Degradation MUST go through an undoable command"):
 *       Ctrl+Z on the wall deletion also restores the floor's HostReferenceEdges.
 *       Mirrors `DegradeSlabSketchCommand` including the pre-mutation snapshot.
 *
 * The type is `CommandType.UPDATE_FLOOR_BOUNDARY` — an existing enum member
 * (types.ts:308) with an existing PlanOrdering entry (PlanOrdering.ts:264) that no
 * command class claimed until now. Degradation is a boundary-sketch state change
 * and re-projection is a boundary geometry change; both are updates OF THE FLOOR
 * BOUNDARY, and the payload's `mode` + `cause` carry the distinction a reader
 * needs (C79 §4.4: a degraded edge must keep its cause — `cause.wallId` is it).
 */
export interface UpdateFloorBoundaryPayload {
    floorId: string;
    mode: 'reproject' | 'degrade';
    /** New boundary ring (world X-Z). Required for 'reproject'; absent for 'degrade'
     *  (C79 §4.1: deleting a bounding element must NOT move the derived element —
     *  the geometry stays; only the references degrade). */
    polygon?: FloorVertex[];
    /** Replacement outer-loop sketch edges, index-aligned with `polygon`. Host-edge
     *  fallbacks are expected FRESH (§4.3) on 'reproject'; degraded to freeLine on
     *  'degrade'. Inner loops are preserved untouched. */
    outerLoopEdges?: FloorSketchEdge[];
    /** Why this write happened. Named, never inferred (C79 §4.4 / C75). */
    cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' };
}

export class UpdateFloorBoundaryCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_FLOOR_BOUNDARY;
    readonly timestamp: number;
    targetIds: string[];

    /** 'reproject' is derived-state maintenance and must NOT occupy an undo slot;
     *  'degrade' is C79 §4.2-mandated undoable. See the class doc. */
    readonly nonUndoable: boolean;

    /**
     * Immer INVERSE PATCHES for the record this command rewrote (G-NEW-05), the
     * patch-based form of the pre-mutation snapshot `DegradeSlabSketchCommand`
     * keeps. Undo applies them to the floor's CURRENT record, reconstructing the
     * pre-execute record byte-equal — pinned by
     * `__tests__/updateFloorBoundaryUndoRoundtrip.test.ts`, which was watched
     * green against the snapshot-clone implementation before this migration.
     * Patches cannot alias the record about to be mutated: their values are read
     * off the untouched base by `produceWithPatches`.
     */
    private inversePatches?: readonly Patch[];

    constructor(private payload: UpdateFloorBoundaryPayload) {
        this.id = `cmd-update-floor-boundary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.floorId];
        this.nonUndoable = payload.mode === 'reproject';
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = context.stores.floorStore;
        if (!store) {
            return { ok: false, reason: 'floorStore is not registered on this CommandContext — cannot update floor boundary.' };
        }
        const floor = store.getById(this.payload.floorId);
        if (!floor) {
            return { ok: false, reason: `Floor "${this.payload.floorId}" not found — cannot update boundary.` };
        }
        if (this.payload.mode === 'reproject') {
            if (!this.payload.polygon || this.payload.polygon.length < 3) {
                return { ok: false, reason: `Re-projection for floor "${this.payload.floorId}" carries ${this.payload.polygon?.length ?? 0} vertices — a boundary needs at least 3.` };
            }
        }
        if (!this.payload.outerLoopEdges || this.payload.outerLoopEdges.length < 3) {
            return { ok: false, reason: `Boundary update for floor "${this.payload.floorId}" carries ${this.payload.outerLoopEdges?.length ?? 0} sketch edges — the outer loop needs at least 3.` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.floorStore;
        const current = store?.getById(this.payload.floorId);
        if (!store || !current) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Floor "${this.payload.floorId}" not found — cannot update boundary.`,
            };
        }

        // §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4 / C75): an absent edge payload is NOT
        // an empty loop. Writing `[]` here would erase the recorded relationship
        // and read as "this floor has no boundary edges" to every consumer.
        // Refuse with the reason instead — canExecute already refuses this; the
        // guard is repeated here so execute-without-canExecute cannot default.
        const outerLoopEdges = this.payload.outerLoopEdges;
        if (!outerLoopEdges || outerLoopEdges.length < 3) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Boundary ${this.payload.mode} for floor "${this.payload.floorId}" carries ` +
                    `${outerLoopEdges?.length ?? 'no'} outer-loop edge(s) — refusing rather than writing an empty loop.`,
            };
        }

        // The post-state values, built exactly as before: inner loops preserved
        // through the sketch spread, untouched boundary fields through the boundary
        // spread, and the payload deep-copied so the stored record cannot alias it.
        const nextSketch = deepCopy({
            ...(current.sketch ?? {}),
            outerLoop: { edges: outerLoopEdges },
        }) as FloorSketch;
        const nextBoundary = this.payload.mode === 'reproject' && this.payload.polygon
            ? deepCopy({
                ...current.boundary,
                polygon: this.payload.polygon as FloorVertex[],
            })
            : undefined;

        // G-NEW-05 CAPTURE — one `produceWithPatches` pass over the CURRENT record
        // yields the inverse patches that are this command's undo. The draft is
        // handed its OWN copies of the post-state values: Immer freezes what it
        // produces, and the objects below travel on to the store, which writes
        // through them (see `deepCopy`).
        const { inversePatches } = producePatchedSlice<FloorData>(current, (draft) => {
            draft.sketch = deepCopy(nextSketch);
            if (nextBoundary) draft.boundary = deepCopy(nextBoundary);
            // §AUDIT-TRAIL — the store bumps `metadata.version` / `modifiedAt` on the
            // write below (preserveMetadata defaults false). The snapshot idiom this
            // replaces restored the WHOLE pre-execute record with
            // preserveMetadata=true, which put the audit trail back. Re-assigning
            // `metadata` marks it touched (Immer compares by reference, so a copy IS a
            // change), which lands the PRE-execute metadata in `inversePatches` and
            // makes undo byte-equal exactly as before. `metadata` is NOT part of the
            // execute write — `updates` below carries only the boundary sketch.
            draft.metadata = deepCopy(draft.metadata);
        });
        this.inversePatches = inversePatches;

        const updates: Partial<FloorData> = { sketch: nextSketch };
        if (nextBoundary) updates.boundary = nextBoundary;

        const updated = store.update(this.payload.floorId, updates);
        if (!updated) {
            return {
                success: false,
                affectedElementIds: [],
                error: `FloorStore.update refused the boundary write for floor "${this.payload.floorId}".`,
            };
        }

        console.log(
            `[UpdateFloorBoundaryCommand] ${this.payload.mode === 'reproject'
                ? `Re-projected boundary of floor "${this.payload.floorId}" (wall "${this.payload.cause.wallId}" moved).`
                : `Degraded sketch on floor "${this.payload.floorId}" (wall "${this.payload.cause.wallId}" removed). HostReferenceEdges → FreeLineEdges.`}`
        );

        return {
            success: true,
            affectedElementIds: [this.payload.floorId],
            info: [
                `Floor "${this.payload.floorId}" boundary ${this.payload.mode} — cause: ${this.payload.cause.kind} (wall "${this.payload.cause.wallId}").`,
            ],
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.nonUndoable) {
            // Required no-op (../types.ts): the wall-move undo re-fires the wall
            // 'update' event and the tracker re-projects the floor back itself.
            return {
                success: true,
                affectedElementIds: [],
                info: [`Re-projection of floor "${this.payload.floorId}" is nonUndoable — the wall-move undo re-projects it back.`],
            };
        }
        const store = context.stores.floorStore;
        if (!store || !this.inversePatches) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'No pre-degradation snapshot captured — cannot undo floor boundary degradation.',
            };
        }
        const currentNow = store.getById(this.payload.floorId);
        if (!currentNow) {
            // The floor vanished outside this undo unit. Say so rather than invent a
            // record — this command never creates floors, in undo any more than in
            // execute.
            return {
                success: false,
                affectedElementIds: [],
                error: `Floor "${this.payload.floorId}" no longer exists — nothing to restore.`,
            };
        }
        // Inverse patches onto the CURRENT record reconstruct the pre-execute record
        // byte-equal (G-NEW-05). `deepCopy` un-freezes the Immer result before it
        // reaches the store, which writes through what it is given.
        const prev = deepCopy(applyPatchesToSlice<FloorData>(currentNow, this.inversePatches));
        // preserveMetadata=true — an undo must not corrupt the audit trail
        // (mirrors FloorStore.restoreSnapshot).
        store.update(this.payload.floorId, prev, true);
        console.log(
            `[UpdateFloorBoundaryCommand] UNDO: restored sketch on floor "${this.payload.floorId}" ` +
            `(HostReferenceEdges for wall "${this.payload.cause.wallId}" restored).`
        );
        return {
            success: true,
            affectedElementIds: [this.payload.floorId],
            info: [`Sketch restored on floor "${this.payload.floorId}" (undo).`],
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: deepCopy(this.payload) as unknown as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): UpdateFloorBoundaryCommand {
        return new UpdateFloorBoundaryCommand(data.payload as unknown as UpdateFloorBoundaryPayload);
    }
}
