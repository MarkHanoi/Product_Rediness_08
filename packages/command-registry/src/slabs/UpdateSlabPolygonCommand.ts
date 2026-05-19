import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { SlabData } from '@pryzm/geometry-slab';
import { signedArea } from '@pryzm/geometry-slab';

/**
 * UpdateSlabPolygonCommand
 *
 * Replaces the outer boundary polygon (and optionally the inline holes) of an
 * existing slab. This is the dedicated command for the Slab Profile Edit Mode
 * (see §11-SLAB-PROFILE-EDIT-CONTRACT.md).
 *
 * Contract compliance:
 *
 * §01 §2.1 Command-First
 *   Only this command may replace a slab's `polygon` field during profile editing.
 *   `SlabProfileEditor` never calls `slabStore.update()` directly — it fires this
 *   command via `commandManager.execute()`.
 *
 * §01 §2.3 Snapshot Integrity
 *   `prevSnapshot` is captured via `structuredClone(slab)` BEFORE any mutation in
 *   `execute()`. Undo restores the full snapshot — never a partial patch.
 *
 * §01 §2.4 Undo/Redo Symmetry
 *   Undo: `slabStore.update(id, prevSnapshot)` — full object replacement.
 *   Redo: `commandManager` re-calls `execute()` with the original context.
 *   All fields are deterministic from the payload — no randomness inside `execute()`.
 *
 * §02 Spatial Authority
 *   No spatial change — no `bimManager.registerElement()` call is needed. The slab
 *   stays on the same level; only its XZ footprint changes.
 *
 * §01 R-2 No Direct Builder Calls
 *   The builder is triggered exclusively by the `bim-slab-updated` DOM event emitted
 *   by `slabStore.update()`. This command never calls the builder directly.
 *
 * §03 Semantic Model Integrity
 *   `position.y` is preserved as 0. `width` and `depth` bounding-box fields are
 *   updated to reflect the new polygon extent so that property-panel UI and
 *   `UpdateSlabDimensionsCommand` continue to read consistent values.
 *
 * §07 Security
 *   No `window.*` access. All dependencies are injected via `CommandContext`.
 */

export interface UpdateSlabPolygonPayload {
    /** ID of the slab to update. */
    slabId: string;

    /**
     * New outer boundary polygon in XZ plane.
     * Points use `{ x, y }` where `y` maps to world Z (the 2D polygon convention
     * used throughout the slab subsystem). Minimum 3 points required.
     */
    polygon: { x: number; y: number }[];

    /**
     * New inline holes (optional).
     * When provided, completely replaces `SlabData.holes`.
     * When omitted, the slab's existing holes are preserved unchanged.
     */
    holes?: { x: number; y: number }[][];

    /**
     * When true, clears `SlabData.sketch` from the stored slab data.
     * Set this flag when entering profile edit mode on a sketch-based slab that
     * has been degraded to a FreeLineEdge polygon — the sketch field must be
     * removed so the builder uses the plain `polygon` path.
     * See §11 §1.4 Sketch Degradation on Profile Edit Entry.
     */
    clearSketch?: boolean;
}

/**
 * Recompute the axis-aligned bounding box width and depth for a polygon.
 * Used to keep `SlabData.width` and `SlabData.depth` in sync with the new polygon
 * so that existing consumers (property panel, AI commands, `UpdateSlabDimensionsCommand`)
 * read consistent values.
 */
function polygonBoundingBox(pts: { x: number; y: number }[]): { width: number; depth: number } {
    if (pts.length === 0) return { width: 0, depth: 0 };
    let minX = pts[0].x, maxX = pts[0].x;
    let minY = pts[0].y, maxY = pts[0].y;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { width: maxX - minX, depth: maxY - minY };
}

