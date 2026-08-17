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
 *       sketch's host references (C79 §5.1). UNDOABLE, and composed into the
 *       spawning gesture as a §L-874-ONE-UNDO structural child — see §L-943 below
 *       for why the `nonUndoable` this carried until 2026-08-17 was a defect.
 *
 *   'degrade' — a bounding wall was REMOVED and the host references pointing at it
 *       collapse to freeLine edges at their last known geometry. C79 §4.2 REQUIRES
 *       this to be undoable ("Degradation MUST go through an undoable command"):
 *       Ctrl+Z on the wall deletion also restores the floor's HostReferenceEdges.
 *       Mirrors `DegradeSlabSketchCommand` including the pre-mutation snapshot.
 *
 * ── §L-943 — "undo invented 63 m² of floor" ─────────────────────────────────
 * This header used to justify `nonUndoable: true` on 'reproject' like this:
 * *"the re-projection is DERIVED state maintenance… undoing the WALL move fires
 * the wall store's 'update' again and the tracker re-projects back"*. The premise
 * was FALSE, and it made a wall move NON-REVERSIBLE. C71's rule is that undo
 * RESTORES; it does not RECONSTRUCT — and a reconstruction on the reverse pass
 * can differ from a value that was never replaced. Two independent ways it did:
 *
 *  1. RE-PROJECTION IS NOT AN INVOLUTION. `reprojectFinishBoundary` measures the
 *     finish edge's inset against the wall's PRE-mutation centreline. On the
 *     reverse pass that pre-mutation wall is the MOVED one, so the inset is
 *     measured across the whole move distance and re-applied to the restored
 *     centreline. MEASURED (floorFollowUndoRestore.test.ts, pre-fix): a 22.040 m²
 *     floor came back as 51.040 m² from ONE Ctrl+Z. In production, 75.171 →
 *     138.262 m² — the 63 m² of the ledger row.
 *  2. THE FORWARD PASS HAS A REFUSAL ARM AND THE REVERSE PASS DID NOT CONSULT IT.
 *     When the re-derived ring self-intersects or inverts, C79 §5.2.2 refuses
 *     ('conflicted') and NOTHING is written. There was then nothing to reverse —
 *     and the reverse pass wrote anyway. That floor is the 63 m².
 *
 * Even on the arm that "worked", the round trip was lossy: the reconstructed ring
 * drifted in the last bits (0.1 → 0.09999999999999964) and `metadata.version`
 * climbed 1 → 3 per move+undo cycle, because the reverse pass was a fresh WRITE
 * rather than a restore.
 *
 * THE FIX IS A LATCHED FORWARD/INVERSE PAIR, not a second refusal. Making undo
 * refuse too would leave both arms silent about a floor whose boundary no longer
 * matches its walls. Instead:
 *   · this command is undoable in BOTH modes and its Immer inverse patches
 *     restore the PRE-move record verbatim — the value undo owes the user; and
 *   · `FinishHostDependencyTracker` consults `CommandManager.isReverting()` and
 *     stays SILENT during a revert, exactly as `SlabWallConnectivityService` and
 *     `WallMoveReweldService` already do (§L-874). The history's own child entry
 *     restores the finish; during a revert the tracker's only correct behaviour
 *     is silence.
 * ONE Ctrl+Z still reverts the whole gesture: the tracker dispatches with
 * `source: 'STRUCTURAL_CASCADE'` from inside the wall command's `execute()`, so
 * CommandManager attaches this to that gesture's `structuralChildren` rather than
 * pushing a second history entry (§L-874-ONE-UNDO). A re-detect afterwards is
 * free to conclude the restored boundary no longer matches its walls — that is a
 * separate, honest verdict, and not something undo may pre-empt by inventing a
 * ring.
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

    /** §L-943 — BOTH modes are undoable. 'reproject' carried `nonUndoable: true`
     *  until 2026-08-17 on the premise that the wall-move undo would re-project
     *  the floor back by itself; it did not — it RECONSTRUCTED a different ring,
     *  and wrote one even where the forward pass had refused. Kept as a declared
     *  field (rather than deleted) so the property stays greppable and so a future
     *  reader meets the reasoning instead of re-deriving it. See the class doc. */
    readonly nonUndoable: boolean = false;

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
        // §L-943 — BOTH modes restore here. There is no `nonUndoable` early
        // return any more: the one that used to sit at the top of this method
        // handed the reverse pass to a LISTENER that re-derived the boundary from
        // the restored wall, which is a reconstruction, not a restoration. What
        // the user is owed on Ctrl+Z is the boundary the floor HAD before the
        // move — that is exactly what these inverse patches carry.
        const store = context.stores.floorStore;
        if (!store || !this.inversePatches) {
            return {
                success: false,
                affectedElementIds: [],
                error: `No pre-mutation patches captured for floor "${this.payload.floorId}" — cannot undo the boundary ${this.payload.mode}.`,
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
            `[UpdateFloorBoundaryCommand] UNDO: restored the PRE-${this.payload.mode} boundary of floor ` +
            `"${this.payload.floorId}" verbatim (cause: wall "${this.payload.cause.wallId}"). §L-943 — restored, not re-derived.`
        );
        return {
            success: true,
            affectedElementIds: [this.payload.floorId],
            info: [`Floor "${this.payload.floorId}" boundary restored to its pre-${this.payload.mode} value (undo).`],
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
