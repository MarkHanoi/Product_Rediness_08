// ChangeWallLevelHandler — move a wall between storeys (S10-T4).
//
// Mirrors `src/commands/walls/ChangeWallLevelCommand.ts:102`.  Single
// store mutation: rewrite `levelId` and rebase `baseLine.y` to match
// the new level's elevation so the schema's refine (2)
// ("baseLine endpoints must share the same y") stays satisfied.
//
// At S10 there is no `LevelStore` in PRYZM 2 yet (lands in 1C — see
// `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`
// §3.D).  Until then the caller supplies the new level id AND the
// new elevation directly — the LevelStore-driven variant arrives in
// 1C as an internal handler refactor (the public payload shape is
// stable: `{ id, newLevelId, newElevationY }`).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export interface ChangeWallLevelPayload {
  readonly id: string;
  readonly newLevelId: string;
  readonly newElevationY: number;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class ChangeWallLevelHandler
  implements CommandHandler<ChangeWallLevelPayload, WallHandlerStores>
{
  readonly type = 'wall.changeLevel';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: ChangeWallLevelPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (typeof cmd.newLevelId !== 'string' || cmd.newLevelId.length === 0) {
      return { valid: false, reason: 'newLevelId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.newElevationY)) {
      return { valid: false, reason: 'newElevationY must be a finite number' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: ChangeWallLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      w.levelId = cmd.newLevelId;
      const [a, b] = w.baseLine;
      w.baseLine = [
        { x: a.x, y: cmd.newElevationY, z: a.z },
        { x: b.x, y: cmd.newElevationY, z: b.z },
      ];
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
