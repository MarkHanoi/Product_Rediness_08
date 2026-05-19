// AddSlabHoleHandler — append a hole loop to a slab's `holes[]`
// (S12-T2).
//
// Spec maps "AddOpening" → slab holes (skylight / shaft cutouts).
// The schema models holes as `Vec3[]` loops; we validate each loop is
// a non-degenerate open polygon before accepting.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SlabBoundaryError, SlabNotFoundError } from '../errors.js';
import { validateSlabBoundary } from '../intent.js';
import type { SlabData, SlabsState } from '../store.js';

export interface AddSlabHolePayload {
  readonly slabId: string;
  readonly hole: SlabData['holes'][number];
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class AddSlabHoleHandler
  implements CommandHandler<AddSlabHolePayload, SlabHandlerStores>
{
  readonly type = 'slab.addHole';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: AddSlabHolePayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    const v = validateSlabBoundary(cmd.hole);
    if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid hole' };
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: AddSlabHolePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
    const v = validateSlabBoundary(cmd.hole);
    if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid hole');

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (!s) return;
      s.holes.push(cmd.hole.map((p) => ({ x: p.x, y: p.y, z: p.z })));
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
