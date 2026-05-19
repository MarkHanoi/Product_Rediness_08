// SetRoofOverhangHandler — change eave overhang in metres (S11-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoofNotFoundError } from '../errors.js';
import type { RoofsState } from '../store.js';

export interface SetRoofOverhangPayload {
  readonly roofId: string;
  readonly overhang: number;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class SetRoofOverhangHandler
  implements CommandHandler<SetRoofOverhangPayload, RoofHandlerStores>
{
  readonly type = 'roof.setOverhang';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofOverhangPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.overhang) || cmd.overhang < 0) {
      return { valid: false, reason: 'overhang must be ≥ 0' };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofOverhangPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const d = draft[cmd.roofId];
      if (d) d.overhang = cmd.overhang;
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
