// MoveStructuralHandler — S26 / ADR-0026.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StructuralNotFoundError } from '../errors.js';
import type { StructuralsState } from '../store.js';

export interface MoveStructuralPayload {
  readonly structuralId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class MoveStructuralHandler
  implements CommandHandler<MoveStructuralPayload, Stores>
{
  readonly type = 'structural.move';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveStructuralPayload): ValidationResult {
    if (typeof cmd.structuralId !== 'string' || cmd.structuralId.length === 0) {
      return { valid: false, reason: 'structuralId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveStructuralPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (!s) return;
      s.origin.x += cmd.delta.x;
      s.origin.y += cmd.delta.y;
      s.origin.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
