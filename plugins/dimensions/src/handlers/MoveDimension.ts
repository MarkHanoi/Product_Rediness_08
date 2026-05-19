// MoveDimensionHandler — S29 / ADR-0028.
//
// Translates EVERY reference point by `delta` (the witness lines move
// in lockstep so the dimension's measurement stays unchanged).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DimensionNotFoundError } from '../errors.js';
import type { DimensionsState } from '../store.js';

export interface MoveDimensionPayload {
  readonly dimensionId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ dimension: DimensionsState } & Record<string, unknown>>;

export class MoveDimensionHandler
  implements CommandHandler<MoveDimensionPayload, Stores>
{
  readonly type = 'dimension.move';
  readonly affectedStores = ['dimension'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveDimensionPayload): ValidationResult {
    if (typeof cmd.dimensionId !== 'string' || cmd.dimensionId.length === 0) {
      return { valid: false, reason: 'dimensionId must be a non-empty string' };
    }
    if (!cmd.delta
        || !Number.isFinite(cmd.delta.x)
        || !Number.isFinite(cmd.delta.y)
        || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveDimensionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
    const [next, forward, inverse] = produceCommand<DimensionsState>(ctx.stores.dimension, (draft) => {
      const d = draft[cmd.dimensionId];
      if (!d) return;
      for (const p of d.points) {
        p.x += cmd.delta.x;
        p.y += cmd.delta.y;
        p.z += cmd.delta.z;
      }
    });
    return { forward, inverse, nextStates: { dimension: next } };
    }); // withHandlerSpan — C10 §2
  }
}
