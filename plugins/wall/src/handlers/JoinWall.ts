// JoinWallHandler — adjust two walls so they share an endpoint (S10-T3).
//
// Mirrors `src/commands/JoinWallsCommand.ts` (sibling, see phase doc
// §3 line 143).  In PRYZM 1 this command was the hot path that
// CascadeWallBaselineCommand orchestrated; in PRYZM 2 the cascade has
// lifted to L4 (`packages/command-bus/cascade.ts`, S10-T6) and this
// handler is just the single-step "snap A's endpoint to B's endpoint"
// primitive that the cascade may chain.
//
// CONTRACT:
//   • `idA` is the wall that MOVES (its endpoint snaps).
//   • `endpointA` is which end of A snaps — `0` (start) or `1` (end).
//   • The target point comes from `idB.baseLine[endpointB]`.
//   • A's other endpoint is preserved verbatim — only one endpoint
//     moves per call.  Two calls join both ends.
//
// VALIDATION:
//   • Both walls must exist; ids cannot be the same (a wall cannot
//     join to itself).
//   • The post-join planar length of A must clear `MIN_WALL_LEN`
//     (otherwise the join would degenerate A into a point).
//   • Both walls must share the same `levelId` — joining across
//     storeys is a separate operation (`ChangeWallLevel` first, then
//     `JoinWall`) and silently moving A would invalidate refine (2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallDimensionsError, WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export type WallEndpointIndex = 0 | 1;

export interface JoinWallPayload {
  readonly idA: string;
  readonly endpointA: WallEndpointIndex;
  readonly idB: string;
  readonly endpointB: WallEndpointIndex;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const MIN_WALL_LEN = 0.05;

export class JoinWallHandler
  implements CommandHandler<JoinWallPayload, WallHandlerStores>
{
  readonly type = 'wall.join';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: JoinWallPayload,
  ): ValidationResult {
    if (typeof cmd.idA !== 'string' || cmd.idA.length === 0) {
      return { valid: false, reason: 'idA must be a non-empty string' };
    }
    if (typeof cmd.idB !== 'string' || cmd.idB.length === 0) {
      return { valid: false, reason: 'idB must be a non-empty string' };
    }
    if (cmd.idA === cmd.idB) {
      return { valid: false, reason: 'cannot join a wall to itself' };
    }
    if (cmd.endpointA !== 0 && cmd.endpointA !== 1) {
      return { valid: false, reason: 'endpointA must be 0 or 1' };
    }
    if (cmd.endpointB !== 0 && cmd.endpointB !== 1) {
      return { valid: false, reason: 'endpointB must be 0 or 1' };
    }
    const a = ctx.stores.wall[cmd.idA];
    const b = ctx.stores.wall[cmd.idB];
    if (a === undefined) return { valid: false, reason: `wall not found: ${cmd.idA}` };
    if (b === undefined) return { valid: false, reason: `wall not found: ${cmd.idB}` };
    if (a.levelId !== b.levelId) {
      return { valid: false, reason: `walls on different levels (A=${a.levelId}, B=${b.levelId}) — change level first` };
    }
    const target = b.baseLine[cmd.endpointB];
    const fixed = a.baseLine[cmd.endpointA === 0 ? 1 : 0];
    if (Math.hypot(target.x - fixed.x, target.z - fixed.z) < MIN_WALL_LEN) {
      return {
        valid: false,
        reason: `join would shrink wall ${cmd.idA} below ${MIN_WALL_LEN} m`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: JoinWallPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const a = ctx.stores.wall[cmd.idA];
    const b = ctx.stores.wall[cmd.idB];
    if (a === undefined) throw new WallNotFoundError(cmd.idA);
    if (b === undefined) throw new WallNotFoundError(cmd.idB);

    const target = b.baseLine[cmd.endpointB];
    const fixed = a.baseLine[cmd.endpointA === 0 ? 1 : 0];
    if (Math.hypot(target.x - fixed.x, target.z - fixed.z) < MIN_WALL_LEN) {
      throw new WallDimensionsError(
        `wall.join rejected — would shrink ${cmd.idA} below ${MIN_WALL_LEN} m`,
      );
    }

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.idA];
      if (w === undefined) return;
      // Preserve the y of A's endpoint (level elevation) to keep
      // refine (2) satisfied even if B is on a different elevation
      // (defensive — canExecute rejects different levelIds, but the
      // store may differ in y from the level elevation in a stale
      // cascade).
      const moving = w.baseLine[cmd.endpointA];
      const next0 = cmd.endpointA === 0
        ? { x: target.x, y: moving.y, z: target.z }
        : w.baseLine[0];
      const next1 = cmd.endpointA === 1
        ? { x: target.x, y: moving.y, z: target.z }
        : w.baseLine[1];
      w.baseLine = [
        { x: next0.x, y: next0.y, z: next0.z },
        { x: next1.x, y: next1.y, z: next1.z },
      ];
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
