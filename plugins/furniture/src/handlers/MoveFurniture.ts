// MoveFurnitureHandler — translate origin by Δ (S27 / ADR-0027).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { FurnitureNotFoundError } from '../errors.js';
import type { FurnituresState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface MoveFurniturePayload {
  readonly furnitureId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class MoveFurnitureHandler
  implements CommandHandler<MoveFurniturePayload, Stores>
{
  readonly type = 'furniture.move';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveFurniturePayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (!isFiniteVec3(cmd.delta)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveFurniturePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      f.origin.x += cmd.delta.x;
      f.origin.y += cmd.delta.y;
      f.origin.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
