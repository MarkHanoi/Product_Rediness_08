// SetRoofPitchHandler — change roof pitch in radians (S11-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  RoofNotFoundError,
  RoofPitchOutOfRangeError,
  RoofShapeMismatchError,
} from '../errors.js';
import type { RoofsState } from '../store.js';

export interface SetRoofPitchPayload {
  readonly roofId: string;
  readonly pitch: number;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

const MAX_PITCH = Math.PI / 2 - 0.001;

export class SetRoofPitchHandler
  implements CommandHandler<SetRoofPitchPayload, RoofHandlerStores>
{
  readonly type = 'roof.setPitch';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofPitchPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.pitch) || cmd.pitch < 0 || cmd.pitch > MAX_PITCH) {
      return { valid: false, reason: `pitch must be in [0, ${MAX_PITCH.toFixed(4)}]` };
    }
    const r = ctx.stores.roof[cmd.roofId];
    if (!r) return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    if (r.shape === 'flat' && cmd.pitch !== 0) {
      return { valid: false, reason: 'flat roof must keep pitch=0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofPitchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const r = ctx.stores.roof[cmd.roofId];
    if (!r) throw new RoofNotFoundError(cmd.roofId);
    if (cmd.pitch < 0 || cmd.pitch > MAX_PITCH) {
      throw new RoofPitchOutOfRangeError(cmd.pitch);
    }
    if (r.shape === 'flat' && cmd.pitch !== 0) {
      throw new RoofShapeMismatchError(r.shape, cmd.pitch);
    }
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const d = draft[cmd.roofId];
      if (d) d.pitch = cmd.pitch;
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
