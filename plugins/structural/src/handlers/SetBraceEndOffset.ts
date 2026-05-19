// SetBraceEndOffsetHandler — adjust the second endpoint of a brace (S26).
//
// Only meaningful for `kind === 'brace'`; rejected for the other three
// sub-types so callers can't accidentally make a footing into a line.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StructuralNotFoundError, StructuralDimensionsError } from '../errors.js';
import type { StructuralsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface SetBraceEndOffsetPayload {
  readonly structuralId: string;
  readonly endOffset: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class SetBraceEndOffsetHandler
  implements CommandHandler<SetBraceEndOffsetPayload, Stores>
{
  readonly type = 'structural.setBraceEndOffset';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetBraceEndOffsetPayload): ValidationResult {
    if (!isFiniteVec3(cmd.endOffset)) return { valid: false, reason: 'endOffset must have finite x, y, z' };
    if (cmd.endOffset.x === 0 && cmd.endOffset.y === 0 && cmd.endOffset.z === 0) {
      return { valid: false, reason: 'endOffset must be non-zero' };
    }
    const s = ctx.stores.structural[cmd.structuralId];
    if (!s) return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    if (s.kind !== 'brace') return { valid: false, reason: `setBraceEndOffset only valid for kind=brace (was ${s.kind})` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetBraceEndOffsetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const cur = ctx.stores.structural[cmd.structuralId];
    if (!cur) throw new StructuralNotFoundError(cmd.structuralId);
    if (cur.kind !== 'brace') throw new StructuralDimensionsError(`setBraceEndOffset on kind=${cur.kind}`);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (!s) return;
      s.endOffset = { ...cmd.endOffset };
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
