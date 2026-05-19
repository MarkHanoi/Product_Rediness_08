// SetWallDimensionsHandler — atomic dimension setter (S07-T8).
//
// ADR-008 collapses three PRYZM 1 commands into one (3 → 1):
//   • `UpdateWallDimensionsCommand.ts` (height + thickness)
//   • `SetWallWidthCommand.ts`         (thickness only)
//   • `UpdateWallHeightCommand.ts`     (height only — also cascaded to
//                                       attached doors/windows in PRYZM 1;
//                                       the cascade lifts to L4 cascade
//                                       infra in S10 D6)
//
// All three become a single payload with optional fields.  At least
// one of `height` / `thickness` / `baseOffset` MUST be present, and
// every present value is patched in a single Immer step → one inverse
// patch undoes the entire change.

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

export interface SetWallDimensionsPayload {
  readonly id: string;
  readonly height?: number;
  readonly thickness?: number;
  readonly baseOffset?: number;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class SetWallDimensionsHandler
  implements CommandHandler<SetWallDimensionsPayload, WallHandlerStores>
{
  readonly type = 'wall.setDimensions';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallDimensionsPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (cmd.height === undefined && cmd.thickness === undefined && cmd.baseOffset === undefined) {
      return { valid: false, reason: 'at least one of height / thickness / baseOffset is required' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    if (cmd.baseOffset !== undefined && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: 'baseOffset must be a finite number' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallDimensionsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);
    if (cmd.height !== undefined && cmd.height <= 0) {
      throw new WallDimensionsError('height must be > 0');
    }
    if (cmd.thickness !== undefined && cmd.thickness < 0.05) {
      throw new WallDimensionsError('thickness must be ≥ 0.05 m');
    }
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      if (cmd.height !== undefined) w.height = cmd.height;
      if (cmd.thickness !== undefined) w.thickness = cmd.thickness;
      if (cmd.baseOffset !== undefined) w.baseOffset = cmd.baseOffset;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
