// SetSlabTypeHandler — change a slab's `systemTypeId` (S12-T2).
//
// No `@pryzm/types-builtin/slab` catalogue exists yet (planned for
// 1C); for now this handler simply records the type id on the DTO so
// downstream cataloguing can read it.  When the catalogue lands, the
// handler will be extended to re-apply defaults (mirroring
// `door.setType`).

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

export interface SetSlabTypePayload {
  readonly slabId: string;
  readonly systemTypeId: string;
  readonly materialId?: string;
  readonly materialColor?: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class SetSlabTypeHandler
  implements CommandHandler<SetSlabTypePayload, SlabHandlerStores>
{
  readonly type = 'slab.setType';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabTypePayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (typeof cmd.systemTypeId !== 'string' || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: 'systemTypeId must be a non-empty string' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (!s) return;
      s.systemTypeId = cmd.systemTypeId;
      if (cmd.materialId !== undefined) s.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) s.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
