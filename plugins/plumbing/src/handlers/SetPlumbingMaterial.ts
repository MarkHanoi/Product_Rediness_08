// SetPlumbingMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `plumbing.setMaterial` handler mirroring the family-uniform shape used
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
import { PlumbingNotFoundError } from '../errors.js';
import type { PlumbingsState } from '../store.js';

export interface SetPlumbingMaterialPayload {
  readonly plumbingId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type PlumbingHandlerStores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class SetPlumbingMaterialHandler
  implements CommandHandler<SetPlumbingMaterialPayload, PlumbingHandlerStores>
{
  readonly type = 'plumbing.setMaterial';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(ctx: HandlerContext<PlumbingHandlerStores>, cmd: SetPlumbingMaterialPayload): ValidationResult {
    if (typeof cmd.plumbingId !== 'string' || cmd.plumbingId.length === 0) {
      return { valid: false, reason: 'plumbingId must be a non-empty string' };
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
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<PlumbingHandlerStores>, cmd: SetPlumbingMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);

    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      const p = draft[cmd.plumbingId];
      if (!p) return;
      if (cmd.materialId === null) delete p.materialId;
      else if (cmd.materialId !== undefined) p.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — plumbing colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
