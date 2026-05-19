// SetStructuralMaterialHandler — assign material (S26).

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

export interface SetStructuralMaterialPayload {
  readonly structuralId: string;
  readonly materialId?: string;
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class SetStructuralMaterialHandler
  implements CommandHandler<SetStructuralMaterialPayload, Stores>
{
  readonly type = 'structural.setMaterial';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetStructuralMaterialPayload): ValidationResult {
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetStructuralMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (!s) return;
      s.materialId = cmd.materialId;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