export class UpdateSlabPolygonCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB_POLYGON;
    readonly timestamp: number;
    targetIds: string[];

    /**
     * Full snapshot of the slab BEFORE mutation.
     * Captured in `execute()` via `structuredClone()`.
     * Restored in `undo()` via a full `slabStore.update()` replacement.
     */
    private prevSnapshot?: SlabData;

    constructor(private readonly payload: UpdateSlabPolygonPayload) {
        this.id = `cmd-update-slab-polygon-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    // ── Validation ──────────────────────────────────────────────────────────

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) {
            return { ok: false, reason: `Slab "${this.payload.slabId}" not found in store.` };
        }

        const poly = this.payload.polygon;

        if (!Array.isArray(poly) || poly.length < 3) {
            return {
                ok: false,
                reason: `Polygon must have at least 3 points (received ${poly?.length ?? 0}).`,
            };
        }

        // §11 §3.1: Reject zero-area polygons (degenerate / self-collapsing shapes).
        // Threshold: 0.01 m² (10 cm × 10 cm minimum area).
        const area = Math.abs(signedArea(poly));
        if (area < 0.01) {
            return {
                ok: false,
                reason: `Polygon area (${area.toFixed(4)} m²) is below the minimum of 0.01 m². The boundary must enclose a non-degenerate area.`,
            };
        }

        // Validate holes if provided.
        if (this.payload.holes !== undefined) {
            for (let i = 0; i < this.payload.holes.length; i++) {
                const hole = this.payload.holes[i];
                if (!Array.isArray(hole) || hole.length < 3) {
                    return {
                        ok: false,
                        reason: `Hole [${i}] must have at least 3 points (received ${hole?.length ?? 0}).`,
                    };
                }
            }
        }

        return { ok: true };
    }

    // ── Execution ────────────────────────────────────────────────────────────

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Slab "${this.payload.slabId}" not found — cannot execute UpdateSlabPolygonCommand.`,
            };
        }

        // §01 §2.3: Capture full snapshot BEFORE any mutation.
        this.prevSnapshot = structuredClone(slab) as SlabData;

        // §03 Semantic model: build the updated slab from a deep clone of the current state.
        // Never mutate the returned clone from getById() in-place — always build a new object.
        const nextState: SlabData = structuredClone(slab) as SlabData;

        // Replace the outer polygon with a fresh clone of the payload.
        // §01 R-4 Immutability: deep-clone the payload so the stored object shares no
        // references with the caller's data.
        nextState.polygon = structuredClone(this.payload.polygon);

        // Replace holes only when the payload explicitly provides them.
        // When `holes` is omitted, the existing value (if any) is left intact.
        if (this.payload.holes !== undefined) {
            nextState.holes = structuredClone(this.payload.holes);
        }

        // §11 §1.4: Clear the sketch field when degrading a sketch-based slab to a
        // plain polygon. The resolved polygon positions have already been injected above.
        if (this.payload.clearSketch) {
            delete nextState.sketch;
        }

        // §03 Backward compatibility: keep `width` and `depth` in sync with the new
        // polygon's AABB so that property-panel UI and AI commands read consistent values.
        // The builder itself uses the polygon for geometry — width/depth are metadata only.
        const { width, depth } = polygonBoundingBox(this.payload.polygon);
        nextState.width = parseFloat(width.toFixed(6));
        nextState.depth = parseFloat(depth.toFixed(6));

        // §01 R-2: Store mutation fires `bim-slab-updated` → EngineBootstrap subscriber
        // → builder.updateSlab(). The command never calls the builder directly.
        context.stores.slabStore.update(this.payload.slabId, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [
                `Slab "${this.payload.slabId}" polygon updated — ` +
                `${this.payload.polygon.length} vertices, ` +
                `AABB ${width.toFixed(2)}m × ${depth.toFixed(2)}m` +
                (this.payload.clearSketch ? ', sketch cleared' : ''),
            ],
        };
    }

    // ── Undo ─────────────────────────────────────────────────────────────────

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return {
                success: false,
                affectedElementIds: [],
                error: 'UpdateSlabPolygonCommand.undo(): prevSnapshot is missing — execute() was never called or snapshot was not captured.',
            };
        }

        // §01 §2.3: Full replacement — never a partial patch.
        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Slab "${this.payload.slabId}" polygon restored to previous state.`],
        };
    }

    // ── Serialisation ─────────────────────────────────────────────────────────

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: structuredClone(this.payload) as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): UpdateSlabPolygonCommand {
        return new UpdateSlabPolygonCommand(data.payload as UpdateSlabPolygonPayload);
    }
}
