// RemoveSlabHoleHandler — drop one hole from a slab's `holes[]`
// (S12-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SlabHoleNotFoundError, SlabNotFoundError } from '../errors.js';
import type { SlabsState } from '../store.js';

export interface RemoveSlabHolePayload {
  readonly slabId: string;
  /** Zero-based index into `slab.holes[]`. */
  readonly holeIndex: number;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class RemoveSlabHoleHandler
  implements CommandHandler<RemoveSlabHolePayload, SlabHandlerStores>
{
  readonly type = 'slab.removeHole';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: RemoveSlabHolePayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!Number.isInteger(cmd.holeIndex) || cmd.holeIndex < 0) {
      return { valid: false, reason: 'holeIndex must be a non-negative integer' };
    }
    const slab = ctx.stores.slab[cmd.slabId];
    if (!slab) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    if (cmd.holeIndex >= slab.holes.length) {
      return {
        valid: false,
        reason: `holeIndex ${cmd.holeIndex} is out of range (slab has ${slab.holes.length} hole(s))`,
      };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: RemoveSlabHolePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const slab = ctx.stores.slab[cmd.slabId];
    if (!slab) throw new SlabNotFoundError(cmd.slabId);
    if (cmd.holeIndex >= slab.holes.length) {
      throw new SlabHoleNotFoundError(cmd.slabId, cmd.holeIndex);
    }

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (!s) return;
      s.holes.splice(cmd.holeIndex, 1);
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
