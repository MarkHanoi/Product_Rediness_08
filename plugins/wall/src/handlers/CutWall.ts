// CutWallHandler — split one wall into two at a point along its
// baseline (S10-T4).
//
// Mirrors `src/commands/CutWallCommand.ts` (sibling, see phase doc
// §3 line 144).  The cut atomically:
//   1) deletes the original wall,
//   2) inserts two fresh walls (`leftId`, `rightId`) sharing the
//      same level / height / thickness / colour / system-type but
//      with split baselines.
//
// CUT POINT: supplied as a 3D point `at`.  We project the point onto
// the wall's baseline (XZ plane) and clamp to the open interval
// `(MIN_WALL_LEN, length - MIN_WALL_LEN)` so both halves remain
// non-degenerate.  Cuts that fall outside that interval are rejected
// at `canExecute` time.
//
// OPENINGS: any opening straddling the cut point is REJECTED at
// `canExecute` time (PRYZM 1's behaviour — UI prompts the user to
// move the opening first; the new handler surfaces the offending
// opening id in the rejection reason).  Openings entirely before /
// after the cut migrate to the appropriate half (offsets re-based
// for the right half).
//
// IDS:  `leftId` / `rightId` may be supplied (deterministic tests);
// otherwise both are minted via `createId('wall')`.  The ORIGINAL
// wall id is removed from the store — a `CutWall` followed by an
// undo restores the original id; the two split ids vanish.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  WallDimensionsError,
  WallNotFoundError,
  WallSystemError,
} from '../errors.js';
import type { WallData, WallsState } from '../store.js';

export interface CutWallPayload {
  readonly id: string;
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  readonly leftId?: string;
  readonly rightId?: string;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const MIN_WALL_LEN = 0.05;

export class WallCutOpeningStraddleError extends WallSystemError {
  public readonly openingIds: readonly string[];
  constructor(message: string, openingIds: readonly string[]) {
    super(message, 'WallCutOpeningStraddleError');
    this.openingIds = openingIds;
  }
}

/** Project a 3D point onto a wall baseline.  Returns the parametric
 *  position `t ∈ [0, len]` (metres along the baseline from a→b). */
function projectOntoBaseline(
  wall: WallData,
  p: { x: number; z: number },
): { t: number; len: number } {
  const [a, b] = wall.baseLine;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { t: 0, len: 0 };
  const ux = dx / len;
  const uz = dz / len;
  const vx = p.x - a.x;
  const vz = p.z - a.z;
  // Dot product → distance along the baseline.
  const t = vx * ux + vz * uz;
  return { t, len };
}

export class CutWallHandler
  implements CommandHandler<CutWallPayload, WallHandlerStores>
{
  readonly type = 'wall.cut';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: CutWallPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (
      typeof cmd.at?.x !== 'number' || !Number.isFinite(cmd.at.x) ||
      typeof cmd.at?.z !== 'number' || !Number.isFinite(cmd.at.z)
    ) {
      return { valid: false, reason: 'at.{x,z} must be finite numbers' };
    }
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) return { valid: false, reason: `wall not found: ${cmd.id}` };

    const { t, len } = projectOntoBaseline(wall, cmd.at);
    if (len < MIN_WALL_LEN * 2) {
      return { valid: false, reason: `wall ${cmd.id} too short to cut (len=${len.toFixed(4)} m)` };
    }
    if (t <= MIN_WALL_LEN || t >= len - MIN_WALL_LEN) {
      return {
        valid: false,
        reason: `cut point ${t.toFixed(4)} m outside cuttable interval (${MIN_WALL_LEN}, ${(len - MIN_WALL_LEN).toFixed(4)}) m`,
      };
    }
    // Reject straddling openings.
    const straddling: string[] = [];
    for (const op of wall.openings ?? []) {
      const start = op.offset;
      const end = op.offset + op.width;
      if (start < t && end > t) straddling.push(op.id);
    }
    if (straddling.length > 0) {
      return {
        valid: false,
        reason: `opening(s) straddle the cut point: ${straddling.join(', ')}`,
      };
    }
    if (cmd.leftId !== undefined && (typeof cmd.leftId !== 'string' || cmd.leftId.length === 0)) {
      return { valid: false, reason: 'leftId must be a non-empty string when supplied' };
    }
    if (cmd.rightId !== undefined && (typeof cmd.rightId !== 'string' || cmd.rightId.length === 0)) {
      return { valid: false, reason: 'rightId must be a non-empty string when supplied' };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: CutWallPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);

    const { t, len } = projectOntoBaseline(wall, cmd.at);
    if (len < MIN_WALL_LEN * 2 || t <= MIN_WALL_LEN || t >= len - MIN_WALL_LEN) {
      throw new WallDimensionsError(
        `wall.cut rejected — cut point ${t.toFixed(4)} m outside cuttable interval`,
      );
    }
    // Race-defensive opening straddle re-check.
    const straddling: string[] = [];
    for (const op of wall.openings ?? []) {
      if (op.offset < t && op.offset + op.width > t) straddling.push(op.id);
    }
    if (straddling.length > 0) {
      throw new WallCutOpeningStraddleError(
        `wall.cut rejected — opening(s) straddle cut point: ${straddling.join(', ')}`,
        straddling,
      );
    }

    const [a, b] = wall.baseLine;
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const cutPoint = {
      x: a.x + ux * t,
      y: a.y,
      z: a.z + uz * t,
    };

    const leftId = cmd.leftId ?? createId('wall');
    const rightId = cmd.rightId ?? createId('wall');
    if (leftId === rightId) {
      throw new WallDimensionsError('wall.cut rejected — leftId === rightId');
    }
    if (leftId === cmd.id || rightId === cmd.id) {
      throw new WallDimensionsError(
        'wall.cut rejected — leftId / rightId must differ from the source id',
      );
    }

    // Partition openings.  Opening offset is measured from a; for the
    // right half we re-base offsets by `t`.
    const leftOpenings: WallData['openings'] = [];
    const rightOpenings: WallData['openings'] = [];
    const leftChildren: string[] = [];
    const rightChildren: string[] = [];
    const sharedChildren = new Set((wall.childrenIds ?? []).map((c) => c));
    for (const op of wall.openings ?? []) {
      if (op.offset + op.width <= t) {
        leftOpenings.push(op);
        leftChildren.push(op.elementId);
      } else {
        rightOpenings.push({ ...op, offset: op.offset - t });
        rightChildren.push(op.elementId);
      }
      sharedChildren.delete(op.elementId);
    }
    // Any childrenIds that aren't openings (none in 1B but shape is
    // forward-compat for nested fixtures) attach to the left half by
    // convention; an explicit caller-side migration is the long-term
    // story (1C+).
    for (const c of sharedChildren) leftChildren.push(c);

    const leftWall: WallData = {
      ...wall,
      id: leftId as WallData['id'],
      baseLine: [
        { x: a.x, y: a.y, z: a.z },
        { x: cutPoint.x, y: cutPoint.y, z: cutPoint.z },
      ],
      openings: leftOpenings,
      childrenIds: leftChildren,
    };
    const rightWall: WallData = {
      ...wall,
      id: rightId as WallData['id'],
      baseLine: [
        { x: cutPoint.x, y: cutPoint.y, z: cutPoint.z },
        { x: b.x, y: b.y, z: b.z },
      ],
      openings: rightOpenings,
      childrenIds: rightChildren,
    };

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      delete draft[cmd.id];
      draft[leftId] = leftWall;
      draft[rightId] = rightWall;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
