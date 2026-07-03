// SetFurnitureMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `furniture.setMaterial` handler mirroring the family-uniform shape used
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
import { FurnitureNotFoundError } from '../errors.js';
import type { FurnituresState } from '../store.js';

export interface SetFurnitureMaterialPayload {
  readonly furnitureId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type FurnitureHandlerStores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class SetFurnitureMaterialHandler
  implements CommandHandler<SetFurnitureMaterialPayload, FurnitureHandlerStores>
{
  readonly type = 'furniture.setMaterial';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<FurnitureHandlerStores>, cmd: SetFurnitureMaterialPayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
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
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<FurnitureHandlerStores>, cmd: SetFurnitureMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);

    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      if (cmd.materialId === null) delete f.materialId;
      else if (cmd.materialId !== undefined) f.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — furniture colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
