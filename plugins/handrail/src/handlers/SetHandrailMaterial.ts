// SetHandrailMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `handrail.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  The scene-committer's MATERIAL_FIELDS
// dirty-check swaps materials on the next commit — no builder/committer
// change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { HandrailNotFoundError } from '../errors.js';
import type { HandrailsState } from '../store.js';

export interface SetHandrailMaterialPayload {
  readonly handrailId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class SetHandrailMaterialHandler
  implements CommandHandler<SetHandrailMaterialPayload, HandrailHandlerStores>
{
  readonly type = 'handrail.setMaterial';
  readonly affectedStores = ['handrail'] as const;

  canExecute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailMaterialPayload): ValidationResult {
    if (typeof cmd.handrailId !== 'string' || cmd.handrailId.length === 0) {
      return { valid: false, reason: 'handrailId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (cmd.materialId !== undefined && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: 'materialId must be non-empty when provided' };
    }
    if (!ctx.stores.handrail[cmd.handrailId]) {
      return { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: SetHandrailMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);

    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      const h = draft[cmd.handrailId];
      if (!h) return;
      if (cmd.materialId === null) delete h.materialId;
      else if (cmd.materialId !== undefined) h.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — handrail colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
