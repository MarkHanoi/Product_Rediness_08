// MoveSlabHandler — translate every boundary + hole vertex by a
// world-space delta (S12-T2).
//
// Move-by-translation matches PRYZM 1's `MoveCommand` semantics: the
// slab's boundary changes IN PLACE; any cascade (walls along the
// perimeter) flows through the cross-rule.

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

export interface MoveSlabPayload {
  readonly slabId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class MoveSlabHandler implements CommandHandler<MoveSlabPayload, SlabHandlerStores> {
  readonly type = 'slab.move';
  readonly affectedStores = ['slab'] as const;

  canExecute(ctx: HandlerContext<SlabHandlerStores>, cmd: MoveSlabPayload): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: MoveSlabPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);

    const dx = cmd.delta.x, dy = cmd.delta.y, dz = cmd.delta.z;
    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      const s = draft[cmd.slabId];
      if (!s) return;
      for (const p of s.boundary) {
        p.x += dx; p.y += dy; p.z += dz;
      }
      for (const hole of s.holes) {
        for (const p of hole) {
          p.x += dx; p.y += dy; p.z += dz;
        }
      }
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
