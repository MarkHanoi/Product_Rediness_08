import type { Patch } from 'immer';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { producePatchedSlice, applyPatchesToSlice } from '../PatchSnapshot';
import type { CeilingData, CeilingSketch, CeilingSketchEdge, CeilingVertex } from '@pryzm/core-app-model';

/**
 * Deep copy returning PLAIN, UNFROZEN objects — the twin of the helper in
 * `UpdateFloorBoundaryCommand`, duplicated deliberately (C79 §3.4/§7.4: the two
 * finish families keep the same shape; a shared helper here would be the only
 * coupling between them).
 *
 * Why not `structuredClone`: `check-structuredclone-new-commands` (G-NEW-05)
 * prohibits it here; undo capture moved to Immer `produceWithPatches`.
 *
 * Why not just hand the Immer result to the store: Immer AUTO-FREEZES what it
 * produces (nothing in this repo calls `setAutoFreeze(false)`), and
 * `CeilingStore.update` WRITES THROUGH the object it is given — it does
 * `delete (updates as any).levelId`, `delete (updates as any).holeElements`, and
 * `clone.boundary.polygon = ensureCCW(clone.boundary.polygon)` after
 * `Object.assign`. On a frozen input each of those is a TypeError in strict
 * mode, i.e. a broken undo on a live, founder-visible path. Every value that
 * leaves this command for the store therefore passes through here first.
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
 * UpdateCeilingBoundaryCommand — §FINISH-FOLLOWS-WALL (GR-12 · C79 §4/§5 · C72 §0.3)
 *
 * The ceiling twin of `UpdateFloorBoundaryCommand` — byte-identical in shape,
 * DELIBERATELY (C79 §3.4: one relationship, one edge shape; §7.4: per-path
 * divergence between the two finish families is worse than uniform absence).
 * Read that file's header for the full rationale; only the family differs here.
 *
 *   'reproject' — bounding wall MOVED; boundary re-derived from host references.
 *       `nonUndoable: true` — derived-state maintenance; the wall-move undo
 *       re-projects the ceiling back by re-firing the wall 'update' event.
 *   'degrade'   — bounding wall REMOVED; host references → freeLine at last
 *       geometry, undoable per C79 §4.2, with the pre-mutation snapshot restored
 *       verbatim on undo (mirrors `DegradeSlabSketchCommand`).
 *
 * Type: `CommandType.UPDATE_CEILING_BOUNDARY` (types.ts:300) — an existing enum
 * member with an existing PlanOrdering entry (PlanOrdering.ts:256) that no
 * command class claimed until now.
 */
export interface UpdateCeilingBoundaryPayload {
    ceilingId: string;
    mode: 'reproject' | 'degrade';
    /** New boundary ring (world X-Z). Required for 'reproject'; absent for 'degrade'
     *  (C79 §4.1 — the element survives its bounding wall; only references degrade). */
    polygon?: CeilingVertex[];
    /** Replacement outer-loop sketch edges, index-aligned with `polygon`.
     *  Inner loops are preserved untouched. */
    outerLoopEdges?: CeilingSketchEdge[];
    /** Why this write happened. Named, never inferred (C79 §4.4 / C75). */
    cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' };
}

export class UpdateCeilingBoundaryCommand implements Command {
    readonly affectedStores = ['ceiling'] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_CEILING_BOUNDARY;
    readonly timestamp: number;
    targetIds: string[];

    /** See UpdateFloorBoundaryCommand — same rule, same reason. */
    readonly nonUndoable: boolean;

    /**
     * Immer INVERSE PATCHES for the record this command rewrote (G-NEW-05), the
     * patch-based form of the pre-mutation snapshot `DegradeSlabSketchCommand`
     * keeps. Undo applies them to the ceiling's CURRENT record, reconstructing the
     * pre-execute record byte-equal — pinned by
     * `__tests__/updateCeilingBoundaryUndoRoundtrip.test.ts`, watched green
     * against the snapshot-clone implementation before this migration.
     */
    private inversePatches?: readonly Patch[];

