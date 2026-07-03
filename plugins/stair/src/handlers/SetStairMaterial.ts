// SetStairMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `stair.setMaterial` handler mirroring the family-uniform shape used
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
import { StairNotFoundError } from '../errors.js';
import type { StairsState } from '../store.js';

export interface SetStairMaterialPayload {
  readonly stairId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class SetStairMaterialHandler
  implements CommandHandler<SetStairMaterialPayload, StairHandlerStores>
{
  readonly type = 'stair.setMaterial';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairMaterialPayload): ValidationResult {
    if (typeof cmd.stairId !== 'string' || cmd.stairId.length === 0) {
      return { valid: false, reason: 'stairId must be a non-empty string' };
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
    if (!ctx.stores.stair[cmd.stairId]) {
      return { valid: false, reason: `stair not found: ${cmd.stairId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: SetStairMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);

    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const s = draft[cmd.stairId];
      if (!s) return;
      if (cmd.materialId === null) delete s.materialId;
      else if (cmd.materialId !== undefined) s.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — stair colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
