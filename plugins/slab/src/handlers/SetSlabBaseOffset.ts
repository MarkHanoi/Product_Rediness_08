// SetSlabBaseOffsetHandler — change a slab's vertical offset from its
// level base (S12-T2).
//
// The session plan listed `SetSlope` here; the canonical Slab schema
// does NOT model slope yet (planned for 1C).  `baseOffset` is the
// closest existing field — it shifts the entire slab vertically and
// is the only "set"-style thickness/level handler the schema admits
// today.

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

export interface SetSlabBaseOffsetPayload {
  readonly slabId: string;
  readonly baseOffset: number;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class SetSlabBaseOffsetHandler
  implements CommandHandler<SetSlabBaseOffsetPayload, SlabHandlerStores>
{
  readonly type = 'slab.setBaseOffset';
  readonly affectedStores = ['slab'] as const;

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: SetSlabBaseOffsetPayload,
  ): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: 'baseOffset must be a finite number' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: SetSlabBaseOffsetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (s) s.baseOffset = cmd.baseOffset;
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
