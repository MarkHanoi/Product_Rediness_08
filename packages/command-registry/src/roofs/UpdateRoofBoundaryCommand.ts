import type { Patch } from 'immer';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { producePatchedSlice, applyPatchesToSlice } from '../PatchSnapshot';
import type { RoofData } from '@pryzm/geometry-roof';

/**
 * Deep copy returning PLAIN, UNFROZEN objects.
 *
 * Why not `structuredClone`: `check-structuredclone-new-commands` (G-NEW-05)
 * prohibits it here; undo capture is Immer `produceWithPatches`.
 *
 * Why at all, given `RoofStore.update` clones its own record before merging
 * (`cloneRoofData(existing)` → `Object.assign(cloned, updates)`): the values in
 * `updates` are assigned BY REFERENCE into the record the store then freezes.
 * Handing it an Immer-produced object would therefore publish a FROZEN
 * `footprint` into the store, and `RoofStore.restoreSnapshot` / a later
 * `Object.assign` path would fault on it in strict mode. The floor command
 * carries this same guard for the same reason (`UpdateFloorBoundaryCommand`),
 * and this is the one place the two families genuinely agree.
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
 * UpdateRoofBoundaryCommand — §ROOF-FOLLOWS-WALL (L-924 · GR-12 · C79 §4/§5 · C72 §0.3)
 *
 * The WRITE half of the roof follow path. `RoofDependencyTracker`
 * (`@pryzm/geometry-roof`, landed 16ef37b0) computes the re-derived footprint
 * and classifies it into one of C79 §5.2's five states; this command is the
 * only thing that can put that footprint into the roof store. Until it existed
 * the tracker could not be CONSTRUCTED at all — its `commandFactory` parameter
 * had no command to build — which is why 16ef37b0 shipped with the capability
 * unreachable and said so (C70 §4.2).
 *
 * ─── WHY A COMMAND AND NOT A DIRECT STORE WRITE ──────────────────────────────
 * `SlabDependencyTracker` writes the slab's polygon straight into the store,
 * and that is CORRECT FOR SLAB and wrong here. The two families differ in
 * exactly one load-bearing way: a slab's mesh re-derives from `data.sketch`, so
 * its polygon is mirror state and a direct cascade write cannot desynchronise
 * anything. `RoofFragmentBuilder` builds from `footprint.polygon` — the RECORD
 * IS THE GEOMETRY INPUT, there is no sketch to fall back on — so the write must
 * be a first-class, replayable, undo-aware operation. That is the FLOOR rule
 * (`UpdateFloorBoundaryCommand`), and roof takes it, per P6.
 *
 * ─── TWO MODES ───────────────────────────────────────────────────────────────
 *   'reproject' — a bounding wall MOVED and the footprint was re-derived by
 *       re-tracing the region at the roof's anchor (C79 §5.1). `nonUndoable:
 *       true`: this is DERIVED state maintenance, not a user gesture. Undoing
 *       the WALL move re-fires the wall store's 'update', the tracker
 *       re-projects back, and one Ctrl+Z stays one Ctrl+Z. Pushing it on the
 *       stack would let a single undo restore the PRE-move footprint against
 *       POST-move walls — recreating the drawn≠recorded divergence the
 *       write-back exists to remove (`SlabDependencyTracker` §03).
 *
 *   'degrade' — a bounding wall was REMOVED. C79 §4.1: deleting a bounding
 *       element MUST NOT move the derived element. THE FOOTPRINT IS NOT
 *       TOUCHED; only `boundingWallIds` drops the ids that no longer resolve,
 *       so the reference stops claiming a wall that is gone. C79 §4.2 requires
 *       degradation to be undoable, so this mode occupies an undo slot and
 *       Ctrl+Z on the wall deletion restores the reference.
 *
 * ─── WHAT THIS COMMAND MAY NOT DO ────────────────────────────────────────────
 * It never writes an EMPTY footprint and never writes `boundingWallIds: []` as
 * a stand-in for "unknown" (§check-no-empty-means-unknown, C78 §1.4). A
 * re-derivation that produced no ring arrives here as `undetermined` and the
 * tracker does not call this command at all — absence of a write is how an
 * undetermined roof is represented, because an empty ring would read as a real
 * measurement of nothing.
 */
