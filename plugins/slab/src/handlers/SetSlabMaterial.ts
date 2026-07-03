// SetSlabMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `slab.setMaterial` handler mirroring the family-uniform shape used
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
import { SlabNotFoundError } from '../errors.js';
import type { SlabsState } from '../store.js';

export interface SetSlabMaterialPayload {
  readonly slabId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class SetSlabMaterialHandler
  implements CommandHandler<SetSlabMaterialPayload, SlabHandlerStores>
{
  readonly type = 'slab.setMaterial';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabMaterialPayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
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
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (!s) return;
      if (cmd.materialId === null) delete s.materialId;
      else if (cmd.materialId !== undefined) s.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) s.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
