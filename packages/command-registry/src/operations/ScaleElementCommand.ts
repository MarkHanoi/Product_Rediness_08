import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { serializeWallSnapshot } from '../walls/wallSnapshotUtils';
import { Point3D } from '@pryzm/core-app-model';

export interface ScaleElementInput {
    elementId: string;
    /** Scale factor along the X world axis. */
    scaleX: number;
    /** Scale factor along the Z world axis. */
    scaleZ: number;
    /**
     * Pivot point in world space (XZ plane).  Both baseline endpoints are
     * scaled relative to this point.  Defaults to the wall midpoint when
     * not supplied by the Tool.
     */
    pivot: Point3D;
}

/**
 * ScaleElementCommand
 *
 * Scales a wall's baseline endpoints relative to a pivot point in the XZ plane.
 * Useful for stretching/compressing a wall non-uniformly (e.g. fitting a room).
 *
 * Algorithm:
 *   For each endpoint P:
 *     P' = pivot + (P - pivot) * scale
 *
 * A minimum resulting length of 0.1 m is enforced.
 *
 * Undo: restores the wall from a full pre-scale snapshot.
 *
 * Contract compliance:
 *   §01 §2.1 — mutations via wallStore.update() only.
 *   §01 §2.2 — full snapshot stored before mutation.
 *   §01 §2.6 — no new IDs generated.
 */
export class ScaleElementCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type  = CommandType.SCALE_ELEMENT;
    readonly timestamp: number;
    readonly targetIds: string[];

    private prevSnapshot: any = null;
    private executed = false;

    constructor(private readonly input: ScaleElementInput) {
        this.id        = crypto.randomUUID();
        this.timestamp = Date.now();
        this.targetIds = [input.elementId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.elementId);
        if (!wall) return { ok: false, reason: 'ELEMENT_NOT_FOUND', blockingIssues: [`Element not found: ${this.input.elementId}`] };
        if (this.input.scaleX <= 0 || this.input.scaleZ <= 0) {
            return { ok: false, reason: 'INVALID_SCALE', blockingIssues: ['Scale factors must be positive'] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) return { success: false, affectedElementIds: [], info: ['Already executed'] };

        const wall = ctx.stores.wallStore.getById(this.input.elementId)!;
        this.prevSnapshot = serializeWallSnapshot(wall);

        const { pivot, scaleX, scaleZ } = this.input;

        const s0 = _scalePoint(wall.baseLine[0], pivot, scaleX, scaleZ);
        const s1 = _scalePoint(wall.baseLine[1], pivot, scaleX, scaleZ);

        const dx = s1.x - s0.x, dz = s1.z - s0.z;
        if (Math.sqrt(dx * dx + dz * dz) < 0.1) {
            return {
                success: false,
                affectedElementIds: [],
                info: ['Scale would produce a wall shorter than 0.1 m — operation cancelled'],
            };
        }

        ctx.stores.wallStore.update(this.input.elementId, {
            baseLine: [s0, s1],
            _renderVersion: ((wall as any)._renderVersion ?? 0) + 1,
        } as any);

        this.executed = true;
        return { success: true, affectedElementIds: [this.input.elementId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this.prevSnapshot) return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
        this.executed = false;
        return { success: true, affectedElementIds: [this.input.elementId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload: {
                elementId: this.input.elementId,
                scaleX:    this.input.scaleX,
                scaleZ:    this.input.scaleZ,
                pivot:     { ...this.input.pivot },
            },
        };
    }
}

// ── Geometry helper ────────────────────────────────────────────────────────

function _scalePoint(p: Point3D, pivot: Point3D, sx: number, sz: number): Point3D {
    return {
        x: pivot.x + (p.x - pivot.x) * sx,
        y: p.y,
        z: pivot.z + (p.z - pivot.z) * sz,
    };
}
