import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { serializeWallSnapshot } from '../walls/wallSnapshotUtils';
import { Point3D } from '@pryzm/core-app-model';

export interface CutWallInput {
    wallAId: string;
    wallBId: string;
    /**
     * A point close to the side of Wall A that the user wants to KEEP after the
     * cut.  Typically the midpoint of the kept half, or the pick-point the user
     * clicked when selecting the wall.  The command moves whichever endpoint of A
     * is farther from keepPointA to the intersection.
     */
    keepPointA: Point3D;
    /**
     * Same principle for Wall B.
     */
    keepPointB: Point3D;
}

/**
 * CutWallCommand
 *
 * Trims two walls at their XZ-plane baseline intersection, retaining only the
 * halves indicated by keepPointA / keepPointB.
 *
 * Algorithm:
 *   1. Compute infinite-line intersection I in XZ.
 *   2. For each wall: identify the endpoint closest to the keepPoint — that
 *      endpoint is preserved as the "anchor".  The opposite endpoint is
 *      replaced by I (the trim point).
 *   3. The result is a wall from [anchor → I] — exactly the kept half.
 *
 * Undo: restores full pre-cut snapshots of both walls.
 *
 * Contract compliance:
 *   §01 §2.1 — mutations via wallStore.update() only.
 *   §01 §2.2 — full snapshots captured before mutation.
 *   §01 §2.6 — no new IDs; command modifies existing elements only.
 */
export class CutWallCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type  = CommandType.CUT_WALL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private prevSnapshotA: any = null;
    private prevSnapshotB: any = null;
    private executed = false;

    constructor(private readonly input: CutWallInput) {
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
        if (this.input.wallAId === this.input.wallBId) return { ok: false, reason: 'SAME_WALL', blockingIssues: ['Cannot cut a wall against itself'] };

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

        const newBaseLineA = _trimToIntersection(wallA.baseLine, ix, this.input.keepPointA);
        const newBaseLineB = _trimToIntersection(wallB.baseLine, ix, this.input.keepPointB);

        // Guard: trimmed wall must be at least 0.1 m long.
        if (_lenXZ(newBaseLineA) < 0.1 || _lenXZ(newBaseLineB) < 0.1) {
            return {
                success: false,
                affectedElementIds: [],
                info: ['Cut would produce a wall shorter than 0.1 m — operation cancelled'],
            };
        }

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
            payload: {
                wallAId:    this.input.wallAId,
                wallBId:    this.input.wallBId,
                keepPointA: this.input.keepPointA,
                keepPointB: this.input.keepPointB,
            },
        };
    }
}

// ── XZ plane geometry helpers ──────────────────────────────────────────────

function _lineIntersectXZ(a0: Point3D, a1: Point3D, b0: Point3D, b1: Point3D): Point3D | null {
    const dax = a1.x - a0.x, daz = a1.z - a0.z;
    const dbx = b1.x - b0.x, dbz = b1.z - b0.z;
    const det = dax * (-dbz) + dbx * daz;
    if (Math.abs(det) < 1e-9) return null;
    const dx = b0.x - a0.x, dz = b0.z - a0.z;
    const t  = (dx * (-dbz) + dbx * dz) / det;
    return { x: a0.x + t * dax, y: a0.y, z: a0.z + t * daz };
}

/**
 * Trims `baseLine` at `ix`: the endpoint CLOSER to `keepPoint` is preserved as
 * the anchor; the farther endpoint is replaced by the intersection.
 */
function _trimToIntersection(
    baseLine: [Point3D, Point3D],
    ix: Point3D,
    keepPoint: Point3D,
): [Point3D, Point3D] {
    const d0 = _distXZ(baseLine[0], keepPoint);
    const d1 = _distXZ(baseLine[1], keepPoint);
    if (d0 <= d1) {
        // Anchor is baseLine[0]; far endpoint (baseLine[1]) moves to ix
        return [{ ...baseLine[0] }, { x: ix.x, y: baseLine[1].y, z: ix.z }];
    }
    return [{ x: ix.x, y: baseLine[0].y, z: ix.z }, { ...baseLine[1] }];
}

function _distXZ(a: Point3D, b: Point3D): number {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function _lenXZ(bl: [Point3D, Point3D]): number {
    return _distXZ(bl[0], bl[1]);
}
