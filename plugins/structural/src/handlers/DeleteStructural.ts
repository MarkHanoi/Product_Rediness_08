// DeleteStructuralHandler — S26 / ADR-0026.

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

export interface DeleteStructuralPayload {
  readonly structuralId: string;
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class DeleteStructuralHandler
  implements CommandHandler<DeleteStructuralPayload, Stores>
{
  readonly type = 'structural.delete';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteStructuralPayload): ValidationResult {
    if (typeof cmd.structuralId !== 'string' || cmd.structuralId.length === 0) {
      return { valid: false, reason: 'structuralId must be a non-empty string' };
    }
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteStructuralPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      delete draft[cmd.structuralId];
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