    constructor(private payload: UpdateCeilingBoundaryPayload) {
        this.id = `cmd-update-ceiling-boundary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.ceilingId];
        this.nonUndoable = payload.mode === 'reproject';
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = context.stores.ceilingStore;
        if (!store) {
            return { ok: false, reason: 'ceilingStore is not registered on this CommandContext — cannot update ceiling boundary.' };
        }
        const ceiling = store.getById(this.payload.ceilingId);
        if (!ceiling) {
            return { ok: false, reason: `Ceiling "${this.payload.ceilingId}" not found — cannot update boundary.` };
        }
        if (this.payload.mode === 'reproject') {
            if (!this.payload.polygon || this.payload.polygon.length < 3) {
                return { ok: false, reason: `Re-projection for ceiling "${this.payload.ceilingId}" carries ${this.payload.polygon?.length ?? 0} vertices — a boundary needs at least 3.` };
            }
        }
        if (!this.payload.outerLoopEdges || this.payload.outerLoopEdges.length < 3) {
            return { ok: false, reason: `Boundary update for ceiling "${this.payload.ceilingId}" carries ${this.payload.outerLoopEdges?.length ?? 0} sketch edges — the outer loop needs at least 3.` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.ceilingStore;
        const current = store?.getById(this.payload.ceilingId);
        if (!store || !current) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Ceiling "${this.payload.ceilingId}" not found — cannot update boundary.`,
            };
        }

        // §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4 / C75): an absent edge payload is NOT
        // an empty loop — refuse with the reason rather than writing `[]` over a
        // recorded relationship. Mirrors UpdateFloorBoundaryCommand exactly.
        const outerLoopEdges = this.payload.outerLoopEdges;
        if (!outerLoopEdges || outerLoopEdges.length < 3) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Boundary ${this.payload.mode} for ceiling "${this.payload.ceilingId}" carries ` +
                    `${outerLoopEdges?.length ?? 'no'} outer-loop edge(s) — refusing rather than writing an empty loop.`,
            };
        }

        // The post-state values, built exactly as before: inner loops preserved
        // through the sketch spread, untouched boundary fields through the boundary
        // spread, and the payload deep-copied so the stored record cannot alias it.
        const nextSketch = deepCopy({
            ...(current.sketch ?? {}),
            outerLoop: { edges: outerLoopEdges },
        }) as CeilingSketch;
        const nextBoundary = this.payload.mode === 'reproject' && this.payload.polygon
            ? deepCopy({
                ...current.boundary,
                polygon: this.payload.polygon as CeilingVertex[],
            })
            : undefined;

        // G-NEW-05 CAPTURE — one `produceWithPatches` pass over the CURRENT record
        // yields the inverse patches that are this command's undo. The draft is
        // handed its OWN copies of the post-state values: Immer freezes what it
        // produces, and the objects below travel on to the store, which writes
        // through them (see `deepCopy`).
        const { inversePatches } = producePatchedSlice<CeilingData>(current, (draft) => {
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

        const updates: Partial<CeilingData> = { sketch: nextSketch };
        if (nextBoundary) updates.boundary = nextBoundary;

        const updated = store.update(this.payload.ceilingId, updates);
        if (!updated) {
            // CeilingStore.update refuses invalid polygons (validatePolygon) — that
            // refusal surfaces here as a failed command, never a silent clamp.
            return {
                success: false,
                affectedElementIds: [],
                error: `CeilingStore.update refused the boundary write for ceiling "${this.payload.ceilingId}".`,
            };
        }

        console.log(
            `[UpdateCeilingBoundaryCommand] ${this.payload.mode === 'reproject'
                ? `Re-projected boundary of ceiling "${this.payload.ceilingId}" (wall "${this.payload.cause.wallId}" moved).`
                : `Degraded sketch on ceiling "${this.payload.ceilingId}" (wall "${this.payload.cause.wallId}" removed). HostReferenceEdges → FreeLineEdges.`}`
        );

        return {
            success: true,
            affectedElementIds: [this.payload.ceilingId],
            info: [
                `Ceiling "${this.payload.ceilingId}" boundary ${this.payload.mode} — cause: ${this.payload.cause.kind} (wall "${this.payload.cause.wallId}").`,
            ],
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.nonUndoable) {
            return {
                success: true,
                affectedElementIds: [],
                info: [`Re-projection of ceiling "${this.payload.ceilingId}" is nonUndoable — the wall-move undo re-projects it back.`],
            };
        }
        const store = context.stores.ceilingStore;
        if (!store || !this.inversePatches) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'No pre-degradation snapshot captured — cannot undo ceiling boundary degradation.',
            };
        }
        const currentNow = store.getById(this.payload.ceilingId);
        if (!currentNow) {
            // The ceiling vanished outside this undo unit. Say so rather than invent
            // a record — this command never creates ceilings, in undo any more than
            // in execute.
            return {
                success: false,
                affectedElementIds: [],
                error: `Ceiling "${this.payload.ceilingId}" no longer exists — nothing to restore.`,
            };
        }
        // Inverse patches onto the CURRENT record reconstruct the pre-execute record
        // byte-equal (G-NEW-05). `deepCopy` un-freezes the Immer result before it
        // reaches the store, which writes through what it is given.
        const prev = deepCopy(applyPatchesToSlice<CeilingData>(currentNow, this.inversePatches));
        // preserveMetadata=true — an undo must not corrupt the audit trail.
        store.update(this.payload.ceilingId, prev, true);
        console.log(
            `[UpdateCeilingBoundaryCommand] UNDO: restored sketch on ceiling "${this.payload.ceilingId}" ` +
            `(HostReferenceEdges for wall "${this.payload.cause.wallId}" restored).`
        );
        return {
            success: true,
            affectedElementIds: [this.payload.ceilingId],
            info: [`Sketch restored on ceiling "${this.payload.ceilingId}" (undo).`],
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

    static deserialize(data: SerializedCommand): UpdateCeilingBoundaryCommand {
        return new UpdateCeilingBoundaryCommand(data.payload as unknown as UpdateCeilingBoundaryPayload);
    }
}
