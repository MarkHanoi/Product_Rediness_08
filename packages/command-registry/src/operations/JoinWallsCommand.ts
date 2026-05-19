import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { serializeWallSnapshot } from '../walls/wallSnapshotUtils';
import { Point3D } from '@pryzm/core-app-model';

export interface JoinWallsInput {
    wallAId: string;
    wallBId: string;
}

/**
 * JoinWallsCommand
 *
 * Extends / trims two walls so that their nearest endpoints meet exactly at
 * their baseline-centerline intersection in the XZ plane.
 *
 * Algorithm (all arithmetic is in the XZ plane — Y is shared per level):
 *   1. Compute parametric line-line intersection (infinite lines).
 *   2. Move the nearest endpoint of each wall to the intersection point.
 *
 * Undo: restores both walls from full snapshots captured in execute().
 *
 * Contract compliance:
 *   §01 §2.1 — mutations via wallStore.update() only.
 *   §01 §2.2 — full snapshots stored for undo.
 *   §01 §2.6 — no IDs generated here; walls already exist.
 */
export class JoinWallsCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type  = CommandType.JOIN_WALLS;
    readonly timestamp: number;
    readonly targetIds: string[];

    private prevSnapshotA: any = null;
    private prevSnapshotB: any = null;
    private executed = false;

    constructor(private readonly input: JoinWallsInput) {
        this.id        = crypto.randomUUID();
        this.timestamp = Date.now();
        this.targetIds = [input.wallAId, input.wallBId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wallA = ctx.stores.wallStore.getById(this.input.wallAId);
        const wallB = ctx.stores.wallStore.getById(this.input.wallBId);
        if (!wallA) return { ok: false, reason: 'WALL_A_NOT_FOUND', blockingIssues: [`WALL_NOT_FOUND: ${this.input.wallAId}`] };
        if (!wallB) return { ok: false, reason: 'WALL_B_NOT_FOUND', blockingIssues: [`WALL_NOT_FOUND: ${this.input.wallBId}`] };
        if (this.input.wallAId === this.input.wallBId) return { ok: false, reason: 'SAME_WALL', blockingIssues: ['Cannot join a wall to itself'] };
        const ix = _lineIntersectXZ(wallA.baseLine[0], wallA.baseLine[1], wallB.baseLine[0], wallB.baseLine[1]);
        if (!ix) return { ok: false, reason: 'WALLS_PARALLEL', blockingIssues: ['Walls are parallel — no intersection exists'] };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) return { success: false, affectedElementIds: [], info: ['Already executed'] };

        const wallA = ctx.stores.wallStore.getById(this.input.wallAId)!;
        const wallB = ctx.stores.wallStore.getById(this.input.wallBId)!;

        const ix = _lineIntersectXZ(wallA.baseLine[0], wallA.baseLine[1], wallB.baseLine[0], wallB.baseLine[1]);
        if (!ix) return { success: false, affectedElementIds: [], info: ['Walls are parallel'] };

        this.prevSnapshotA = serializeWallSnapshot(wallA);
        this.prevSnapshotB = serializeWallSnapshot(wallB);

        const newBaseLineA = _withNearestEndpointAt(wallA.baseLine, ix);
        const newBaseLineB = _withNearestEndpointAt(wallB.baseLine, ix);

        ctx.stores.wallStore.update(this.input.wallAId, {
            baseLine: newBaseLineA,
            _renderVersion: ((wallA as any)._renderVersion ?? 0) + 1,
        } as any);

        ctx.stores.wallStore.update(this.input.wallBId, {
            baseLine: newBaseLineB,
            _renderVersion: ((wallB as any)._renderVersion ?? 0) + 1,
        } as any);

        this.executed = true;
        return { success: true, affectedElementIds: [this.input.wallAId, this.input.wallBId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed) return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshotA);
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshotB);
        this.executed = false;
        return { success: true, affectedElementIds: [this.input.wallAId, this.input.wallBId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload:   { wallAId: this.input.wallAId, wallBId: this.input.wallBId },
        };
    }
}

// ── XZ plane geometry helpers ──────────────────────────────────────────────

/**
 * Parametric line-line intersection in the XZ plane.
 * Returns the intersection world point (Y is taken from p1 of line A) or null
 * when the lines are parallel / degenerate.
 */
function _lineIntersectXZ(
    a0: Point3D, a1: Point3D,
    b0: Point3D, b1: Point3D,
): Point3D | null {
    const dax = a1.x - a0.x, daz = a1.z - a0.z;
    const dbx = b1.x - b0.x, dbz = b1.z - b0.z;
    const det = dax * (-dbz) + dbx * daz;
    if (Math.abs(det) < 1e-9) return null;
    const dx = b0.x - a0.x, dz = b0.z - a0.z;
    const t  = (dx * (-dbz) + dbx * dz) / det;
    return { x: a0.x + t * dax, y: a0.y, z: a0.z + t * daz };
}

/**
 * Returns a copy of baseLine where the endpoint nearest to `target` has been
 * moved to `target`.  The other endpoint is unchanged.
 */
function _withNearestEndpointAt(
    baseLine: [Point3D, Point3D],
    target: Point3D,
): [Point3D, Point3D] {
    const d0 = _distXZ(baseLine[0], target);
    const d1 = _distXZ(baseLine[1], target);
    if (d0 <= d1) {
        return [{ x: target.x, y: baseLine[0].y, z: target.z }, { ...baseLine[1] }];
    }
    return [{ ...baseLine[0] }, { x: target.x, y: baseLine[1].y, z: target.z }];
}

function _distXZ(a: Point3D, b: Point3D): number {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}
