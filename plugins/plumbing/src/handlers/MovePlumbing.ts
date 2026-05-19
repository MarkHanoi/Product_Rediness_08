// MovePlumbingHandler — S26 / ADR-0026.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { PlumbingNotFoundError } from '../errors.js';
import type { PlumbingsState } from '../store.js';

export interface MovePlumbingPayload {
  readonly plumbingId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class MovePlumbingHandler
  implements CommandHandler<MovePlumbingPayload, Stores>
{
  readonly type = 'plumbing.move';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MovePlumbingPayload): ValidationResult {
    if (typeof cmd.plumbingId !== 'string' || cmd.plumbingId.length === 0) {
      return { valid: false, reason: 'plumbingId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MovePlumbingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      const p = draft[cmd.plumbingId];
      if (!p) return;
      p.origin.x += cmd.delta.x;
      p.origin.y += cmd.delta.y;
      p.origin.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
