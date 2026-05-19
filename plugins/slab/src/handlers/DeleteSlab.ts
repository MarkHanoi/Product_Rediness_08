// DeleteSlabHandler — remove a slab (S12-T2).

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

export interface DeleteSlabPayload {
  readonly slabId: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class DeleteSlabHandler implements CommandHandler<DeleteSlabPayload, SlabHandlerStores> {
  readonly type = 'slab.delete';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: DeleteSlabPayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: DeleteSlabPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      delete draft[cmd.slabId];
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
