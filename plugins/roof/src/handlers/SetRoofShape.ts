// SetRoofShapeHandler — change a roof's shape (S11-T3).
//
// Flat ↔ pitched is permitted; switching to "flat" forces pitch=0 to
// honour the schema refine.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoofNotFoundError } from '../errors.js';
import type { RoofData, RoofsState } from '../store.js';

export interface SetRoofShapePayload {
  readonly roofId: string;
  readonly shape: RoofData['shape'];
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

const VALID_SHAPES: ReadonlySet<RoofData['shape']> = new Set([
  'flat', 'gable', 'hip', 'mono', 'mansard',
]);

export class SetRoofShapeHandler
  implements CommandHandler<SetRoofShapePayload, RoofHandlerStores>
{
  readonly type = 'roof.setShape';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofShapePayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!VALID_SHAPES.has(cmd.shape)) {
      return { valid: false, reason: `invalid shape: ${cmd.shape}` };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofShapePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const r = draft[cmd.roofId];
      if (!r) return;
      r.shape = cmd.shape;
      if (cmd.shape === 'flat') r.pitch = 0;
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
