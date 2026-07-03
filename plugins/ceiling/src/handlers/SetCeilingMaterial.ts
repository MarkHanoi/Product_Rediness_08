// SetCeilingMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `ceiling.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  Mutates only materialId / materialColor;
// the scene-committer's MATERIAL_FIELDS dirty-check swaps materials on the
// next commit — no builder/committer change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CeilingNotFoundError } from '../errors.js';
import type { CeilingsState } from '../store.js';

export interface SetCeilingMaterialPayload {
  readonly ceilingId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class SetCeilingMaterialHandler
  implements CommandHandler<SetCeilingMaterialPayload, CeilingHandlerStores>
{
  readonly type = 'ceiling.setMaterial';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingMaterialPayload): ValidationResult {
    if (typeof cmd.ceilingId !== 'string' || cmd.ceilingId.length === 0) {
      return { valid: false, reason: 'ceilingId must be a non-empty string' };
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
    if (!ctx.stores.ceiling[cmd.ceilingId]) {
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.ceiling[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);

    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      const c = draft[cmd.ceilingId];
      if (!c) return;
      if (cmd.materialId === null) delete c.materialId;
      else if (cmd.materialId !== undefined) c.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) c.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
