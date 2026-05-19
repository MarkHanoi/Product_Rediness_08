// SetStructuralKindHandler — change brace/footing/foundation-slab/connection (S26).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StructuralNotFoundError } from '../errors.js';
import type { StructuralData, StructuralsState } from '../store.js';

const KINDS: ReadonlySet<string> = new Set([
  'brace', 'footing', 'foundation-slab', 'connection',
]);

export interface SetStructuralKindPayload {
  readonly structuralId: string;
  readonly kind: StructuralData['kind'];
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class SetStructuralKindHandler
  implements CommandHandler<SetStructuralKindPayload, Stores>
{
  readonly type = 'structural.setKind';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetStructuralKindPayload): ValidationResult {
    if (!KINDS.has(cmd.kind as string)) return { valid: false, reason: `unknown kind: ${cmd.kind}` };
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetStructuralKindPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (s) s.kind = cmd.kind;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
