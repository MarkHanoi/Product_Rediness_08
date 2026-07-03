// SetCurtainWallMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `curtainwall.setMaterial` handler mirroring the family-uniform shape
// used across every element family.  The scene-committer's MATERIAL_FIELDS
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
import { CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';

export interface SetCurtainWallMaterialPayload {
  readonly curtainWallId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type CurtainWallHandlerStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallMaterialHandler
  implements CommandHandler<SetCurtainWallMaterialPayload, CurtainWallHandlerStores>
{
  readonly type = 'curtainwall.setMaterial';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CurtainWallHandlerStores>, cmd: SetCurtainWallMaterialPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
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
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain-wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CurtainWallHandlerStores>, cmd: SetCurtainWallMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);

    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const cw = draft[cmd.curtainWallId];
      if (!cw) return;
      if (cmd.materialId === null) delete cw.materialId;
      else if (cmd.materialId !== undefined) cw.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — curtain-wall colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
