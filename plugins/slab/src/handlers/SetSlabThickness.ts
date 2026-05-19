// SetSlabThicknessHandler — change a slab's thickness (S12-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SlabNotFoundError, SlabThicknessError } from '../errors.js';
import type { SlabsState } from '../store.js';

export interface SetSlabThicknessPayload {
  readonly slabId: string;
  readonly thickness: number;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class SetSlabThicknessHandler
  implements CommandHandler<SetSlabThicknessPayload, SlabHandlerStores>
{
  readonly type = 'slab.setThickness';
  readonly affectedStores = ['slab'] as const;

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: SetSlabThicknessPayload,
  ): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0) {
      return { valid: false, reason: 'thickness must be a finite number > 0' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabThicknessPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
    if (cmd.thickness <= 0) throw new SlabThicknessError(cmd.thickness);

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (s) s.thickness = cmd.thickness;
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
