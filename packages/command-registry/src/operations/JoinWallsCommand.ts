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
        // §JOIN-SPIKE-GUARD — reject a join whose intersection sits implausibly far
        // beyond both walls (near-parallel ⇒ far-off intersection ⇒ spike). See the
        // helper for the precise rule. Validate here so the operation never even
        // snapshots/mutates for an implausible join.
        const plaus = _joinPlausibility(wallA.baseLine, wallB.baseLine, ix);
        if (plaus.kind === 'spike') {
            return { ok: false, reason: 'JOIN_SPIKE', blockingIssues: [plaus.message] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) return { success: false, affectedElementIds: [], info: ['Already executed'] };

        const wallA = ctx.stores.wallStore.getById(this.input.wallAId)!;
        const wallB = ctx.stores.wallStore.getById(this.input.wallBId)!;

        const ix = _lineIntersectXZ(wallA.baseLine[0], wallA.baseLine[1], wallB.baseLine[0], wallB.baseLine[1]);
        if (!ix) return { success: false, affectedElementIds: [], info: ['Walls are parallel'] };

        // §JOIN-SPIKE-GUARD — classify before mutating.
        //   'spike'         → reject (would shoot an endpoint to a far-off point).
        //   'already-joined' → no-op with feedback (nearest ends already meet).
        //   'ok'            → proceed.
        const plaus = _joinPlausibility(wallA.baseLine, wallB.baseLine, ix);
        if (plaus.kind === 'spike') {
            return { success: false, affectedElementIds: [], info: [plaus.message] };
        }
        if (plaus.kind === 'already-joined') {
            return { success: false, affectedElementIds: [], info: ['Walls are already joined at this corner'] };
        }

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

// §JOIN-SPIKE-GUARD constants.
//   A genuine corner/extension join moves a wall's nearest endpoint a SHORT way
//   to the intersection — it tidies a near-meeting corner. A near-parallel pair
//   produces an intersection point far off in space; moving the nearest endpoint
//   there extends the wall enormously, producing the founder's "spike" (a sharp
//   far-off triangle). We reject when the nearest-endpoint TRAVEL for EITHER wall
//   exceeds both an absolute cap AND a multiple of that wall's own length.
const _JOIN_MAX_TRAVEL_ABS = 8.0;        // metres — a single join never legitimately moves an end this far
const _JOIN_MAX_TRAVEL_RATIO = 3.0;      // travel may not exceed 3× the wall's own length
const _JOIN_ALREADY_JOINED_TOL = 0.01;   // 10 mm — both nearest ends already coincide with the intersection

type _JoinPlausibility =
    | { kind: 'ok' }
    | { kind: 'already-joined' }
    | { kind: 'spike'; message: string };

/**
 * Decide whether moving each wall's NEAREST endpoint to `ix` is a plausible join.
 *
 * Pure XZ-plane arithmetic; no side effects. The travel distance of a wall's
 * nearest endpoint to the intersection is the amount that wall is extended (or
 * trimmed). A legitimate join keeps that travel small relative to the wall; a
 * near-parallel pair yields a far-off `ix` and a huge travel → spike.
 */
function _joinPlausibility(
    blA: [Point3D, Point3D],
    blB: [Point3D, Point3D],
    ix: Point3D,
): _JoinPlausibility {
    const lenA = _distXZ(blA[0], blA[1]);
    const lenB = _distXZ(blB[0], blB[1]);
    const travelA = Math.min(_distXZ(blA[0], ix), _distXZ(blA[1], ix));
    const travelB = Math.min(_distXZ(blB[0], ix), _distXZ(blB[1], ix));

    const isSpike = (travel: number, len: number): boolean =>
        travel > _JOIN_MAX_TRAVEL_ABS && travel > len * _JOIN_MAX_TRAVEL_RATIO;

    if (isSpike(travelA, lenA) || isSpike(travelB, lenB)) {
        const worst = Math.max(travelA, travelB);
        return {
            kind: 'spike',
            message:
                `Join rejected: the walls are too close to parallel — joining would extend a wall by ` +
                `${worst.toFixed(1)} m to a far-off point. Pick two walls that meet at a clear corner.`,
        };
    }

    if (travelA <= _JOIN_ALREADY_JOINED_TOL && travelB <= _JOIN_ALREADY_JOINED_TOL) {
        return { kind: 'already-joined' };
    }

    return { kind: 'ok' };
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