export interface UpdateRoofBoundaryPayload {
    roofId: string;
    mode: 'reproject' | 'degrade';
    /**
     * The re-derived footprint in the roof's STORED centroid-local form.
     * Required for 'reproject'; absent for 'degrade' (C79 §4.1 — the geometry
     * stays exactly where it was; only the references degrade).
     */
    footprint?: { polygon: [number, number][]; centroid: [number, number] };
    /** The re-derived attribution, so the reference cannot go stale beside the geometry. */
    boundingWallIds?: string[];
    /** Why this write happened. Named, never inferred (C79 §4.4 / C75). */
    cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' };
}

export class UpdateRoofBoundaryCommand implements Command {
    readonly affectedStores = ['roof'] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_ROOF_BOUNDARY;
    readonly timestamp: number;
    targetIds: string[];

    /** 'reproject' is derived-state maintenance and must NOT occupy an undo slot;
     *  'degrade' is C79 §4.2-mandated undoable. See the class doc. */
    readonly nonUndoable: boolean;

    /** Immer INVERSE PATCHES for the record this command rewrote (G-NEW-05). */
    private inversePatches?: readonly Patch[];

    constructor(private payload: UpdateRoofBoundaryPayload) {
        this.id = `cmd-update-roof-boundary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.roofId];
        this.nonUndoable = payload.mode === 'reproject';
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = context.stores.roofStore;
        if (!store) {
            return { ok: false, reason: 'roofStore is not registered on this CommandContext — cannot update roof boundary.' };
        }
        const roof = store.getById(this.payload.roofId);
        if (!roof) {
            return { ok: false, reason: `Roof "${this.payload.roofId}" not found — cannot update boundary.` };
        }
        if (this.payload.mode === 'reproject') {
            const n = this.payload.footprint?.polygon?.length ?? 0;
            if (n < 3) {
                return {
                    ok: false,
                    reason: `Re-projection for roof "${this.payload.roofId}" carries ${n} vertices — a footprint needs at least 3. ` +
                        `Refusing rather than writing a degenerate ring.`,
                };
            }
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.roofStore;
        const current = store?.getById(this.payload.roofId) as RoofData | undefined;
        if (!store || !current) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Roof "${this.payload.roofId}" not found — cannot update boundary.`,
            };
        }

        // §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4 / C75) — repeated here so an
        // execute-without-canExecute cannot default into a degenerate write.
        const polygon = this.payload.footprint?.polygon;
        if (this.payload.mode === 'reproject' && (!polygon || polygon.length < 3)) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Re-projection for roof "${this.payload.roofId}" carries ${polygon?.length ?? 'no'} vertices — ` +
                    `refusing rather than writing an empty footprint.`,
            };
        }

        // C79 §4.1 — 'degrade' NEVER touches the geometry. A removed wall must
        // not move the roof; it may only cost it a reference it can no longer
        // honour.
        const nextFootprint = this.payload.mode === 'reproject' && this.payload.footprint
            ? deepCopy(this.payload.footprint)
            : undefined;

        // An ABSENT `boundingWallIds` leaves the recorded attribution alone. It
        // is NOT the same as `[]`, which would assert this roof is bounded by no
        // wall — the distinction `RoofData.boundingWallIds` is `.optional()` to
        // preserve, and the one `check-no-empty-means-unknown` protects.
        const nextBoundingWallIds = this.payload.boundingWallIds
            ? deepCopy(this.payload.boundingWallIds)
            : undefined;

        // G-NEW-05 CAPTURE — one `produceWithPatches` pass over the CURRENT
        // record yields this command's undo. The draft receives its OWN copies:
        // Immer freezes what it produces, and the objects below travel on to the
        // store, which assigns them by reference into the record it freezes.
        const { inversePatches } = producePatchedSlice<RoofData>(current, (draft) => {
            if (nextFootprint) draft.footprint = deepCopy(nextFootprint) as RoofData['footprint'];
            if (nextBoundingWallIds) draft.boundingWallIds = deepCopy(nextBoundingWallIds);
            // §AUDIT-TRAIL — `RoofStore.update` bumps `metadata.version` /
            // `modifiedAt` on the write below. Re-assigning `metadata` marks it
            // touched (Immer compares by reference), which lands the PRE-execute
            // metadata in `inversePatches` and makes undo byte-equal.
            draft.metadata = deepCopy(draft.metadata);
        });
        this.inversePatches = inversePatches;

        const updates: Partial<RoofData> = {};
        if (nextFootprint) updates.footprint = nextFootprint as RoofData['footprint'];
        if (nextBoundingWallIds) updates.boundingWallIds = nextBoundingWallIds;

        if (Object.keys(updates).length === 0) {
            // Nothing to write is not a failure — it is the honest outcome of a
            // 'degrade' whose references all still resolve. Said out loud rather
            // than reported as a successful write that changed nothing.
            return {
                success: true,
                affectedElementIds: [],
                info: [
                    `Roof "${this.payload.roofId}" boundary ${this.payload.mode} carried no change ` +
                    `(cause: ${this.payload.cause.kind}, wall "${this.payload.cause.wallId}").`,
                ],
            };
        }

        const updated = store.update(this.payload.roofId, updates);
        if (!updated) {
            return {
                success: false,
                affectedElementIds: [],
                error: `RoofStore.update refused the boundary write for roof "${this.payload.roofId}".`,
            };
        }

        console.log(
            `[UpdateRoofBoundaryCommand] ${this.payload.mode === 'reproject'
                ? `Re-projected footprint of roof "${this.payload.roofId}" (wall "${this.payload.cause.wallId}" moved).`
                : `Degraded references on roof "${this.payload.roofId}" (wall "${this.payload.cause.wallId}" removed). Geometry untouched.`}`
        );

        return {
            success: true,
            affectedElementIds: [this.payload.roofId],
            info: [
                `Roof "${this.payload.roofId}" boundary ${this.payload.mode} — cause: ${this.payload.cause.kind} (wall "${this.payload.cause.wallId}").`,
            ],
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.nonUndoable) {
            // Required no-op (../types.ts): the wall-move undo re-fires the wall
            // 'update' event and the tracker re-projects the roof back itself.
            return {
                success: true,
                affectedElementIds: [],
                info: [`Re-projection of roof "${this.payload.roofId}" is nonUndoable — the wall-move undo re-projects it back.`],
            };
        }
        const store = context.stores.roofStore;
        if (!store || !this.inversePatches) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'No pre-degradation patches captured — cannot undo roof boundary degradation.',
            };
        }
        const currentNow = store.getById(this.payload.roofId) as RoofData | undefined;
        if (!currentNow) {
            // The roof vanished outside this undo unit. Say so rather than
            // invent a record — this command never creates roofs.
            return {
                success: false,
                affectedElementIds: [],
                error: `Roof "${this.payload.roofId}" no longer exists — nothing to restore.`,
            };
        }
        const prev = deepCopy(applyPatchesToSlice<RoofData>(currentNow, this.inversePatches));
        store.update(this.payload.roofId, prev);
        console.log(
            `[UpdateRoofBoundaryCommand] UNDO: restored references on roof "${this.payload.roofId}" ` +
            `(wall "${this.payload.cause.wallId}").`
        );
        return {
            success: true,
            affectedElementIds: [this.payload.roofId],
            info: [`References restored on roof "${this.payload.roofId}" (undo).`],
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

    static deserialize(data: SerializedCommand): UpdateRoofBoundaryCommand {
        return new UpdateRoofBoundaryCommand(data.payload as unknown as UpdateRoofBoundaryPayload);
    }
}
