// SetWallColorHandler — visual property setter (S07-T8).
//
// Mirrors `src/commands/walls/UpdateWallColorCommand.ts:71` — small,
// no geometry rebuild, just a material-side mutation.  Either
// `materialColor` (hex string) or `materialId` (catalogue reference)
// MUST be present; both may be set in the same call.
//
// Setting `materialId: null` clears the catalogue reference (lets the
// inspector "unbind" a wall from a shared material).  PRYZM 1 used
// `null` here for the same purpose.

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

export interface SetWallColorPayload {
  readonly id: string;
  readonly materialColor?: string;
  /** `null` clears the catalogue binding; `undefined` leaves it untouched. */
  readonly materialId?: string | null;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export class SetWallColorHandler
  implements CommandHandler<SetWallColorPayload, WallHandlerStores>
{
  readonly type = 'wall.setColor';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallColorPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (cmd.materialColor === undefined && cmd.materialId === undefined) {
      return { valid: false, reason: 'at least one of materialColor / materialId is required' };
    }
    if (cmd.materialColor !== undefined && !HEX_COLOR_RE.test(cmd.materialColor)) {
      return { valid: false, reason: 'materialColor must be a #rrggbb hex string' };
    }
    if (
      cmd.materialId !== undefined &&
      cmd.materialId !== null &&
      (typeof cmd.materialId !== 'string' || cmd.materialId.length === 0)
    ) {
      return { valid: false, reason: 'materialId must be a non-empty string or null' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallColorPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      if (cmd.materialColor !== undefined) w.materialColor = cmd.materialColor;
      if (cmd.materialId !== undefined) {
        if (cmd.materialId === null) {
          delete w.materialId;
        } else {
          w.materialId = cmd.materialId;
        }
      }
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
