import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import type { CeilingData, CeilingSketch, CeilingSketchEdge, CeilingVertex } from '@pryzm/core-app-model';

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

    private prevSnapshot?: CeilingData;

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

        this.prevSnapshot = structuredClone(current) as CeilingData;

        const nextSketch: CeilingSketch = {
            ...(current.sketch ?? {}),
            outerLoop: { edges: structuredClone(this.payload.outerLoopEdges ?? []) as CeilingSketchEdge[] },
        };

        const updates: Partial<CeilingData> = { sketch: nextSketch };
        if (this.payload.mode === 'reproject' && this.payload.polygon) {
            updates.boundary = {
                ...structuredClone(current.boundary),
                polygon: structuredClone(this.payload.polygon) as CeilingVertex[],
            };
        }

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
        if (!store || !this.prevSnapshot) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'No pre-degradation snapshot captured — cannot undo ceiling boundary degradation.',
            };
        }
        // preserveMetadata=true — an undo must not corrupt the audit trail.
        store.update(this.payload.ceilingId, this.prevSnapshot, true);
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
            payload: structuredClone(this.payload) as unknown as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): UpdateCeilingBoundaryCommand {
        return new UpdateCeilingBoundaryCommand(data.payload as unknown as UpdateCeilingBoundaryPayload);
    }
}
