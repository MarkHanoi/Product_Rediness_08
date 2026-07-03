// SetRoofMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `roof.setMaterial` handler mirroring the family-uniform shape used
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
import { RoofNotFoundError } from '../errors.js';
import type { RoofsState } from '../store.js';

export interface SetRoofMaterialPayload {
  readonly roofId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class SetRoofMaterialHandler
  implements CommandHandler<SetRoofMaterialPayload, RoofHandlerStores>
{
  readonly type = 'roof.setMaterial';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofMaterialPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
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
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: SetRoofMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);

    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const r = draft[cmd.roofId];
      if (!r) return;
      if (cmd.materialId === null) delete r.materialId;
      else if (cmd.materialId !== undefined) r.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) r.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
