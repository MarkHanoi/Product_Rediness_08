// RotateFurnitureHandler — set absolute Y-rotation (S27 / ADR-0027).
//
// Absolute (not delta) so the carousel + transform gizmo can both
// dispatch the same command shape without tracking previous state.

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

export interface RotateFurniturePayload {
  readonly furnitureId: string;
  /** Absolute Y-rotation in radians. */
  readonly rotation: number;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class RotateFurnitureHandler
  implements CommandHandler<RotateFurniturePayload, Stores>
{
  readonly type = 'furniture.rotate';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RotateFurniturePayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (typeof cmd.rotation !== 'number' || !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be a finite number' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RotateFurniturePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      f.rotation = cmd.rotation;
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
