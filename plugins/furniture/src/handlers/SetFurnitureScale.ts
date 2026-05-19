// SetFurnitureScaleHandler — set absolute uniform scale (S27 / ADR-0027).
//
// Uniform per ADR-0027 §1 — non-uniform scale would invalidate the
// per-LOD bounding boxes the carousel previews use as size hints.

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
import { isValidScale } from '../intent.js';

export interface SetFurnitureScalePayload {
  readonly furnitureId: string;
  /** Absolute scalar (positive). */
  readonly scale: number;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class SetFurnitureScaleHandler
  implements CommandHandler<SetFurnitureScalePayload, Stores>
{
  readonly type = 'furniture.setScale';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetFurnitureScalePayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (!isValidScale(cmd.scale)) {
      return { valid: false, reason: 'scale must be > 0 and finite' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetFurnitureScalePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      f.scale = cmd.scale;
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
